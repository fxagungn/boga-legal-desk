import { neon } from "@neondatabase/serverless";
import { DEFAULT_WORKFLOWS, type Workflows } from "./workflow";
import { LDMS_MIGRATION } from "./ldms/schema";
import { LDMS_MIGRATION_V9 } from "./ldms/schema2";
import { LDMS_MIGRATION_V11 } from "./ldms/schema3";

export const hasDb = () => Boolean(dbUrl());
const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || "";

interface Client { query: (text: string, params?: unknown[]) => Promise<unknown[]> }
let client: Client | null = null;

/** Neon's HTTP driver for Neon URLs (fast on serverless); node-postgres for any other Postgres (Supabase, local). */
function raw(): Client {
  if (!client) {
    const url = dbUrl();
    if (!url) throw new Error("DATABASE_URL belum diset");
    if (/neon\.tech|neon\.build/.test(url)) {
      const n = neon(url);
      client = { query: (t, p = []) => n.query(t, p) as Promise<unknown[]> };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      const pool = new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
      client = { query: async (t, p = []) => (await pool.query(t, p as unknown[])).rows };
    }
  }
  return client;
}

const SCHEMA_VERSION = 11;

const MIGRATION = [
  `create table if not exists app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now())`,
  `create table if not exists team_members (
    id serial primary key,
    name text not null,
    role text not null check (role in ('staff','manager','agm','cpo','admin')),
    email text,
    whatsapp text,
    active boolean not null default true,
    created_at timestamptz not null default now()
  )`,
  `create sequence if not exists doc_code_seq`,
  `create table if not exists documents (
    id serial primary key,
    code text unique not null,
    title text not null,
    doc_type text not null default 'vendor' check (doc_type in ('vendor','principal','other')),
    counterparty text,
    contract_value numeric,
    currency text not null default 'IDR',
    deadline date,
    urgent boolean not null default false,
    risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
    require_cpo boolean,
    stage text not null default 'intake',
    status text not null default 'active' check (status in ('active','on_hold','done','cancelled')),
    hold_reason text,
    assignee_id int references team_members(id) on delete set null,
    requester_name text,
    requester_email text,
    summary text,
    key_points jsonb not null default '[]',
    ai_suggestion jsonb,
    source text not null default 'manual',
    thread_key text,
    normalized_subject text,
    stage_entered_at timestamptz not null default now(),
    hold_started_at timestamptz,
    paused_ms bigint not null default 0,
    last_activity_at timestamptz not null default now(),
    completed_at timestamptz,
    is_demo boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists documents_thread_idx on documents(thread_key)`,
  `create index if not exists documents_subject_idx on documents(normalized_subject)`,
  `create index if not exists documents_status_idx on documents(status)`,
  `create table if not exists emails (
    id serial primary key,
    document_id int references documents(id) on delete cascade,
    message_id text unique,
    graph_id text,
    thread_key text,
    subject text,
    from_name text,
    from_email text,
    to_list text,
    cc_list text,
    received_at timestamptz not null default now(),
    body_text text,
    source text not null default 'manual',
    created_at timestamptz not null default now()
  )`,
  `create index if not exists emails_doc_idx on emails(document_id)`,
  `create index if not exists emails_thread_idx on emails(thread_key)`,
  `create table if not exists attachments (
    id serial primary key,
    document_id int not null references documents(id) on delete cascade,
    email_id int references emails(id) on delete set null,
    filename text not null,
    content_type text not null default 'application/octet-stream',
    size int not null default 0,
    sha256 text not null,
    data bytea,
    created_at timestamptz not null default now(),
    unique (document_id, sha256)
  )`,
  `create table if not exists events (
    id serial primary key,
    document_id int not null references documents(id) on delete cascade,
    type text not null,
    actor text,
    from_stage text,
    to_stage text,
    message text,
    meta jsonb,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists events_doc_idx on events(document_id, created_at desc)`,
  `create table if not exists notifications (
    id serial primary key,
    document_id int references documents(id) on delete cascade,
    channel text not null,
    recipient text not null,
    kind text not null,
    dedupe_key text unique,
    status text not null default 'sent',
    error text,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists ingest_log (
    id serial primary key,
    source text not null,
    subject text,
    from_email text,
    outcome text not null,
    document_id int references documents(id) on delete set null,
    detail text,
    created_at timestamptz not null default now()
  )`,
  `alter table team_members add column if not exists title text`,
  // v7: NIK login, configurable workflows, per-document skipped steps
  `alter table team_members add column if not exists nik text`,
  `create unique index if not exists team_members_nik_idx on team_members (upper(nik))`,
  `alter table team_members add column if not exists password_hash text`,
  `alter table team_members add column if not exists must_change_password boolean not null default true`,
  `alter table team_members add column if not exists failed_logins int not null default 0`,
  `alter table team_members add column if not exists locked_until timestamptz`,
  `alter table team_members add column if not exists last_login_at timestamptz`,
  `alter table documents drop constraint if exists documents_doc_type_check`,
  `alter table documents add column if not exists skip_stages jsonb not null default '[]'`,
  // v4: merge placeholder team members duplicated by a concurrent first-run seed.
  `update documents d set assignee_id = k.keep
     from (select id, min(id) over (partition by name, role) as keep from team_members where email is null and whatsapp is null) k
     where d.assignee_id = k.id and k.id <> k.keep`,
  `delete from team_members t
     using (select id, min(id) over (partition by name, role) as keep from team_members where email is null and whatsapp is null) k
     where t.id = k.id and k.id <> k.keep`,
  // v8: LDMS (perizinan, catatan, file, reminder, audit)
  ...LDMS_MIGRATION,
  // v9: agreements, matrix & punishment, KB, inspections, library, AI log, chat, Drive index, super admin
  ...LDMS_MIGRATION_V9,
  // v11: Cases, SIGAP, employee cache for access cohorts, KB from cases
  ...LDMS_MIGRATION_V11,
];

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const q = raw();
      try {
        const rows = (await q.query(`select value from app_settings where key = 'schema_version'`)) as { value: number }[];
        if (rows[0] && Number(rows[0].value) >= SCHEMA_VERSION) return;
      } catch {
        /* table does not exist yet */
      }
      for (const stmt of MIGRATION) await q.query(stmt);
      await seedIfEmpty();
      await applyTeamRoster();
      await (await import("./ldms/seed")).seedLdms(q);
      const s2 = await import("./ldms/seed2");
      await s2.seedOutlets2026(q);
      await s2.seedDemoV2(q);
      await q.query(
        `insert into app_settings (key, value) values ('schema_version', $1::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(SCHEMA_VERSION)],
      );
    })()
      .then(() => applyCredentialSeed())
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

/** Run a parameterised query after making sure the schema exists. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  return (await raw().query(text, params)) as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/* ---------- settings ---------- */

export interface AppSettings {
  subjectKeywords: string[];
  cpoThreshold: number;
  holidays: string[];
  escalateAfterDays: number;
  digestEnabled: boolean;
  workflows: Workflows;
  /** UAT: banner on every page, notifications go only to uatRecipient, new documents are marked as test data. */
  uatMode: boolean;
  uatRecipient: string;
  /** Maintenance: only Manager/AGM/Admin can use the app. */
  maintenance: boolean;
  maintenanceMessage: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  subjectKeywords: ["[LEGAL]"],
  cpoThreshold: 1_000_000_000,
  holidays: ["2026-12-24", "2026-12-25", "2027-01-01"],
  escalateAfterDays: 1,
  digestEnabled: true,
  workflows: DEFAULT_WORKFLOWS,
  uatMode: false,
  uatRecipient: "",
  maintenance: false,
  maintenanceMessage: "Legal Desk sedang dalam perbaikan dan akan segera kembali.",
};

export async function getSettings(): Promise<AppSettings> {
  const v = { ...DEFAULT_SETTINGS, ...((await getKV<Partial<AppSettings>>("app")) ?? {}) };
  if (!Array.isArray(v.workflows) || v.workflows.length === 0) v.workflows = DEFAULT_WORKFLOWS;
  return v;
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const next = { ...(await getSettings()), ...patch };
  await setKV("app", next);
  return next;
}

// Settings (access matrix, cohorts, flows …) are read on every page. Keep them in memory for a few seconds per
// server instance so a page load does not pay one database round trip per setting. Writes clear the entry at once.
const KV_TTL = 15_000;
const kvCache = new Map<string, { at: number; value: unknown }>();

export async function getKV<T>(key: string): Promise<T | null> {
  const hit = kvCache.get(key);
  if (hit && Date.now() - hit.at < KV_TTL) return hit.value as T | null;
  const row = await one<{ value: T }>(`select value from app_settings where key = $1`, [key]);
  const value = row?.value ?? null;
  kvCache.set(key, { at: Date.now(), value });
  return value;
}

export async function setKV(key: string, value: unknown) {
  await query(
    `insert into app_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
  kvCache.delete(key);
}

