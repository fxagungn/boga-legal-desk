// MLA · ULA · PKS · PSM (blueprint §6).
import { query } from "../db";

export type AgrKind = "MLA" | "ULA" | "PKS" | "PSM";
export const AGR_KINDS: AgrKind[] = ["MLA", "ULA", "PKS", "PSM"];
export const AGR_LABEL: Record<AgrKind, string> = {
  MLA: "MLA (Master)", ULA: "ULA (per outlet)", PKS: "PKS (Kerja Sama)", PSM: "PSM (Sewa Menyewa)",
};
export const AGR_LONG: Record<AgrKind, string> = {
  MLA: "Master License Agreement", ULA: "Unit License Agreement", PKS: "Perjanjian Kerja Sama", PSM: "Perjanjian Sewa Menyewa",
};
export const AGR_RULE: Record<AgrKind, string> = {
  MLA: "Satu MLA per brand berprincipal — hanya Kimukatsu, Shaburi Kintan, dan Yakiniku Like. Brand milik sendiri tidak memiliki MLA maupun ULA. Notifikasi pada ambang notice renewal di perjanjian, bukan pada tanggal berakhir.",
  ULA: "Satu ULA per outlet brand berprincipal; jumlah ULA aktif harus sama dengan jumlah outlet aktif brand itu. ULA menunjuk MLA induk dan tidak boleh berakhir melewatinya. Nilai dalam USD/SGD.",
  PKS: "Perjanjian vendor / jasa / supply korporat dalam Rupiah. Perhatikan termination clause dan notice period.",
  PSM: "Satu PSM per outlet dengan pengelola mal sebagai lessor. Perhatikan skema sewa, service charge, dan opsi perpanjangan.",
};

export interface AgreementRow {
  id: number; code: string; kind: AgrKind; parent_id: number | null; parent_code: string | null; parent_end: string | null;
  brand_id: number | null; brand: string | null; unit_id: number | null; unit_name: string | null;
  title: string; counterparty: string | null; principal: string | null; territory: string | null; location: string | null; city: string | null;
  nature: string | null; scheme: string | null; start_date: string | null; end_date: string | null; days: number | null; notice_days: number | null;
  notice_days_left: number | null; tenor: string | null; currency: string; value: string | null; unit_fee: string | null; royalty_pct: string | null;
  fx_ref: string | null; termination_clause: string | null; renewal_option: string | null; file_url: string | null;
  pic_id: number | null; pic_name: string | null; status: string; is_demo: boolean; note_count: number; updated_at: string; updated_by: string | null;
}

const COLS = `a.id, a.code, a.kind, a.parent_id, p.code as parent_code, to_char(p.end_date,'YYYY-MM-DD') as parent_end,
  a.brand_id, b.name as brand, a.unit_id, u.name as unit_name, a.title, a.counterparty, a.principal, a.territory, a.location, a.city,
  a.nature, a.scheme, to_char(a.start_date,'YYYY-MM-DD') as start_date, to_char(a.end_date,'YYYY-MM-DD') as end_date,
  (a.end_date - (now() at time zone 'Asia/Jakarta')::date)::int as days, a.notice_days,
  (a.end_date - coalesce(a.notice_days,0) - (now() at time zone 'Asia/Jakarta')::date)::int as notice_days_left,
  a.tenor, a.currency, a.value::text, a.unit_fee::text, a.royalty_pct::text, a.fx_ref, a.termination_clause, a.renewal_option, a.file_url,
  a.pic_id, m.name as pic_name, a.status, a.is_demo,
  (select count(*)::int from notes n where n.entity = 'agreement' and n.entity_id = a.id) as note_count, a.updated_at, a.updated_by`;
const FROM = `from agreements a left join agreements p on p.id = a.parent_id left join brands b on b.id = a.brand_id
  left join units u on u.id = a.unit_id left join team_members m on m.id = a.pic_id`;

export const listAgreements = () => query<AgreementRow>(`select ${COLS} ${FROM} order by a.kind, a.end_date nulls last, a.code`);
export const getAgreementByCode = async (code: string) =>
  (await query<AgreementRow>(`select ${COLS} ${FROM} where upper(a.code) = upper($1)`, [code]))[0] ?? null;

/** Chip for agreements (§6.3): lewat merah solid · ≤60 merah muda · ≤180 amber · aman abu-hijau. */
export function agrChip(days: number | null): { text: string; cls: string } {
  if (days === null) return { text: "—", cls: "bg-mute-bg text-ink-2" };
  if (days < 0) return { text: `Lewat ${-days}h`, cls: "bg-brand text-white" };
  if (days <= 60) return { text: `H-${days}`, cls: "bg-[#fde7e9] text-[#a5161f]" };
  if (days <= 180) return { text: `H-${days}`, cls: "bg-[#fff4e2] text-[#8a5a0b]" };
  return { text: `H-${days}`, cls: "bg-[#f0f3f1] text-[#3f5a4d]" };
}

export interface AgrAlert { code: string; level: "bad" | "warn"; text: string }

/** Validator (§6.3): ULA vs active outlets per principal brand, ULA beyond its MLA, notice window open. */
export async function agreementAlerts(rows?: AgreementRow[]): Promise<AgrAlert[]> {
  const all = rows ?? (await listAgreements());
  const out: AgrAlert[] = [];
  const brands = await query<{ id: number; name: string; outlets: number }>(
    `select b.id, b.name, (select count(*)::int from units u where u.brand_id = b.id and u.scope = 'outlet' and u.status = 'aktif') as outlets
     from brands b where b.has_principal and b.active order by b.name`,
  );
  for (const b of brands) {
    const ula = all.filter((a) => a.kind === "ULA" && a.brand_id === b.id && a.status === "aktif" && (a.days ?? 0) >= 0).length;
    if (ula < b.outlets) out.push({ code: b.name, level: "bad", text: `${b.name}: ${b.outlets} outlet aktif, baru ${ula} ULA berlaku — ${b.outlets - ula} outlet beroperasi tanpa lisensi unit.` });
    const mla = all.filter((a) => a.kind === "MLA" && a.brand_id === b.id && a.status === "aktif");
    if (mla.length === 0) out.push({ code: b.name, level: "bad", text: `${b.name}: belum ada MLA aktif.` });
    if (mla.length > 1) out.push({ code: b.name, level: "warn", text: `${b.name}: ada ${mla.length} MLA aktif — seharusnya satu per brand.` });
  }
  for (const a of all) {
    if (a.kind === "ULA" && a.parent_end && a.end_date && a.end_date > a.parent_end) {
      out.push({ code: a.code, level: "warn", text: `${a.code} berakhir ${a.end_date}, melewati MLA induk ${a.parent_code} (${a.parent_end}).` });
    }
    if (a.status === "aktif" && a.notice_days && a.notice_days_left !== null && a.notice_days_left <= 0 && (a.days ?? 0) >= 0) {
      out.push({ code: a.code, level: "warn", text: `${a.code}: jendela notice ${a.notice_days} hari sudah terbuka — keputusan perpanjangan perlu diambil sekarang.` });
    }
  }
  return out;
}

export async function nextAgreementCode(kind: AgrKind) {
  const r = await query<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from agreements where kind = $1`, [kind]);
  return `${kind}-${String(r[0].n).padStart(3, "0")}`;
}
