// Workflow templates per document type.
// Each stage has an SLA in working days and an owner role.
// `approval: true` means only members with `role` (or admin) can approve it.

export type Role = "staff" | "manager" | "agm" | "cpo" | "admin";
export type DocType = "vendor" | "principal" | "other";
export type DocStatus = "active" | "on_hold" | "done" | "cancelled";
export type RiskLevel = "low" | "medium" | "high";

export interface StageDef {
  key: string;
  label: string;
  role: Role;
  slaDays: number;
  approval?: boolean;
  /** Stage only applies when condition returns true. */
  when?: (ctx: StageContext) => boolean;
  /** Where "minta revisi" sends the document back to. */
  revisionTo?: string;
  hint: string;
}

export interface StageContext {
  contractValue: number | null;
  riskLevel: RiskLevel;
  requireCpo: boolean | null;
  cpoThreshold: number;
}

export const ROLE_LABEL: Record<Role, string> = {
  staff: "Staff Legal",
  manager: "Manager Legal",
  agm: "AGM Legal",
  cpo: "Chief People Officer",
  admin: "Admin",
};

/** Who an overdue item escalates to. */
export const ESCALATION: Record<Role, Role | null> = {
  staff: "manager",
  manager: "agm",
  agm: "cpo",
  cpo: null,
  admin: null,
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  vendor: "Kontrak vendor",
  principal: "Kontrak prinsipal",
  other: "Dokumen lain",
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  active: "Berjalan",
  on_hold: "Menunggu pihak lain",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const cpoNeeded = (c: StageContext) => {
  if (c.requireCpo !== null) return c.requireCpo;
  return c.riskLevel === "high" || (c.contractValue ?? 0) >= c.cpoThreshold;
};

export const WORKFLOWS: Record<DocType, StageDef[]> = {
  vendor: [
    { key: "intake", label: "Diterima", role: "staff", slaDays: 1, hint: "Cek kelengkapan email & lampiran, tetapkan PIC." },
    { key: "review", label: "Review legal", role: "staff", slaDays: 3, hint: "Review draft kontrak, tandai klausul berisiko." },
    { key: "negotiation", label: "Negosiasi & revisi", role: "staff", slaDays: 5, hint: "Kirim markup ke vendor, sepakati perubahan." },
    { key: "mgr_approval", label: "Approval Manager Legal", role: "manager", slaDays: 2, approval: true, revisionTo: "negotiation", hint: "Manager Legal menyetujui draft final." },
    { key: "agm_approval", label: "Approval AGM Legal", role: "agm", slaDays: 2, approval: true, revisionTo: "negotiation", hint: "AGM Legal menyetujui draft final." },
    { key: "cpo_approval", label: "Approval CPO", role: "cpo", slaDays: 2, approval: true, revisionTo: "negotiation", when: cpoNeeded, hint: "Wajib bila nilai ≥ ambang CPO atau risiko tinggi." },
    { key: "signing", label: "Penandatanganan", role: "staff", slaDays: 5, hint: "Sirkulasi tanda tangan basah / e-sign kedua pihak." },
    { key: "archive", label: "Arsip", role: "staff", slaDays: 1, hint: "Simpan dokumen final bertanda tangan." },
  ],
  principal: [
    { key: "intake", label: "Diterima", role: "staff", slaDays: 1, hint: "Cek kelengkapan email & lampiran, tetapkan PIC." },
    { key: "due_diligence", label: "Due diligence prinsipal", role: "staff", slaDays: 5, hint: "Legalitas prinsipal, HAKI/merek, izin edar." },
    { key: "review", label: "Review legal", role: "staff", slaDays: 4, hint: "Review eksklusivitas, wilayah, target, terminasi." },
    { key: "negotiation", label: "Negosiasi & revisi", role: "staff", slaDays: 7, hint: "Kirim markup ke prinsipal, sepakati perubahan." },
    { key: "mgr_approval", label: "Approval Manager Legal", role: "manager", slaDays: 2, approval: true, revisionTo: "negotiation", hint: "Manager Legal menyetujui draft final." },
    { key: "agm_approval", label: "Approval AGM Legal", role: "agm", slaDays: 2, approval: true, revisionTo: "negotiation", hint: "AGM Legal menyetujui draft final." },
    { key: "cpo_approval", label: "Approval CPO", role: "cpo", slaDays: 3, approval: true, revisionTo: "negotiation", hint: "Selalu wajib untuk kontrak prinsipal." },
    { key: "signing", label: "Penandatanganan", role: "staff", slaDays: 7, hint: "Sirkulasi tanda tangan, termasuk legalisasi bila perlu." },
    { key: "archive", label: "Arsip", role: "staff", slaDays: 1, hint: "Simpan dokumen final bertanda tangan." },
  ],
  other: [
    { key: "intake", label: "Diterima", role: "staff", slaDays: 1, hint: "Cek kelengkapan email & lampiran, tetapkan PIC." },
    { key: "review", label: "Review legal", role: "staff", slaDays: 3, hint: "Review dokumen." },
    { key: "mgr_approval", label: "Approval Manager Legal", role: "manager", slaDays: 2, approval: true, revisionTo: "review", hint: "Manager Legal menyetujui." },
    { key: "archive", label: "Arsip", role: "staff", slaDays: 1, hint: "Simpan dokumen final." },
  ],
};

export function stagesFor(type: DocType, ctx: StageContext): StageDef[] {
  return (WORKFLOWS[type] ?? WORKFLOWS.other).filter((s) => !s.when || s.when(ctx));
}

export function stageDef(type: DocType, key: string): StageDef | undefined {
  return (WORKFLOWS[type] ?? WORKFLOWS.other).find((s) => s.key === key);
}

export function nextStage(type: DocType, key: string, ctx: StageContext): StageDef | null {
  const list = stagesFor(type, ctx);
  const i = list.findIndex((s) => s.key === key);
  if (i === -1) return list[0] ?? null;
  return list[i + 1] ?? null;
}

/** Kanban column keys in a stable order across all document types. */
export const BOARD_COLUMNS: { key: string; label: string; stages: string[] }[] = [
  { key: "in", label: "Masuk", stages: ["intake"] },
  { key: "review", label: "Review & DD", stages: ["due_diligence", "review"] },
  { key: "nego", label: "Negosiasi", stages: ["negotiation"] },
  { key: "approval", label: "Approval", stages: ["mgr_approval", "agm_approval", "cpo_approval"] },
  { key: "sign", label: "Tanda tangan & arsip", stages: ["signing", "archive"] },
];

export const isRole = (r: string): r is Role => r in ROLE_LABEL;
export const isDocType = (t: string): t is DocType => t in DOC_TYPE_LABEL;
