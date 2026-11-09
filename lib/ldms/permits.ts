// Permit registry: status rules (blueprint §5.3) and data access.
import { one, query } from "../db";
import type { Member } from "../repo";

export type Scope = "outlet" | "central_kitchen" | "korporat";
export type RenewalStatus = "belum" | "proses" | "submitted";
export type TimeStatus = "overdue" | "today" | "d7" | "d30" | "d60" | "safe" | "nodate";

export const SCOPE_LABEL: Record<Scope, string> = { outlet: "Outlet", central_kitchen: "Central Kitchen", korporat: "Korporat" };

export const RENEWAL_LABEL: Record<RenewalStatus, string> = {
  belum: "Belum diproses",
  proses: "On progress",
  submitted: "Submitted ke instansi",
};
export const RENEWAL_STEPS: RenewalStatus[] = ["belum", "proses", "submitted"];

export const TIME_LABEL: Record<TimeStatus, string> = {
  overdue: "Overdue",
  today: "Hari ini",
  d7: "≤ 7 hari",
  d30: "≤ 30 hari",
  d60: "≤ 60 hari",
  safe: "Aman",
  nodate: "Tanpa tanggal",
};

/** Chip colours (LDMS design): overdue/today solid red · ≤7 pink · ≤30 amber · ≤60 yellow · safe grey-green. */
export const TIME_CHIP: Record<TimeStatus, string> = {
  overdue: "bg-brand text-white",
  today: "bg-brand text-white",
  d7: "bg-[#fde7e9] text-[#a5161f]",
  d30: "bg-[#fff4e2] text-[#8a5a0b]",
  d60: "bg-[#fffbe8] text-[#6b5c10]",
  safe: "bg-[#f0f3f1] text-[#3f5a4d]",
  nodate: "bg-mute-bg text-ink-2",
};

export function timeStatus(days: number | null): TimeStatus {
  if (days === null) return "nodate";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "d7";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "safe";
}

/** "Overdue 43h", "Hari ini", "H-12" — the countdown chip text used across LDMS. */
export function daysText(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `Overdue ${-days}h`;
  if (days === 0) return "Hari ini";
  return `H-${days}`;
}

/** Renewal reminder ladder from the lead time: H-lead, H-lead/2, H-7, H-1 (blueprint §5.7). */
export function stagesFor(lead: number): number[] {
  const L = lead || 30;
  const s = [L];
  if (L > 14) s.push(Math.round(L / 2));
  if (L > 7) s.push(7);
  if (L > 2) s.push(1);
  return [...new Set(s)].sort((a, b) => b - a);
}

export interface PermitRow {
  id: number;
  code: string;
  unit_id: number;
  unit_code: string;
  unit_name: string;
  scope: Scope;
  city: string | null;
  mall: string | null;
  brand: string | null;
  type_id: number;
  type_code: string;
  type_name: string;
  agency: string | null;
  lead_days: number;
  validity_years: string | null;
  est_cost: string | null;
  blocker_note: string | null;
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  days: number | null;
  renewal_status: RenewalStatus;
  renewal_eta: string | null;
  pic_id: number | null;
  pic_name: string | null;
  cost_actual: string | null;
  requires_ack: boolean;
  somasi_text: string | null;
  somasi_at: string | null;
  somasi_by: string | null;
  ack_by: string | null;
  ack_at: string | null;
  ack_via: string | null;
  note_count: number;
  file_count: number;
  is_demo: boolean;
  updated_at: string;
  updated_by: string | null;
}

/** In the renewal window = on or past H-lead. */
export const inWindow = (p: Pick<PermitRow, "days" | "lead_days">) => p.days !== null && p.days <= p.lead_days;
/** Somasi raised and not yet acknowledged. */
export const needsAck = (p: Pick<PermitRow, "requires_ack" | "ack_at">) => p.requires_ack && !p.ack_at;

const COLUMNS = `p.id, p.code, p.unit_id, u.code as unit_code, u.name as unit_name, u.scope, u.city, u.mall, b.name as brand,
  t.id as type_id, t.code as type_code, t.name as type_name, t.agency, t.lead_days, t.validity_years::text, t.est_cost::text, t.blocker_note,
  p.number, to_char(p.issue_date, 'YYYY-MM-DD') as issue_date, to_char(p.expiry_date, 'YYYY-MM-DD') as expiry_date,
  (p.expiry_date - (now() at time zone 'Asia/Jakarta')::date)::int as days,
  p.renewal_status, to_char(p.renewal_eta, 'YYYY-MM-DD') as renewal_eta, p.pic_id, m.name as pic_name, p.cost_actual::text,
  p.requires_ack, p.somasi_text, p.somasi_at, p.somasi_by, p.ack_by, p.ack_at, p.ack_via,
  (select count(*)::int from notes n where n.entity = 'permit' and n.entity_id = p.id) as note_count,
  (select count(*)::int from files f where f.entity = 'permit' and f.entity_id = p.id) as file_count,
  p.is_demo, p.updated_at, p.updated_by`;

