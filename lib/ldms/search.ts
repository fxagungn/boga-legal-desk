// Global search rows for the Dashboard: every module the user may view, with the text people search on.
import { query } from "../db";
import type { Module } from "../access";
import { listAgreements } from "./agreements";
import { CASE_STATUS, listCases } from "./cases";
import { listInspections, listKb, listLibrary } from "./history";
import { inWindow, listPermits, needsAck, RENEWAL_LABEL, shortName } from "./permits";
import { listSigap } from "./sigap";

export const SEARCH_MODULES = ["Permit", "Perjanjian", "Pemeriksaan", "Cases", "SIGAP", "Repository", "Knowledge Base"] as const;

export interface SearchRow {
  module: (typeof SEARCH_MODULES)[number];
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

const none = <T,>(): Promise<T[]> => Promise.resolve([]);

export async function searchRows(canView: (m: Module) => boolean): Promise<SearchRow[]> {
  const [permits, agreements, cases, sigap, kb, ins, lib, notes] = await Promise.all([
    canView("permit") ? listPermits() : none<Awaited<ReturnType<typeof listPermits>>[number]>(),
    canView("agreement") ? listAgreements() : none<Awaited<ReturnType<typeof listAgreements>>[number]>(),
    canView("cases") ? listCases() : none<Awaited<ReturnType<typeof listCases>>[number]>(),
    canView("sigap") ? listSigap() : none<Awaited<ReturnType<typeof listSigap>>[number]>(),
    canView("kb") ? listKb() : none<Awaited<ReturnType<typeof listKb>>[number]>(),
    canView("inspection") ? listInspections() : none<Awaited<ReturnType<typeof listInspections>>[number]>(),
    canView("library") ? listLibrary() : none<Awaited<ReturnType<typeof listLibrary>>[number]>(),
    query<{ entity: string; entity_id: number; body: string }>(`select entity, entity_id, body from notes`),
  ]);
  const noteText = new Map<string, string>();
  for (const n of notes) noteText.set(`${n.entity}:${n.entity_id}`, `${noteText.get(`${n.entity}:${n.entity_id}`) ?? ""} ${n.body}`);
  const rows: SearchRow[] = [];
  const base = { somasi: false, noAck: false, belum: false };
  for (const p of permits) {
    rows.push({
      module: "Permit", code: p.code, title: p.type_name, sub: `${p.unit_name} · PIC ${shortName(p.pic_name)}`,
      meta: inWindow(p) ? RENEWAL_LABEL[p.renewal_status] : "Aktif", days: p.days, href: `/perizinan?pic=all&d=${p.code}`,
      somasi: p.requires_ack, noAck: needsAck(p), belum: inWindow(p) && p.renewal_status === "belum",
      text: [p.code, p.type_name, p.unit_name, p.number, p.pic_name, p.brand, p.city, p.mall, p.somasi_text, noteText.get(`permit:${p.id}`)].filter(Boolean).join(" "),
    });
  }
  for (const a of agreements) {
    if (a.kind === "PSM") continue;
    rows.push({
      ...base, module: "Perjanjian", code: a.code, title: a.title, sub: [a.counterparty, a.location].filter(Boolean).join(" · "), meta: a.kind, days: a.days,
      href: `/perjanjian?tab=${a.kind}&d=${a.code}`,
      text: [a.code, a.title, a.counterparty, a.principal, a.location, a.city, a.brand, a.termination_clause, noteText.get(`agreement:${a.id}`)].filter(Boolean).join(" "),
    });
  }
  for (const c of cases) {
    rows.push({
      ...base, module: "Cases", code: c.code, title: c.title, sub: `${c.category} · ${c.unit_name ?? "-"}`, meta: CASE_STATUS[c.status], days: null,
      href: `/cases?s=semua&d=${c.code}`, belum: c.status !== "selesai",
      text: [c.code, c.title, c.category, c.unit_name, c.counterparty, c.forum, c.chronology, c.root_cause_cat, c.root_cause, c.decision, c.outcome, c.lesson].filter(Boolean).join(" "),
    });
  }
  for (const s of sigap) {
    rows.push({
      ...base, module: "SIGAP", code: s.code, title: s.violation, sub: `${s.unit_name ?? "-"} · ${s.result_date}`, meta: s.decision ?? "", days: null, href: `/sigap?tab=hasil`,
      text: [s.code, s.ref, s.violation, s.category, s.unit_name, s.decision, s.root_cause, s.lesson].filter(Boolean).join(" "),
    });
  }
  for (const k of kb) {
    rows.push({
      ...base, module: "Knowledge Base", code: k.code, title: k.title, sub: [k.category, k.unit_label].filter(Boolean).join(" · "), meta: k.outcome ?? "", days: null,
      href: `/kb?d=${k.code}`,
      text: [k.code, k.title, k.unit_label, k.category, k.summary, k.root_cause, k.investigation, k.sanction, k.outcome, k.lesson].filter(Boolean).join(" "),
    });
  }
  for (const i of ins) {
    const due = i.next_expected ? Math.round((Date.parse(i.next_expected) - Date.now()) / 86_400_000) : null;
    rows.push({
      ...base, module: "Pemeriksaan", code: i.code, title: `${i.agency}${i.kind ? ` — ${i.kind}` : ""}`, sub: `${i.unit_name ?? "-"} · ${i.insp_date}`, meta: i.result, days: due,
      href: `/pemeriksaan?d=${i.code}`,
      text: [i.code, i.agency, i.kind, i.unit_name, i.result, i.findings, i.follow_up, i.consequence].filter(Boolean).join(" "),
    });
  }
  for (const l of lib) {
    rows.push({
      ...base, module: "Repository", code: l.code, title: l.title, sub: [l.kind, l.parties].filter(Boolean).join(" · "), meta: l.doc_date ?? "", days: null,
      href: `/repository?d=${l.code}`,
      text: [l.code, l.kind, l.title, l.parties, l.core, l.key_points, l.outcome].filter(Boolean).join(" "),
    });
  }
  return rows;
}