/* ---------- seed ---------- */

/**
 * NIK + initial password (hash of the birth date, DDMMYYYY) for the Legal team.
 * Comes from the LEGAL_TEAM_SEED env var so no personal data lives in the repo.
 * Only touches NIKs that are not in the table yet: fills an existing member matched by name,
 * or creates the member when the entry carries a role (e.g. an extra trial/admin account).
 */
async function applyCredentialSeed() {
  const raw_ = process.env.LEGAL_TEAM_SEED;
  if (!raw_) return;
  let seed: { name: string; nik: string; hash: string | null; role?: string; title?: string; email?: string }[] = [];
  try {
    seed = JSON.parse(raw_);
  } catch {
    console.error("LEGAL_TEAM_SEED is not valid JSON");
    return;
  }
  const q = raw();
  const have = new Set(((await q.query(`select upper(nik) as nik from team_members where nik is not null`)) as { nik: string }[]).map((r) => r.nik));
  const roles = ["staff", "supervisor", "manager", "agm", "cpo", "admin"];
  for (const s of seed) {
    const nik = String(s.nik ?? "").trim().toUpperCase();
    if (!nik || have.has(nik)) continue;
    const upd = (await q.query(
      `update team_members set nik = $2, password_hash = coalesce(password_hash, $3), must_change_password = true
       where lower(name) = lower($1) and nik is null returning id`,
      [s.name, nik, s.hash],
    )) as unknown[];
    if (upd.length === 0 && s.role && roles.includes(s.role)) {
      await q.query(
        `insert into team_members (name, role, title, email, nik, password_hash, must_change_password, active)
         values ($1, $2, $3, $4, $5, $6, true, true) on conflict do nothing`,
        [s.name, s.role, s.title ?? null, s.email ?? null, nik, s.hash],
      );
    }
  }
}

