// Global search rows for the Dashboard (blueprint §12.1): every module, with the text people search on.
import { query } from "../db";
import { listAgreements } from "./agreements";
import { listPunishments, PNS_STATUS } from "./discipline";
import { listInspections, listKb, listLibrary } from "./history";
import { inWindow, listPermits, needsAck, RENEWAL_LABEL, shortName } from "./permits";

export interface SearchRow {
  module: "Perizinan" | "Agreement" | "Pengajuan Sanksi" | "Yurisprudensi" | "Pemeriksaan" | "Library";
  code: string;
  title: string;
  sub: string;
  meta: string;
  days: number | null;
  href: string;
  somasi: boolean;
  noAck: boolean;
  belum: boolean;
  text: string;
}

export async function searchRows(): Promise<SearchRow[]> {
  const [permits, agreements, pns, kb, ins, lib, notes] = await Promise.all([
    listPermits(), listAgreements(), listPunishments(), listKb(), listInspections(), listLibrary(),
    query<{ entity: string; entity_id: number; body: string }>(`select entity, entity_id, body from notes`),
  ]);
  const noteText = new Map<string, string>();
  for (const n of notes) noteText.set(`${n.entity}:${n.entity_id}`, `${noteText.get(`${n.entity}:${n.entity_id}`) ?? ""} ${n.body}`);
  const rows: SearchRow[] = [];
  for (const p of permits) {
    rows.push({
      module: "Perizinan", code: p.code, title: p.type_name, sub: `${p.unit_name}${p.number ? ` · ${p.number}` : ""} · PIC Legal ${shortName(p.pic_name)}`,
      meta: inWindow(p) ? RENEWAL_LABEL[p.renewal_status] : "Aktif", days: p.days, href: `/perizinan?pic=all&d=${p.code}`,
      somasi: p.requires_ack, noAck: needsAck(p), belum: inWindow(p) && p.renewal_status === "belum",
      text: [p.code, p.type_name, p.unit_name, p.number, p.pic_name, p.brand, p.city, p.mall, p.somasi_text, noteText.get(`permit:${p.id}`)].filter(Boolean).join(" "),
    });
  }
  for (const a of agreements) {
    rows.push({
      module: "Agreement", code: a.code, title: a.title, sub: [a.counterparty, a.location, a.city].filter(Boolean).join(" · "), meta: a.kind, days: a.days,
      href: `/perjanjian?tab=${a.kind}&d=${a.code}`, somasi: false, noAck: false, belum: false,
      text: [a.code, a.title, a.counterparty, a.principal, a.location, a.city, a.brand, a.scheme, a.termination_clause, noteText.get(`agreement:${a.id}`)].filter(Boolean).join(" "),
    });
  }
  for (const p of pns) {
    rows.push({
      module: "Pengajuan Sanksi", code: p.code, title: `${p.matrix_code} — ${p.sub_category ?? ""}`, sub: `${p.unit_name ?? "-"} · ${p.submitter_fn} · ${p.occurrence}`,
      meta: PNS_STATUS[p.status]?.label ?? p.status, days: null, href: `/sanksi#${p.code}`, somasi: false, noAck: false, belum: p.status === "legal" || p.status === "hr",
      text: [p.code, p.matrix_code, p.sub_category, p.unit_name, p.submitter_fn, p.description, p.final].filter(Boolean).join(" "),
    });
  }
  for (const k of kb) {
    rows.push({
      module: "Yurisprudensi", code: k.code, title: k.title, sub: [k.unit_label, k.matrix_code, k.sanction].filter(Boolean).join(" · "), meta: k.category ?? "", days: null,
      href: `/kb#${k.code}`, somasi: false, noAck: false, belum: false,
      text: [k.code, k.title, k.unit_label, k.matrix_code, k.category, k.summary, k.chronology, k.investigation, k.reasoning, k.sanction].filter(Boolean).join(" "),
    });
  }
  for (const i of ins) {
    const due = i.next_expected ? Math.round((Date.parse(i.next_expected) - Date.now()) / 86_400_000) : null;
    rows.push({
      module: "Pemeriksaan", code: i.code, title: `${i.agency} — ${i.kind ?? ""}`, sub: `${i.unit_name ?? "-"} · ${i.insp_date}`, meta: i.result, days: due,
      href: `/pemeriksaan#${i.code}`, somasi: false, noAck: false, belum: false,
      text: [i.code, i.agency, i.kind, i.unit_name, i.result, i.findings, i.follow_up, i.consequence].filter(Boolean).join(" "),
    });
  }
  for (const l of lib) {
    rows.push({
      module: "Library", code: l.code, title: l.title, sub: [l.kind, l.parties].filter(Boolean).join(" · "), meta: l.doc_date ?? "", days: null,
      href: `/pustaka#${l.code}`, somasi: false, noAck: false, belum: false,
      text: [l.code, l.kind, l.title, l.parties, l.core, l.key_points, l.outcome].filter(Boolean).join(" "),
    });
  }
  return rows;
}
