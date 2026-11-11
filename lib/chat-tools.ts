// Tools Tanya LDMS uses to read the database and the Google Drive repository (blueprint §6.1 rencana, §12.2).
import { tool } from "ai";
import { z } from "zod";
import { query } from "./db";
import { searchDrive } from "./drive";
import { getAgreementByCode, listAgreements } from "./ldms/agreements";
import type { Module } from "./access";
import { CASE_STATUS, caseInsight, listCases, listSteps } from "./ldms/cases";
import { listSigap } from "./ldms/sigap";
import { listInspections, listKb, listLibrary } from "./ldms/history";
import { getPermitByCode, listNotes, listPermits, needsAck, RENEWAL_LABEL } from "./ldms/permits";

const has = (hay: (string | null | undefined)[], q?: string) => {
  if (!q) return true;
  const t = hay.filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w));
};

/** Tools for the chat, limited to the modules the signed-in user may view. */
export function ldmsTools(canView: (m: Module) => boolean) {
  const all = {
    search_permits: tool({
      description: "Cari izin di registry perizinan. Bisa filter teks (unit, jenis izin, nomor, PIC, brand, kota, isi somasi), status waktu, brand, dan PIC. Hasil urut paling mendesak.",
      inputSchema: z.object({
        q: z.string().optional().describe("kata kunci bebas"),
        status: z.enum(["overdue", "le30", "le90", "somasi", "belum_ack", "belum_diproses", "semua"]).optional(),
        limit: z.number().int().min(1).max(60).optional(),
      }),
      execute: async ({ q, status = "semua", limit = 25 }) => {
        const rows = (await listPermits()).filter((p) => {
          if (!has([p.code, p.type_name, p.unit_name, p.number, p.pic_name, p.brand, p.city, p.mall, p.somasi_text], q)) return false;
          const d = p.days;
          if (status === "overdue") return d !== null && d < 0;
          if (status === "le30") return d !== null && d >= 0 && d <= 30;
          if (status === "le90") return d !== null && d >= 0 && d <= 90;
          if (status === "somasi") return p.requires_ack;
          if (status === "belum_ack") return needsAck(p);
          if (status === "belum_diproses") return d !== null && d <= p.lead_days && p.renewal_status === "belum";
          return true;
        }).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
        return {
          total: rows.length,
          rows: rows.slice(0, limit).map((p) => ({
            id: p.code, izin: p.type_name, nomor: p.number, unit: p.unit_name, brand: p.brand, kota: p.city, jatuhTempo: p.expiry_date, sisaHari: p.days,
            statusRenewal: RENEWAL_LABEL[p.renewal_status], picLegal: p.pic_name, ambangHari: p.lead_days, estimasiBiaya: p.est_cost ? Number(p.est_cost) : null,
            instansi: p.agency, bersomasi: p.requires_ack, ack: p.ack_at ? `${p.ack_by} ${p.ack_at}` : null,
          })),
        };
      },
    }),

    search_agreements: tool({
      description: "Cari perjanjian MLA, ULA, PKS. Filter jenis, kata kunci (judul, pihak, lokasi, brand), dan maksimal sisa hari sebelum berakhir.",
      inputSchema: z.object({ kind: z.enum(["MLA", "ULA", "PKS"]).optional(), q: z.string().optional(), maxDays: z.number().int().optional() }),
      execute: async ({ kind, q, maxDays }) => {
        const rows = (await listAgreements()).filter((a) => (!kind || a.kind === kind) && has([a.code, a.title, a.counterparty, a.principal, a.location, a.city, a.brand, a.scheme], q) && (maxDays === undefined || (a.days ?? 1e9) <= maxDays));
        return { total: rows.length, rows: rows.slice(0, 40).map((a) => ({
          id: a.code, jenis: a.kind, judul: a.title, pihak: a.counterparty, induk: a.parent_code, lokasi: a.location, kota: a.city, berakhir: a.end_date, sisaHari: a.days,
          noticeHari: a.notice_days, mataUang: a.currency, nilai: a.value ? Number(a.value) : null, unitFee: a.unit_fee ? Number(a.unit_fee) : null, royaltyPersen: a.royalty_pct ? Number(a.royalty_pct) : null,
          skema: a.scheme, terminasi: a.termination_clause, catatan: a.note_count,
        })) };
      },
    }),

    get_record: tool({
      description: "Ambil detail satu dokumen berdasarkan ID: D0123 (izin), MLA-/ULA-/PKS-001 (perjanjian), termasuk catatan tim Legal.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const code = id.trim().toUpperCase();
        if (/^D\d{3,}$/.test(code)) {
          if (!canView("permit")) return { error: "Tidak punya akses ke Permit & License." };
          const p = await getPermitByCode(code);
          if (!p) return { error: `Izin ${code} tidak ditemukan.` };
          return { ...p, catatan: (await listNotes("permit", p.id)).slice(0, 15).map((n) => ({ oleh: n.by_name, pada: n.created_at, isi: n.body })) };
        }
        if (/^(MLA|ULA|PKS)-\d+$/.test(code)) {
          if (!canView("agreement")) return { error: "Tidak punya akses ke perjanjian." };
          const a = await getAgreementByCode(code);
          if (!a) return { error: `Perjanjian ${code} tidak ditemukan.` };
          return { ...a, catatan: (await listNotes("agreement", a.id)).slice(0, 15).map((n) => ({ oleh: n.by_name, pada: n.created_at, isi: n.body })) };
        }
        return { error: "Gunakan tool lain untuk CASE/SGP/KB/INS/LIB." };
      },
    }),

    search_cases: tool({
      description: "Cari Cases (CASE-YYYY-NNN): sengketa komersial, pidana/laporan polisi, konsumen & regulator, ketenagakerjaan. Berisi kronologi, root cause, forum, status, keputusan, hasil, pelajaran.",
      inputSchema: z.object({ q: z.string().optional(), status: z.enum(["aktif", "selesai", "semua"]).optional(), category: z.string().optional() }),
      execute: async ({ q, status = "semua", category }) => {
        const rows = (await listCases()).filter((c) => (!category || c.category.toLowerCase().includes(category.toLowerCase()))
          && (status === "semua" || (status === "selesai" ? c.status === "selesai" : c.status !== "selesai"))
          && has([c.code, c.title, c.category, c.unit_name, c.counterparty, c.forum, c.chronology, c.root_cause_cat, c.root_cause, c.decision, c.outcome, c.lesson], q));
        return { total: rows.length, rows: rows.slice(0, 20).map((c) => ({
          id: c.code, judul: c.title, kategori: c.category, unit: c.unit_name, forum: c.forum, pihakLawan: c.counterparty, risiko: c.risk, eksposur: c.exposure ? Number(c.exposure) : null,
          status: CASE_STATUS[c.status], rootCause: [c.root_cause_cat, c.root_cause].filter(Boolean).join(" — "), keputusan: c.decision, hasil: c.outcome, pelajaran: c.lesson,
          umurHari: c.age_days, picLegal: c.pic_name, kb: c.kb_code,
        })) };
      },
    }),

    case_flow: tool({
      description: "Alur penanganan satu case (siapa menangani di tiap tahap) berdasarkan ID CASE-YYYY-NNN.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const c = (await listCases()).find((x) => x.code.toUpperCase() === id.trim().toUpperCase());
        if (!c) return { error: `Case ${id} tidak ditemukan.` };
        return { id: c.code, alur: (await listSteps(c.id)).map((s) => ({ tanggal: s.step_date, tahap: s.stage, penangan: s.handler, tindakan: s.action })) };
      },
    }),

    case_insight: tool({
      description: "Statistik Cases & SIGAP: jumlah per kategori, root cause paling sering, distribusi hasil, rata-rata hari penyelesaian, eksposur case aktif.",
      inputSchema: z.object({}),
      execute: async () => caseInsight(),
    }),

    search_sigap: tool({
      description: "Cari hasil SIGAP (SGP-YYYY-NNN): pelanggaran disiplin, keputusan/sanksi, root cause, pelajaran. Tanpa nama karyawan.",
      inputSchema: z.object({ q: z.string().optional() }),
      execute: async ({ q }) => {
        const rows = (await listSigap()).filter((s) => has([s.code, s.violation, s.category, s.unit_name, s.decision, s.root_cause, s.lesson], q));
        return { total: rows.length, rows: rows.slice(0, 20).map((s) => ({ id: s.code, tanggal: s.result_date, unit: s.unit_name, kategori: s.category, pelanggaran: s.violation, keputusan: s.decision, rootCause: s.root_cause, pelajaran: s.lesson })) };
      },
    }),

    search_kb: tool({
      description: "Cari Knowledge Base (KB-…): pelajaran dari case & SIGAP — kategori, root cause, alur penanganan, keputusan, hasil, pelajaran.",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => {
        const rows = (await listKb()).filter((k) => has([k.code, k.title, k.unit_label, k.category, k.summary, k.root_cause, k.investigation, k.sanction, k.outcome, k.lesson], q));
        return { total: rows.length, rows: rows.slice(0, 10).map((k) => ({ id: k.code, judul: k.title, unit: k.unit_label, kategori: k.category, rootCause: k.root_cause, alur: k.investigation, keputusan: k.sanction, hasil: k.outcome, pelajaran: k.lesson })) };
      },
    }),

    search_inspections: tool({
      description: "Cari riwayat pemeriksaan instansi pemerintah (INS-YYYY-NNN): instansi, unit, hasil, temuan, tindak lanjut.",
      inputSchema: z.object({ q: z.string().optional() }),
      execute: async ({ q }) => {
        const rows = (await listInspections()).filter((i) => has([i.code, i.agency, i.kind, i.unit_name, i.result, i.findings, i.follow_up], q));
        return { total: rows.length, rows: rows.slice(0, 20) };
      },
    }),

    search_library: tool({
      description: "Cari Repository: Legal Opinion, memo hukum, resume (LIB-…).",
      inputSchema: z.object({ q: z.string().optional(), kind: z.string().optional() }),
      execute: async ({ q, kind }) => {
        const rows = (await listLibrary()).filter((l) => (!kind || l.kind === kind) && has([l.code, l.kind, l.title, l.parties, l.core, l.key_points, l.outcome], q));
        return { total: rows.length, rows: rows.slice(0, 15) };
      },
    }),

    search_drive: tool({
      description: "Cari isi dokumen repository Google Drive tim Legal (Google Docs & Sheets di folder LDMS). Pakai untuk pertanyaan yang jawabannya ada di dokumen/spreadsheet tim, lalu sebut nama file sebagai sumber.",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => {
        const hits = await searchDrive(q, 6);
        return hits.length ? { hits } : { hits: [], info: "Tidak ada dokumen Drive yang cocok (atau Drive belum diindeks)." };
      },
    }),

    aggregate: tool({
      description: "Angka ringkasan: jumlah izin per status, overdue per brand, total estimasi biaya renewal 30 hari ke depan per brand.",
      inputSchema: z.object({ metric: z.enum(["ringkasan", "overdue_per_brand", "biaya_renewal_30_hari"]) }),
      execute: async ({ metric }) => {
        const ps = await listPermits();
        if (metric === "ringkasan") {
          return {
            total: ps.length, overdue: ps.filter((p) => (p.days ?? 1) < 0).length, le30: ps.filter((p) => p.days !== null && p.days >= 0 && p.days <= 30).length,
            somasiBelumAck: ps.filter(needsAck).length, compliancePersen: ps.length ? Math.round(((ps.length - ps.filter((p) => (p.days ?? 1) < 0).length) / ps.length) * 100) : 100,
            agreementAktif: (await query<{ n: number }>(`select count(*)::int as n from agreements where status = 'aktif'`))[0].n,
          };
        }
        const by = new Map<string, number>();
        for (const p of ps) {
          const k = p.brand ?? (p.scope === "central_kitchen" ? "Central Kitchen" : "Korporat");
          if (metric === "overdue_per_brand" && (p.days ?? 1) < 0) by.set(k, (by.get(k) ?? 0) + 1);
          if (metric === "biaya_renewal_30_hari" && p.days !== null && p.days >= 0 && p.days <= 30) by.set(k, (by.get(k) ?? 0) + Number(p.est_cost ?? 0));
        }
        return Object.fromEntries(by);
      },
    }),
  };
  const need: Record<keyof typeof all, Module | null> = {
    search_permits: "permit", search_agreements: "agreement", get_record: null, search_cases: "cases", case_flow: "cases", case_insight: "cases",
    search_sigap: "sigap", search_kb: "kb", search_inspections: "inspection", search_library: "library", search_drive: "library", aggregate: "permit",
  };
  return Object.fromEntries(Object.entries(all).filter(([k]) => {
    const m = need[k as keyof typeof all];
    return k === "get_record" ? canView("permit") || canView("agreement") : !m || canView(m);
  })) as Partial<typeof all>;
}


