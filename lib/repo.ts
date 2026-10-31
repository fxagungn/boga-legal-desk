import { cookies } from "next/headers";
import { one, query } from "./db";
import type { DocRow } from "./insight";
import { SESSION_COOKIE, verifySession } from "./auth";
import type { Role } from "./workflow";

export interface Member {
  id: number;
  name: string;
  role: Role;
  email: string | null;
  whatsapp: string | null;
  active: boolean;
  title?: string | null;
  nik?: string | null;
  must_change_password?: boolean;
  has_password?: boolean;
  last_login_at?: string | Date | null;
}

export interface EventRow {
  id: number;
  document_id: number;
  type: string;
  actor: string | null;
  from_stage: string | null;
  to_stage: string | null;
  message: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | Date;
}

export interface EmailRow {
  id: number;
  document_id: number;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_list: string | null;
  cc_list: string | null;
  received_at: string | Date;
  body_text: string | null;
  source: string;
}

export interface AttachmentRow {
  id: number;
  document_id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string | Date;
}

const DOC_COLUMNS = `d.id, d.code, d.title, d.doc_type, d.counterparty, d.contract_value, d.currency,
  to_char(d.deadline, 'YYYY-MM-DD') as deadline, d.urgent, d.risk_level, d.skip_stages, d.require_cpo, d.stage, d.status, d.hold_reason,
  d.assignee_id, m.name as assignee_name, d.requester_name, d.requester_email, d.summary, d.key_points, d.ai_suggestion,
  d.source, d.stage_entered_at, d.hold_started_at, d.paused_ms, d.last_activity_at, d.completed_at, d.is_demo, d.created_at`;

export async function listDocuments(opts: { includeClosed?: boolean } = {}): Promise<DocRow[]> {
  return query<DocRow>(
    `select ${DOC_COLUMNS} from documents d left join team_members m on m.id = d.assignee_id
     ${opts.includeClosed ? "" : "where d.status in ('active','on_hold')"}
     order by d.created_at desc`,
  );
}

export async function getDocument(id: number): Promise<DocRow | null> {
  return one<DocRow>(`select ${DOC_COLUMNS} from documents d left join team_members m on m.id = d.assignee_id where d.id = $1`, [id]);
}

export async function listEvents(docId: number) {
  return query<EventRow>(`select * from events where document_id = $1 order by created_at desc, id desc`, [docId]);
}

export async function listEventsFor(docIds: number[]) {
  if (!docIds.length) return [] as EventRow[];
  return query<EventRow>(`select * from events where document_id = any($1::int[]) order by created_at asc, id asc`, [docIds]);
}

export async function listEmails(docId: number) {
  return query<EmailRow>(
    `select id, document_id, subject, from_name, from_email, to_list, cc_list, received_at, body_text, source
     from emails where document_id = $1 order by received_at desc`,
    [docId],
  );
}

export async function listAttachments(docId: number) {
  return query<AttachmentRow>(
    `select id, document_id, filename, content_type, size, created_at from attachments where document_id = $1 order by created_at desc`,
    [docId],
  );
}

export async function listMembers(activeOnly = false) {
  return query<Member>(`select id, name, role, email, whatsapp, active, title, nik, must_change_password, password_hash is not null as has_password, last_login_at from team_members ${activeOnly ? "where active" : ""} order by
    case role when 'staff' then 1 when 'manager' then 2 when 'agm' then 3 when 'cpo' then 4 else 5 end, name`);
}

export async function getMember(id: number) {
  return one<Member>(`select id, name, role, email, whatsapp, active, title, nik, must_change_password, password_hash is not null as has_password, last_login_at from team_members where id = $1`, [id]);
}

export async function logEvent(docId: number, e: { type: string; actor?: string | null; from?: string | null; to?: string | null; message?: string | null; meta?: unknown }) {
  await query(
    `insert into events (document_id, type, actor, from_stage, to_stage, message, meta) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [docId, e.type, e.actor ?? null, e.from ?? null, e.to ?? null, e.message ?? null, e.meta === undefined ? null : JSON.stringify(e.meta)],
  );
}

export async function nextCode(): Promise<string> {
  const r = await one<{ n: string }>(`select nextval('doc_code_seq')::text as n`);
  return `LGL-${new Date().getFullYear()}-${String(r!.n).padStart(4, "0")}`;
}

/** Least-loaded active staff member. */
export async function pickAssignee(): Promise<number | null> {
  const r = await one<{ id: number }>(
    `select m.id from team_members m
     left join documents d on d.assignee_id = m.id and d.status in ('active','on_hold')
     where m.active and m.role = 'staff'
     group by m.id order by count(d.id) asc, m.id asc limit 1`,
  );
  return r?.id ?? null;
}

/** The currently signed-in member, or null. */
export async function currentMember(): Promise<Member | null> {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const m = await getMember(s.m);
  return m && m.active ? m : null;
}

export const canBypassMaintenance = (m: Member) => ["manager", "agm", "admin"].includes(m.role);

/** Signed-in member allowed to change data (blocks first-login and maintenance). */
export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) throw new Error("Sesi berakhir, silakan masuk lagi.");
  if (m.must_change_password) throw new Error("Ganti password Anda terlebih dahulu.");
  const { getSettings } = await import("./db");
  const s = await getSettings();
  if (s.maintenance && !canBypassMaintenance(m)) throw new Error("Legal Desk sedang maintenance. Coba lagi nanti.");
  return m;
}
