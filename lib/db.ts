import { neon } from "@neondatabase/serverless";

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

const SCHEMA_VERSION = 5;

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
  // v4: merge placeholder team members duplicated by a concurrent first-run seed.
  `update documents d set assignee_id = k.keep
     from (select id, min(id) over (partition by name, role) as keep from team_members where email is null and whatsapp is null) k
     where d.assignee_id = k.id and k.id <> k.keep`,
  `delete from team_members t
     using (select id, min(id) over (partition by name, role) as keep from team_members where email is null and whatsapp is null) k
     where t.id = k.id and k.id <> k.keep`,
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
      await attachDemoDrafts();
      await q.query(
        `insert into app_settings (key, value) values ('schema_version', $1::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(SCHEMA_VERSION)],
      );
    })().catch((e) => {
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  subjectKeywords: ["[LEGAL]"],
  cpoThreshold: 1_000_000_000,
  holidays: ["2026-12-24", "2026-12-25", "2027-01-01"],
  escalateAfterDays: 1,
  digestEnabled: true,
};

export async function getSettings(): Promise<AppSettings> {
  const row = await one<{ value: Partial<AppSettings> }>(`select value from app_settings where key = 'app'`);
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const next = { ...(await getSettings()), ...patch };
  await query(
    `insert into app_settings (key, value) values ('app', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(next)],
  );
  return next;
}

export async function getKV<T>(key: string): Promise<T | null> {
  const row = await one<{ value: T }>(`select value from app_settings where key = $1`, [key]);
  return row?.value ?? null;
}

