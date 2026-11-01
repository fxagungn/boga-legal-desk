// Approval flows per document type. Defaults live here; the team edits them in Pengaturan
// (stored in app_settings.app.workflows). Every function takes the active `Workflows`.

export type Role = "staff" | "supervisor" | "manager" | "agm" | "cpo" | "admin";
export type DocType = string;
export type DocStatus = "active" | "on_hold" | "done" | "cancelled";
export type RiskLevel = "low" | "medium" | "high";
/** When a step applies: always, or only for high-value / high-risk documents. */
export type Condition = "always" | "high_value";

export interface StageDef {
  key: string;
  label: string;
  role: Role;
  slaDays: number;
  approval: boolean;
  condition: Condition;
}

export interface TypeDef {
  key: DocType;
  label: string;
  /** Subject tag, e.g. VENDOR for [VENDOR]. */
  tag: string;
  stages: StageDef[];
}

export type Workflows = TypeDef[];

export interface StageContext {
  contractValue: number | null;
  riskLevel: RiskLevel;
  requireCpo: boolean | null;
  cpoThreshold: number;
  /** Steps switched off for this one document. */
  skip: string[];
}

export const ROLE_LABEL: Record<Role, string> = {
  staff: "Staff Legal",
  supervisor: "Supervisor Legal",
  manager: "Manager Legal",
  agm: "AGM Legal",
  cpo: "CPLO",
  admin: "Admin",
};

/** Who an overdue item escalates to. */
export const ESCALATION: Record<Role, Role | null> = { staff: "supervisor", supervisor: "manager", manager: "agm", agm: "cpo", cpo: null, admin: null };

