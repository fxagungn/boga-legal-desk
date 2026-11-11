// LDMS ↔ Google Drive: the Shared Drive folder is the team's repository.
//  - Every change is mirrored to the "LDMS_DB" spreadsheet (one tab per module).
//  - The "Knowledge Base — Yurisprudensi Kasus Boga Group" Google Doc is parsed into kb_cases (7 headings, blueprint §9.2);
//    approved sanctions are appended to it.
//  - All Docs/Sheets in the folder are indexed so Tanya LDMS can answer from them.
import { getKV, query, setKV } from "./db";
import { getFlows, saveFlows } from "./flows";
import {
  docsAppend, docsParagraphs, driveCreate, driveGet, driveIdFromUrl, driveListFolder, driveText, googleAccountEmail, googleConfigured,
  sheetsWriteTabs,
} from "./google";

export const driveServiceEmail = () => googleAccountEmail();
export const driveReady = async () => googleConfigured() && Boolean((await getFlows()).drive.folderId);

export async function setupDrive(folderUrl: string) {
  if (!googleConfigured()) throw new Error("Service account Google belum diset (GOOGLE_SERVICE_ACCOUNT_JSON di Vercel).");
  const folderId = driveIdFromUrl(folderUrl);
  if (!folderId) throw new Error("Link folder Google Drive tidak dikenali.");
  const folder = await driveGet(folderId);
  if (folder.mimeType !== "application/vnd.google-apps.folder") throw new Error("Link itu bukan folder.");
  const f = (await getFlows()).drive;
  let dbSheetId = f.folderId === folderId ? f.dbSheetId : "";
  let kbDocId = f.folderId === folderId ? f.kbDocId : "";
  const files = await driveListFolder(folderId);
  if (!dbSheetId) dbSheetId = files.find((x) => x.name === "LDMS_DB" && x.mimeType.endsWith("spreadsheet"))?.id ?? "";
  if (!kbDocId) kbDocId = files.find((x) => /knowledge base|yurisprudensi/i.test(x.name) && x.mimeType.endsWith("document"))?.id ?? "";
  const shared = Boolean(folder.driveId);
  if (!dbSheetId) {
    if (!shared) throw new Error("Folder ini ada di My Drive. Buat spreadsheet bernama LDMS_DB di folder itu (share Editor ke service account), atau pakai folder di Shared Drive.");
    dbSheetId = (await driveCreate("LDMS_DB", "application/vnd.google-apps.spreadsheet", folderId)).id;
  }
  if (!kbDocId) {
    if (!shared) throw new Error("Buat Google Doc \"Knowledge Base — LDMS Boga Group\" di folder itu, atau pakai folder di Shared Drive.");
    kbDocId = (await driveCreate("Knowledge Base — LDMS Boga Group", "application/vnd.google-apps.document", folderId)).id;
    await docsAppend(kbDocId, [
      { text: "Knowledge Base — LDMS Boga Group", style: "TITLE" },
      { text: `Satu entri = Heading 1 "KB-YYYY-NNN — Judul", lalu Heading 2: ${KB_HEADINGS.join(", ")}. Tanpa nama karyawan.`, style: "NORMAL_TEXT" },
    ]);
  }
  await saveFlows({ drive: { folderUrl, folderId, dbSheetId, kbDocId } });
  return { folderName: folder.name, shared, dbSheetId, kbDocId };
}

/* ---------- mirror database → LDMS_DB ---------- */

const d = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v));