const FROM = `from permits p join units u on u.id = p.unit_id join permit_types t on t.id = p.permit_type_id
  left join brands b on b.id = u.brand_id left join team_members m on m.id = p.pic_id`;

export async function listPermits(): Promise<PermitRow[]> {
  return query<PermitRow>(`select ${COLUMNS} ${FROM} where u.status = 'aktif' order by p.expiry_date asc nulls last, p.id`);
}

export async function getPermit(id: number): Promise<PermitRow | null> {
  return one<PermitRow>(`select ${COLUMNS} ${FROM} where p.id = $1`, [id]);
}

export async function getPermitByCode(code: string): Promise<PermitRow | null> {
  return one<PermitRow>(`select ${COLUMNS} ${FROM} where upper(p.code) = upper($1)`, [code]);
}

export async function nextPermitCode(): Promise<string> {
  const r = await one<{ n: string }>(`select nextval('permit_code_seq')::text as n`);
  return `D${String(r!.n).padStart(4, "0")}`;
}

export interface UnitRow { id: number; code: string; name: string; scope: Scope; brand: string | null; city: string | null }
export async function listUnits(): Promise<UnitRow[]> {
  return query<UnitRow>(`select u.id, u.code, u.name, u.scope, b.name as brand, u.city from units u left join brands b on b.id = u.brand_id where u.status = 'aktif' order by u.scope, b.name nulls last, u.name`);
}

export interface PermitTypeRow { id: number; code: string; name: string; scope: Scope; lead_days: number; validity_years: string | null; agency: string | null; est_cost: string | null }
export async function listPermitTypes(): Promise<PermitTypeRow[]> {
  return query<PermitTypeRow>(`select id, code, name, scope, lead_days, validity_years::text, agency, est_cost::text from permit_types where active order by sort, name`);
}

export async function listBrands() {
  return query<{ id: number; name: string }>(`select id, name from brands where active order by name`);
}

/* ---------- shared: notes, files, audit, reminders ---------- */

export interface NoteRow { id: number; body: string; by_name: string; created_at: string }
export const listNotes = (entity: string, id: number) =>
  query<NoteRow>(`select id, body, by_name, created_at from notes where entity = $1 and entity_id = $2 order by created_at desc, id desc`, [entity, id]);

export interface FileRow { id: number; filename: string; content_type: string; size: number; uploaded_by: string | null; created_at: string }
export const listFiles = (entity: string, id: number) =>
  query<FileRow>(`select id, filename, content_type, size, uploaded_by, created_at from files where entity = $1 and entity_id = $2 order by created_at desc`, [entity, id]);

export interface AuditRow { id: number; at: string; actor: string | null; action: string; detail: string | null }
export const listAudit = (entity: string, id: number | string, limit = 30) =>
  query<AuditRow>(`select id, at, actor, action, detail from audit_log where entity = $1 and entity_id = $2 order by at desc, id desc limit $3`, [entity, String(id), limit]);

export interface ReminderRow { id: number; stage: string; to_list: string | null; cc_list: string | null; status: string; sent_at: string }
export const listReminders = (entity: string, id: number) =>
  query<ReminderRow>(`select id, stage, to_list, cc_list, status, sent_at from reminders where entity = $1 and entity_id = $2 order by sent_at desc limit 20`, [entity, id]);

export interface PeriodRow { id: number; number: string | null; issue_date: string | null; expiry_date: string | null; closed_at: string; closed_by: string | null }
export const listPeriods = (permitId: number) =>
  query<PeriodRow>(`select id, number, to_char(issue_date,'YYYY-MM-DD') as issue_date, to_char(expiry_date,'YYYY-MM-DD') as expiry_date, closed_at, closed_by from permit_periods where permit_id = $1 order by closed_at desc`, [permitId]);

export async function audit(me: Pick<Member, "id" | "name"> | null, action: string, entity: string, entityId: number | string, detail?: string | null) {
  await query(`insert into audit_log (member_id, actor, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6)`,
    [me?.id ?? null, me?.name ?? "Sistem", action, entity, String(entityId), detail ?? null]);
  // Every audited write is mirrored to the LDMS_DB spreadsheet in Google Drive (after the response).
  void (await import("../drive")).scheduleMirror();
}

/* ---------- permissions ---------- */

/** Staff edit only the permits they hold; everyone else in Legal can edit all. */
export const canEditPermit = (me: Member, p: Pick<PermitRow, "pic_id">) => me.role !== "staff" || p.pic_id === me.id;
/** Raising / lifting a somasi is a supervisor-level decision. */
export const canManageSomasi = (me: Member) => me.role !== "staff";

/** "J Dola Sinulingga" → "J Dola", "Destika Nurhayati" → "Destika". */
export const shortName = (n?: string | null) => {
  if (!n) return "—";
  const w = n.split(/\s+/).filter(Boolean);
  return w[0].length <= 2 && w[1] ? `${w[0]} ${w[1]}` : w[0];
};
