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
    /** Address of the SIGAP web app (a separate system with its own login). The portal's SIGAP card opens it. */
    url: string;
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

/** SIGAP (Google Apps Script). Admin Console can replace it, e.g. after a new Apps Script deployment. */
export const SIGAP_URL = "https://script.google.com/macros/s/AKfycbwAyEHWGU-JM9ZgXojnl4nImKKFTDZRmrAbQCNMidciqMr21cgm_shRgQWvqyq_sZYH/exec";

export const DEFAULT_FLOWS: Flows = {
  reminder: { sendEnabled: false, supervisorId: null, corpSupervisorId: null, headId: null, directorId: null, digestEnabled: true, agreementStages: [60, 30, 7] },
  sigap: { url: SIGAP_URL },
  ai: { enabled: true, model: "claude-sonnet-5-5" },
  drive: { folderUrl: "", folderId: "", dbSheetId: "", kbDocId: "", mirrorEnabled: true },
};

export async function getFlows(): Promise<Flows> {
  const v = (await getKV<Partial<Flows>>("flows")) ?? {};
  return {
    reminder: { ...DEFAULT_FLOWS.reminder, ...(v.reminder ?? {}) },
    sigap: { url: v.sigap?.url || SIGAP_URL },
    ai: { ...DEFAULT_FLOWS.ai, ...(v.ai ?? {}) },
    drive: { ...DEFAULT_FLOWS.drive, ...(v.drive ?? {}) },
  };
}

export async function saveFlows(patch: { [K in keyof Flows]?: Partial<Flows[K]> }) {
  const cur = await getFlows();
  const next: Flows = {
    reminder: { ...cur.reminder, ...(patch.reminder ?? {}) },
    sigap: { url: patch.sigap?.url ?? cur.sigap.url },
    ai: { ...cur.ai, ...(patch.ai ?? {}) },
    drive: { ...cur.drive, ...(patch.drive ?? {}) },
  };
  await setKV("flows", next);
  return next;
}