export async function mirrorToDrive() {
  const f = (await getFlows()).drive;
  if (!googleConfigured() || !f.dbSheetId) return { skipped: "Google Drive belum disiapkan" };
  const tab = async (title: string, sql: string) => {
    const rows = await query<Record<string, unknown>>(sql);
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    return { title, rows: [cols, ...rows.map((r) => cols.map((c) => d(r[c])))] as (string | number | null)[][] };
  };
  const tabs = await Promise.all([
    tab("Users", `select name, nik, title, role, email, active, is_super_admin from team_members order by name`),
    tab("Brands", `select name, has_principal, principal_name, currency, active from brands order by name`),
    tab("Outlets", `select u.code, u.name, b.name as brand, u.scope, u.mall, u.city, u.address, u.contact_name, u.contact_email, u.status from units u left join brands b on b.id = u.brand_id order by u.code`),
    tab("PermitTypes", `select code, name, kind, scope, lead_days, validity_years, agency, est_cost, blocker_note, active from permit_types order by sort`),
    tab("Documents", `select p.code as doc_id, u.name as unit, t.name as izin, p.number, p.issue_date, p.expiry_date, p.renewal_status, m.name as pic_legal, p.requires_ack, p.somasi_text, p.ack_by, p.ack_at, p.updated_at, p.updated_by
       from permits p join units u on u.id = p.unit_id join permit_types t on t.id = p.permit_type_id left join team_members m on m.id = p.pic_id order by p.code`),
    tab("Notes", `select entity, entity_id, body, by_name, created_at from notes order by created_at desc limit 5000`),
    tab("Agreements", `select a.code, a.kind, p.code as parent, b.name as brand, u.name as unit, a.title, a.counterparty, a.principal, a.location, a.city, a.scheme, a.start_date, a.end_date, a.notice_days, a.tenor, a.currency, a.value, a.unit_fee, a.royalty_pct, a.termination_clause, a.status
       from agreements a left join agreements p on p.id = a.parent_id left join brands b on b.id = a.brand_id left join units u on u.id = a.unit_id order by a.kind, a.code`),
    tab("Cases", `select c.code, c.category, c.title, u.name as unit, c.incident_date, c.reported_date, c.reporter, c.counterparty, c.forum, c.risk, c.exposure, c.chronology,
       c.root_cause_cat, c.root_cause, m.name as pic_legal, c.external_counsel, c.status, c.decision, c.outcome, c.settlement, c.closed_at, c.lesson, c.preventive, c.kb_code
       from cases c left join units u on u.id = c.unit_id left join team_members m on m.id = c.pic_id order by c.code`),
    tab("Case_Flow", `select c.code, s.step_date, s.stage, s.handler, s.action, s.by_name from case_steps s join cases c on c.id = s.case_id order by c.code, s.step_date, s.id`),
    tab("Case_Files", `select c.code, d.kind, d.label, d.url, d.doc_date, d.by_name from case_docs d join cases c on c.id = d.case_id order by c.code, d.id`),
    tab("SIGAP", `select s.code, s.ref, s.result_date, u.name as unit, s.category, s.violation, s.decision, s.root_cause, s.lesson, s.kb_code
       from sigap_results s left join units u on u.id = s.unit_id order by s.result_date desc`),
    tab("Knowledge_Base", `select code, case_date, title, unit_label, category, summary, root_cause, investigation as alur, sanction as keputusan, outcome, lesson, source from kb_cases order by case_date desc nulls last`),
    tab("Inspections", `select i.code, i.insp_date, i.agency, i.kind, u.name as unit, i.result, i.findings, i.follow_up, i.consequence, i.fine, m.name as pic_legal, i.closed_at, i.next_expected
       from inspections i left join units u on u.id = i.unit_id left join team_members m on m.id = i.pic_id order by i.insp_date desc`),
    tab("Library", `select code, kind, doc_date, title, parties, core, key_points, outcome, file_url from library order by code`),
    tab("ReminderLog", `select entity, entity_id, stage, stage_key, to_list, cc_list, status, sent_at from reminders order by sent_at desc limit 5000`),
    tab("AI_Audit", `select id, module, actor, at, model, ok, confidence, refs, decided_value, decided_by from ai_runs order by at desc limit 2000`),
    tab("AuditTrail", `select at, actor, action, entity, entity_id, detail from audit_log order by at desc limit 5000`),
  ]);
  await sheetsWriteTabs(f.dbSheetId, tabs);
  await setKV("drive_mirror", { at: new Date().toISOString(), tabs: tabs.length });
  return { tabs: tabs.length };
}