export async function setKV(key: string, value: unknown) {
  await query(
    `insert into app_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/* ---------- seed ---------- */

/** v5: give demo documents a draft PDF so the preview has something to show. */
async function attachDemoDrafts() {
  const q = raw();
  const docs = (await q.query(
    `select d.id, d.code, d.title, d.counterparty, d.summary, d.key_points from documents d
     where d.is_demo and not exists (select 1 from attachments a where a.document_id = d.id)`,
  )) as { id: number; code: string; title: string; counterparty: string | null; summary: string | null; key_points: string[] }[];
  if (!docs.length) return;
  const { demoContract } = await import("./pdf");
  const { createHash } = await import("node:crypto");
  for (const d of docs) {
    const pdf = demoContract({ ...d, points: d.key_points ?? [] });
    await q.query(
      `insert into attachments (document_id, filename, content_type, size, sha256, data)
       values ($1, $2, 'application/pdf', $3, $4, decode($5, 'base64')) on conflict do nothing`,
      [d.id, `Draft ${d.title}.pdf`, pdf.byteLength, createHash("sha256").update(pdf).digest("hex"), Buffer.from(pdf).toString("base64")],
    );
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
    ["Chief People Officer", "cpo"],
  ];
  const ids: number[] = [];
  for (const [name, role] of team) {
    const r = (await q.query(`insert into team_members (name, role) values ($1, $2) returning id`, [name, role])) as { id: number }[];
    ids.push(r[0].id);
  }

  if (process.env.SEED_DEMO === "false") return;

  const now = Date.now();
  const d = (days: number) => new Date(now + days * 86_400_000);
  const date = (days: number) => d(days).toISOString().slice(0, 10);
  const demo = [
    { title: "Perjanjian Supply Daging Sapi 2027", type: "vendor", cp: "PT Sumber Protein Nusantara", value: 4_800_000_000, dl: 4, stage: "mgr_approval", entered: -3.2, risk: "high", urgent: true, who: 0, summary: "Kontrak pasokan daging sapi untuk seluruh outlet selama 2027 dengan mekanisme penyesuaian harga per kuartal.", points: ["Penyesuaian harga kuartalan tanpa batas atas", "Denda keterlambatan pasokan hanya 0,1%/hari", "Eksklusivitas pemasok untuk wilayah Jabodetabek"] },
    { title: "Perjanjian Lisensi Merek Kopi", type: "principal", cp: "Bean Origin Holdings Pte. Ltd.", value: 12_000_000_000, dl: 20, stage: "negotiation", entered: -2, risk: "high", urgent: false, who: 1, summary: "Lisensi penggunaan merek dan resep untuk 25 gerai baru, termasuk royalti 6% dari penjualan bersih.", points: ["Target pembukaan 25 gerai dalam 24 bulan", "Hukum yang berlaku: Singapura", "Terminasi sepihak oleh prinsipal bila target tidak tercapai"] },
    { title: "Kontrak Jasa Kebersihan Outlet", type: "vendor", cp: "CV Bersih Selalu", value: 360_000_000, dl: 12, stage: "review", entered: -4.5, risk: "low", urgent: false, who: 0, summary: "Jasa kebersihan harian untuk 18 outlet dengan masa kontrak 12 bulan.", points: ["Perpanjangan otomatis 12 bulan", "Tidak ada klausul asuransi tanggung gugat"] },
    { title: "Addendum Sewa Mesin Espresso", type: "vendor", cp: "PT Mesin Seduh Indonesia", value: 220_000_000, dl: 30, stage: "intake", entered: -0.3, risk: "medium", urgent: false, who: null, summary: "Addendum penambahan 10 unit mesin dan perubahan biaya servis.", points: ["Biaya servis naik 15%"] },
    { title: "Perjanjian Distribusi Saus Prinsipal Jepang", type: "principal", cp: "Kaneda Foods Co., Ltd.", value: 2_500_000_000, dl: -1, stage: "agm_approval", entered: -2.6, risk: "medium", urgent: true, who: 1, summary: "Penunjukan distributor eksklusif saus dan bumbu untuk pasar Indonesia.", points: ["Minimum order tahunan", "Wajib registrasi BPOM oleh distributor"] },
    { title: "Kontrak Software POS", type: "vendor", cp: "PT Kasir Digital", value: 950_000_000, dl: 9, stage: "signing", entered: -1, risk: "medium", urgent: false, who: 0, summary: "Langganan sistem POS 3 tahun untuk semua brand.", points: ["Data pelanggan disimpan di luar negeri", "SLA uptime 99,5%"] },
    { title: "NDA Kerja Sama Pemasok Kemasan", type: "other", cp: "PT Kemasan Hijau", value: null, dl: null, stage: "review", entered: -1.5, risk: "low", urgent: false, who: 1, summary: "NDA dua arah sebelum diskusi kemasan ramah lingkungan.", points: [] },
  ];

  for (const [i, x] of demo.entries()) {
    const code = `LGL-${new Date().getFullYear()}-${String(i + 1).padStart(4, "0")}`;
    await q.query(`select nextval('doc_code_seq')`);
    const r = (await q.query(
      `insert into documents (code, title, doc_type, counterparty, contract_value, deadline, urgent, risk_level, stage, assignee_id,
        requester_name, requester_email, summary, key_points, source, stage_entered_at, last_activity_at, created_at, is_demo, normalized_subject)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,'email',$15,$15,$16,true,$17) returning id`,
      [
        code, x.title, x.type, x.cp, x.value, x.dl === null ? null : date(x.dl), x.urgent, x.risk, x.stage,
        x.who === null ? null : ids[x.who], "Tim Procurement", "procurement@contoh.co.id", x.summary, JSON.stringify(x.points),
        d(x.entered), d(x.entered - 6), x.title.toLowerCase(),
      ],
    )) as { id: number }[];
    await q.query(
      `insert into events (document_id, type, actor, message, created_at) values ($1, 'created', 'Sistem', 'Dibuat dari email (data contoh)', $2)`,
      [r[0].id, d(x.entered - 6)],
    );
    await q.query(
      `insert into emails (document_id, message_id, subject, from_name, from_email, received_at, body_text, source)
       values ($1, $2, $3, 'Tim Procurement', 'procurement@contoh.co.id', $4, $5, 'demo')`,
      [r[0].id, `demo-${code}@legal-desk`, `[LEGAL][${x.type === "principal" ? "PRINSIPAL" : "VENDOR"}] ${x.title} - ${x.cp}`, d(x.entered - 6), `Dear Tim Legal,\n\nMohon review untuk ${x.title} dengan ${x.cp}.\n\n${x.summary}\n\nTerima kasih.`],
    );
  }
}