export const CHAT_SYSTEM = (name: string, today: string) => `Anda asisten pencarian internal LDMS (Legal Document Management System) Boga Group. Pengguna: ${name}. Hari ini ${today} (WIB).
Gunakan tools untuk mengambil data — jangan menebak. Repository Google Drive tim Legal bisa dicari dengan search_drive.
Jawab HANYA dari data yang dikembalikan tools. Bila datanya tidak ada, katakan terus terang bahwa data itu belum terekam di LDMS — jangan mengarang nomor izin, id dokumen, tanggal, atau nilai.
Selalu sebutkan id/nomor dokumen yang relevan (D0123, ULA-004, PKS-002, CASE-2026-002, SGP-2026-001, KB-CASE-2025-004, INS-2025-018, LIB-LO-005) agar bisa dibuka; untuk dokumen Drive sebut nama filenya.
Jawaban singkat dan langsung: 1-4 kalimat atau daftar pendek maksimal 8 baris. Bahasa Indonesia. Sebut angka apa adanya dari data.
Jangan pakai markdown heading atau tabel; boleh daftar dengan tanda hubung.
Bila pertanyaan menyangkut tenggat, sebutkan sisa hari dan tanggal jatuh temponya sekaligus.
Bila tool untuk suatu modul tidak tersedia, katakan bahwa pengguna tidak punya akses ke modul itu.
Jangan menyebut nama atau identitas karyawan yang melanggar.`;