/** Called after every write. Runs after the response is sent; skips when a mirror ran in the last 30 s. */
export async function scheduleMirror() {
  try {
    const f = (await getFlows()).drive;
    if (!googleConfigured() || !f.dbSheetId || !f.mirrorEnabled) return;
    const last = await getKV<{ at: string }>("drive_mirror");
    if (last && Date.now() - Date.parse(last.at) < 30_000) return;
    const { after } = await import("next/server");
    after(async () => {
      try {
        await mirrorToDrive();
      } catch (e) {
        await setKV("drive_mirror_error", { at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
      }
    });
  } catch {
    /* never block a save on Drive */
  }
}

/* ---------- index Docs/Sheets for Tanya LDMS ---------- */

export async function indexDrive() {
  const f = (await getFlows()).drive;
  if (!googleConfigured() || !f.folderId) throw new Error("Google Drive belum disiapkan di Admin Console.");
  const files = await driveListFolder(f.folderId);
  const keep: string[] = [];
  let indexed = 0;
  for (const file of files) {
    if (file.id === f.dbSheetId) continue; // the mirror itself: the database is queried directly
    keep.push(file.id);
    const prev = await query<{ modified_time: string | null }>(`select modified_time from drive_docs where file_id = $1`, [file.id]);
    if (prev[0]?.modified_time && Date.parse(prev[0].modified_time) >= Date.parse(file.modifiedTime)) continue;
    let text: string | null = null;
    try {
      text = await driveText(file);
    } catch (e) {
      text = `[tidak terbaca: ${e instanceof Error ? e.message.slice(0, 120) : "error"}]`;
    }
    await query(
      `insert into drive_docs (file_id, name, mime, path, modified_time, web_link, text, indexed_at) values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (file_id) do update set name = excluded.name, mime = excluded.mime, path = excluded.path, modified_time = excluded.modified_time,
         web_link = excluded.web_link, text = excluded.text, indexed_at = now()`,
      [file.id, file.name, file.mimeType, file.path, file.modifiedTime, file.webViewLink ?? null, text ? text.slice(0, 400_000) : null],
    );
    indexed++;
  }
  await query(`delete from drive_docs where not (file_id = any($1::text[]))`, [keep]);
  await setKV("drive_index", { at: new Date().toISOString(), files: keep.length, indexed });
  return { files: keep.length, indexed };
}

export interface DriveHit { file_id: string; name: string; path: string | null; web_link: string | null; snippet: string }

/** Keyword search over indexed Drive files; returns short snippets around the first match. */
export async function searchDrive(q: string, limit = 6): Promise<DriveHit[]> {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  if (!words.length) return [];
  const rows = await query<{ file_id: string; name: string; path: string | null; web_link: string | null; text: string | null; score: number }>(
    `select file_id, name, path, web_link, text,
       (select count(*) from unnest($1::text[]) w where lower(coalesce(text,'') || ' ' || name) like '%' || w || '%')::int as score
     from drive_docs order by score desc, indexed_at desc limit $2`,
    [words, limit],
  );
  return rows.filter((r) => r.score > 0).map((r) => {
    const t = r.text ?? "";
    const lo = t.toLowerCase();
    const at = Math.max(0, Math.min(...words.map((w) => { const i = lo.indexOf(w); return i < 0 ? Infinity : i; })) - 300);
    return { file_id: r.file_id, name: r.name, path: r.path, web_link: r.web_link, snippet: Number.isFinite(at) ? t.slice(at, at + 1200) : t.slice(0, 1200) };
  });
}

/* ---------- Knowledge Base (Google Docs ⇄ kb_cases) ---------- */

const KB_FIELDS: Record<string, string> = {
  ringkasan: "summary", kategori: "category", "root cause": "root_cause", "alur penanganan": "investigation", keputusan: "sanction", hasil: "outcome", pelajaran: "lesson",
};
const KB_HEADINGS = ["Ringkasan", "Kategori", "Root Cause", "Alur Penanganan", "Keputusan", "Hasil", "Pelajaran"];

export async function syncKbFromDocs() {
  const f = (await getFlows()).drive;
  if (!googleConfigured() || !f.kbDocId) throw new Error("Google Doc Knowledge Base belum disiapkan di Admin Console.");
  const { paragraphs, revisionId } = await docsParagraphs(f.kbDocId);
  type Entry = { code: string; title: string; f: Record<string, string> };
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  let field: string | null = null;
  for (const p of paragraphs) {
    const text = p.text.trim();
    if (!text) continue;
    if (p.style === "HEADING_1") {
      const m = text.match(/^((?:KB|YRS)-[A-Z0-9-]+?-\d{3})\s*[—–-]\s*(.+)$/);
      cur = m ? { code: m[1], title: m[2].trim(), f: {} } : null;
      if (cur) entries.push(cur);
      field = null;
    } else if (p.style === "HEADING_2" && cur) {
      const k = Object.keys(KB_FIELDS).find((x) => text.toLowerCase().startsWith(x));
      field = k ? KB_FIELDS[k] : null;
    } else if (cur && field) {
      cur.f[field] = (cur.f[field] ? cur.f[field] + "\n" : "") + text;
    }
  }
  const warnings: string[] = [];
  for (const e of entries) {
    if (!e.f.lesson) warnings.push(`${e.code}: heading "Pelajaran" kosong`);
    // Entries that came from a Case / SIGAP stay owned by LDMS; the Doc only adds or edits its own entries.
    await query(
      `insert into kb_cases (code, title, summary, category, root_cause, investigation, sanction, outcome, lesson, source, doc_revision, synced_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'docs',$10,now())
       on conflict (code) do update set title = excluded.title, summary = excluded.summary, category = excluded.category, root_cause = excluded.root_cause,
         investigation = excluded.investigation, sanction = excluded.sanction, outcome = excluded.outcome, lesson = excluded.lesson,
         doc_revision = excluded.doc_revision, synced_at = now(), is_demo = false
       where kb_cases.case_id is null and kb_cases.sigap_id is null`,
      [e.code, e.title, e.f.summary ?? null, e.f.category ?? null, e.f.root_cause ?? null, e.f.investigation ?? null, e.f.sanction ?? null, e.f.outcome ?? null, e.f.lesson ?? null, revisionId],
    );
  }
  await setKV("kb_sync", { at: new Date().toISOString(), cases: entries.length, warnings, revisionId });
  return { cases: entries.length, warnings };
}

export async function appendCaseToKb(c: { code: string; title: string; summary: string; category: string; rootCause: string; flow: string; decision: string; outcome: string; lesson: string }) {
  const f = (await getFlows()).drive;
  if (!googleConfigured() || !f.kbDocId) return false;
  const body = [c.summary, c.category, c.rootCause, c.flow, c.decision, c.outcome, c.lesson];
  await docsAppend(f.kbDocId, [
    { text: `${c.code} — ${c.title}`, style: "HEADING_1" },
    ...KB_HEADINGS.flatMap((h, i) => [{ text: h, style: "HEADING_2" as const }, { text: body[i] || "-", style: "NORMAL_TEXT" as const }]),
  ]);
  return true;
}
