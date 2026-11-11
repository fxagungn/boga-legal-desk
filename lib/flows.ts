// Workflow settings the Super Admin controls from Admin Console → Alur & notifikasi.
import { getKV, setKV } from "./db";

export interface Flows {
  reminder: {
    /** Real sending stays off until an email channel (Resend / Microsoft 365) is configured and this is switched on. */
    sendEnabled: boolean;
    /** Members who receive CCs on the escalation ladder (blueprint §5.7). */
    supervisorId: number | null;
    corpSupervisorId: number | null;
    headId: number | null;
    directorId: number | null;
    /** Weekly digest (Monday) to the two supervisors. */
    digestEnabled: boolean;
    /** Extra reminder points for agreements, on top of the notice threshold (blueprint §6.3). */
    agreementStages: number[];
  };
  sigap: {
    /** URL of the SIGAP system, shown embedded in Data Record › SIGAP. */
    url: string;
    /** Open in a new tab instead of embedding (for systems that block iframes). */
    newTab: boolean;
    /** Violation categories offered when recording a SIGAP result. */
    categories: string[];
  };
  ai: {
    enabled: boolean;
    model: string;
  };
  drive: {
    folderUrl: string;
    folderId: string;
    dbSheetId: string;
    kbDocId: string;
    /** Mirror every change to the LDMS_DB spreadsheet. */
    mirrorEnabled: boolean;
  };
}

export const DEFAULT_FLOWS: Flows = {
  reminder: { sendEnabled: false, supervisorId: null, corpSupervisorId: null, headId: null, directorId: null, digestEnabled: true, agreementStages: [60, 30, 7] },
  sigap: { url: "", newTab: false, categories: ["Kepatuhan SOP", "Fraud & kriminal", "Keamanan pangan", "Produktivitas & tanggung jawab", "Perilaku & etika", "K3"] },
  ai: { enabled: true, model: "claude-sonnet-5-5" },
  drive: { folderUrl: "", folderId: "", dbSheetId: "", kbDocId: "", mirrorEnabled: true },
};

export async function getFlows(): Promise<Flows> {
  const v = (await getKV<Partial<Flows>>("flows")) ?? {};
  return {
    reminder: { ...DEFAULT_FLOWS.reminder, ...(v.reminder ?? {}) },
    sigap: { ...DEFAULT_FLOWS.sigap, ...(v.sigap ?? {}) },
    ai: { ...DEFAULT_FLOWS.ai, ...(v.ai ?? {}) },
    drive: { ...DEFAULT_FLOWS.drive, ...(v.drive ?? {}) },
  };
}

export async function saveFlows(patch: { [K in keyof Flows]?: Partial<Flows[K]> }) {
  const cur = await getFlows();
  const next: Flows = {
    reminder: { ...cur.reminder, ...(patch.reminder ?? {}) },
    sigap: { ...cur.sigap, ...(patch.sigap ?? {}) },
    ai: { ...cur.ai, ...(patch.ai ?? {}) },
    drive: { ...cur.drive, ...(patch.drive ?? {}) },
  };
  await setKV("flows", next);
  return next;
}