export const STATUS_LABEL: Record<DocStatus, string> = {
  active: "Berjalan",
  on_hold: "Menunggu pihak lain",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const RISK_LABEL: Record<RiskLevel, string> = { low: "Rendah", medium: "Sedang", high: "Tinggi" };

const s = (key: string, label: string, role: Role, slaDays: number, approval = false, condition: Condition = "always"): StageDef => ({ key, label, role, slaDays, approval, condition });

export const DEFAULT_WORKFLOWS: Workflows = [
  {
    key: "vendor", label: "Kontrak vendor", tag: "VENDOR",
    stages: [
      s("intake", "Diterima", "staff", 1),
      s("review", "Review legal", "staff", 3),
      s("negotiation", "Negosiasi & revisi", "staff", 5),
      s("mgr_approval", "Persetujuan Manager", "manager", 2, true),
      s("agm_approval", "Persetujuan AGM", "agm", 2, true),
      s("cpo_approval", "Persetujuan CPLO", "cpo", 2, true, "high_value"),
      s("signing", "Penandatanganan", "staff", 5),
      s("archive", "Arsip", "staff", 1),
    ],
  },
  {
    key: "principal", label: "Kontrak prinsipal", tag: "PRINSIPAL",
    stages: [
      s("intake", "Diterima", "staff", 1),
      s("due_diligence", "Due diligence prinsipal", "staff", 5),
      s("review", "Review legal", "staff", 4),
      s("negotiation", "Negosiasi & revisi", "staff", 7),
      s("mgr_approval", "Persetujuan Manager", "manager", 2, true),
      s("agm_approval", "Persetujuan AGM", "agm", 2, true),
      s("cpo_approval", "Persetujuan CPLO", "cpo", 3, true),
      s("signing", "Penandatanganan", "staff", 7),
      s("archive", "Arsip", "staff", 1),
    ],
  },
  {
    key: "other", label: "Dokumen lain", tag: "LAIN",
    stages: [
      s("intake", "Diterima", "staff", 1),
      s("review", "Review legal", "staff", 3),
      s("mgr_approval", "Persetujuan Manager", "manager", 2, true),
      s("archive", "Arsip", "staff", 1),
    ],
  },
];

const SHORT: Record<string, string> = {
  intake: "Diterima", due_diligence: "Due diligence", review: "Review", negotiation: "Negosiasi",
  mgr_approval: "Manager", agm_approval: "AGM", cpo_approval: "CPLO", signing: "Tanda tangan", archive: "Arsip",
};
export const shortLabel = (st: StageDef) => SHORT[st.key] && st.label === DEFAULT_LABEL[st.key] ? SHORT[st.key] : st.label.length > 16 ? st.label.split(" ").slice(0, 2).join(" ") : st.label;
const DEFAULT_LABEL: Record<string, string> = Object.fromEntries(DEFAULT_WORKFLOWS.flatMap((t) => t.stages.map((x) => [x.key, x.label])));

export function typeDef(wf: Workflows, type: DocType): TypeDef {
  return wf.find((t) => t.key === type) ?? wf.find((t) => t.key === "other") ?? wf[0];
}

export const typeLabel = (wf: Workflows, type: DocType) => wf.find((t) => t.key === type)?.label ?? "Dokumen lain";

export function conditionMet(st: StageDef, ctx: StageContext): boolean {
  if (ctx.skip.includes(st.key)) return false;
  if (st.condition === "always" || ctx.skip.includes(`+${st.key}`)) return true;
  if (st.role === "cpo" && ctx.requireCpo !== null) return ctx.requireCpo;
  return ctx.riskLevel === "high" || (ctx.contractValue ?? 0) >= ctx.cpoThreshold;
}

/** Steps that apply to one document, in order. The current step is always kept. */
export function stagesFor(wf: Workflows, type: DocType, ctx: StageContext, current?: string): StageDef[] {
  return typeDef(wf, type).stages.filter((st) => st.key === current || conditionMet(st, ctx));
}

export function stageDef(wf: Workflows, type: DocType, key: string): StageDef | undefined {
  return typeDef(wf, type).stages.find((st) => st.key === key);
}

export function nextStage(wf: Workflows, type: DocType, key: string, ctx: StageContext): StageDef | null {
  const list = stagesFor(wf, type, ctx, key);
  const i = list.findIndex((st) => st.key === key);
  if (i === -1) return list[0] ?? null;
  return list[i + 1] ?? null;
}

/** "Kembalikan" sends a document to the closest earlier working (non-approval) step. */
export function revisionTarget(wf: Workflows, type: DocType, key: string): StageDef | undefined {
  const all = typeDef(wf, type).stages;
  const i = all.findIndex((st) => st.key === key);
  for (let k = i - 1; k >= 0; k--) if (!all[k].approval) return all[k];
  return all[0];
}

export const isRole = (r: string): r is Role => r in ROLE_LABEL;
export const isDocType = (wf: Workflows, t: string) => wf.some((x) => x.key === t);

/** Validate and normalise a workflow config coming from the editor. Throws with a readable message. */
export function normaliseWorkflows(input: unknown): Workflows {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Minimal harus ada satu jenis dokumen.");
  const seenType = new Set<string>();
  const seenTag = new Set<string>();
  return input.map((t: Partial<TypeDef>) => {
    const label = String(t.label ?? "").trim();
    if (!label) throw new Error("Nama jenis dokumen tidak boleh kosong.");
    const key = String(t.key ?? "").trim() || slug(label);
    if (seenType.has(key)) throw new Error(`Jenis dokumen "${label}" dobel.`);
    seenType.add(key);
    const tag = String(t.tag ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || slug(label).toUpperCase();
    if (seenTag.has(tag)) throw new Error(`Tag subjek [${tag}] dipakai lebih dari satu jenis dokumen.`);
    seenTag.add(tag);
    if (!Array.isArray(t.stages) || t.stages.length === 0) throw new Error(`"${label}" harus punya minimal satu langkah.`);
    const seen = new Set<string>();
    const stages = t.stages.map((x: Partial<StageDef>) => {
      const sl = String(x.label ?? "").trim();
      if (!sl) throw new Error(`Ada langkah tanpa nama di "${label}".`);
      let k = String(x.key ?? "").trim() || slug(sl);
      while (seen.has(k)) k = `${k}_2`;
      seen.add(k);
      const role = isRole(String(x.role)) ? (x.role as Role) : "staff";
      const days = Math.min(60, Math.max(0.5, Number(x.slaDays) || 1));
      return { key: k, label: sl, role, slaDays: days, approval: Boolean(x.approval), condition: x.condition === "high_value" ? "high_value" : "always" } as StageDef;
    });
    return { key, label, tag, stages };
  });
}

function slug(v: string) {
  return v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || `x${Date.now().toString(36)}`;
}