/** v6: replace placeholder accounts with the real Legal team (one-time; later edits happen in Pengaturan). */
async function applyTeamRoster() {
  const q = raw();
  const lock = (await q.query(
    `insert into app_settings (key, value) values ('team_roster_v1', 'true'::jsonb) on conflict (key) do nothing returning key`,
  )) as unknown[];
  if (lock.length === 0) return;
  const { LEGAL_TEAM, PLACEHOLDER_MAP } = await import("./team");
  const ids = new Map<string, number>();
  for (const m of LEGAL_TEAM) {
    const existing = (await q.query(`select id from team_members where lower(name) = lower($1) limit 1`, [m.name])) as { id: number }[];
    if (existing[0]) {
      await q.query(`update team_members set role=$2, email=coalesce(email,$3), title=$4, active=true where id=$1`, [existing[0].id, m.role, m.email, m.title]);
      ids.set(m.name, existing[0].id);
    } else {
      const r = (await q.query(`insert into team_members (name, role, email, title) values ($1,$2,$3,$4) returning id`, [m.name, m.role, m.email, m.title])) as { id: number }[];
      ids.set(m.name, r[0].id);
    }
  }
  // Hand documents held by placeholder accounts to their real counterpart, then remove the placeholders.
  for (const [placeholder, real] of Object.entries(PLACEHOLDER_MAP)) {
    const to = ids.get(real);
    if (!to) continue;
    await q.query(
      `update documents set assignee_id = $1 where assignee_id in (select id from team_members where name = $2 and email is null)`,
      [to, placeholder],
    );
    await q.query(`delete from team_members where name = $1 and email is null and whatsapp is null`, [placeholder]);
  }
}

async function seedIfEmpty() {
  const q = raw();
  // Only one instance may seed, even when several cold-start at once.
  const lock = (await q.query(
    `insert into app_settings (key, value) values ('seed_lock', 'true'::jsonb) on conflict (key) do nothing returning key`,
  )) as unknown[];
  if (lock.length === 0) return;
  const members = (await q.query(`select count(*)::int as n from team_members`)) as { n: number }[];
  if (members[0].n > 0) return;

  const team: [string, string][] = [
    ["Staff Legal 1", "staff"],
    ["Staff Legal 2", "staff"],
    ["Manager Legal", "manager"],
    ["AGM Legal", "agm"],
    ["CPLO", "cpo"],
  ];
  const ids: number[] = [];
  for (const [name, role] of team) {
    const r = (await q.query(`insert into team_members (name, role) values ($1, $2) returning id`, [name, role])) as { id: number }[];
    ids.push(r[0].id);
  }
}
