"use server";

import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSettings, one, query, saveSettings } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/auth";
import { canAct, completeStage, membersForStage, moveToStage, resume, setHold } from "@/lib/flow";
import { currentMember, getDocument, logEvent, nextCode, pickAssignee, requireMember } from "@/lib/repo";
import { stageDef, isDocType, isRole, normaliseWorkflows, revisionTarget, typeDef } from "@/lib/workflow";
import { birthPassword, hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { appUrl, notify } from "@/lib/notify";
import { normalizeSubject } from "@/lib/subject";
import { runDaily, syncMailbox } from "@/lib/jobs";
import { ensureSubscription, graphConfigured } from "@/lib/graph";
import { saveAttachments } from "@/lib/ingest";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return v ? Number(v) : null;
};

export type Result = { ok: true; message?: string } | { error: string } | null;

/** Run a mutation and turn thrown errors into a message the UI can show. */
async function run(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi." };
  }
}

/* ---------- auth ---------- */

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export async function login(_: unknown, f: FormData) {
  const nik = str(f, "nik").toUpperCase().replace(/\s+/g, "");
  const password = String(f.get("password") ?? "");
  if (!nik || !password) return { error: "Isi NIK dan password." };
  const m = await one<{ id: number; password_hash: string | null; must_change_password: boolean; failed_logins: number; locked_until: string | null; active: boolean }>(
    `select id, password_hash, must_change_password, failed_logins, locked_until, active from team_members where upper(nik) = $1`,
    [nik],
  );
  const wrong = { error: "NIK atau password salah." };
  if (!m || !m.active) return wrong;
  if (m.locked_until && new Date(m.locked_until) > new Date()) {
    const mins = Math.ceil((+new Date(m.locked_until) - Date.now()) / 60000);
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${mins} menit, atau minta Manager Legal me-reset password.` };
  }
  if (!m.password_hash) return { error: "Akun Anda belum punya password. Minta Manager Legal mengaturnya di Pengaturan." };
  if (!verifyPassword(password, m.password_hash)) {
    const tries = m.failed_logins + 1;
    await query(
      `update team_members set failed_logins = $2, locked_until = case when $2 >= ${MAX_TRIES} then now() + interval '${LOCK_MINUTES} minutes' else null end where id = $1`,
      [m.id, tries >= MAX_TRIES ? 0 : tries],
    );
    return tries >= MAX_TRIES ? { error: `Akun dikunci ${LOCK_MINUTES} menit karena terlalu banyak percobaan.` } : { error: `NIK atau password salah. Sisa ${MAX_TRIES - tries} percobaan.` };
  }
  await query(`update team_members set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1`, [m.id]);
  const jar = await cookies();
  // Until the initial password is changed the session lasts only for this browser session.
  jar.set(SESSION_COOKIE, await signSession(m.id), { ...COOKIE_OPTS, ...(m.must_change_password ? {} : { maxAge: 30 * 86400 }) });
  const next = str(f, "next");
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(m.must_change_password ? `/ganti-password?next=${encodeURIComponent(dest)}` : dest);
}

export async function changePasswordAction(_: unknown, f: FormData) {
  const me = await currentMember();
  if (!me) redirect("/login");
  const row = await one<{ password_hash: string | null }>(`select password_hash from team_members where id = $1`, [me.id]);
  const current = String(f.get("current") ?? "");
  const next = String(f.get("new") ?? "");
  const confirm = String(f.get("confirm") ?? "");
  if (!verifyPassword(current, row?.password_hash)) return { error: "Password saat ini salah." };
  if (next !== confirm) return { error: "Konfirmasi password tidak sama." };
  if (next === current) return { error: "Password baru harus berbeda dari yang lama." };
  const problem = passwordProblem(next, me.nik ?? null);
  if (problem) return { error: problem };
  await query(`update team_members set password_hash = $2, must_change_password = false where id = $1`, [me.id, hashPassword(next)]);
  (await cookies()).set(SESSION_COOKIE, await signSession(me.id), { ...COOKIE_OPTS, maxAge: 30 * 86400 });
  const dest = str(f, "next");
  redirect(dest.startsWith("/") && !dest.startsWith("//") ? dest : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- workflow ---------- */

async function loadForAction(f: FormData) {
  const me = await requireMember();
  const doc = await getDocument(Number(str(f, "id")));
  if (!doc) throw new Error("Dokumen tidak ditemukan");
  const settings = await getSettings();
  return { me, doc, settings, wf: settings.workflows };
}

function done(id: number) {
  revalidatePath("/", "layout");
  revalidatePath(`/documents/${id}`);
}

export async function advanceAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc, settings } = await loadForAction(f);
    if (doc.status !== "active") throw new Error("Lanjutkan dokumen dulu sebelum memindahkan tahap.");
    if (!canAct(me, doc, settings)) throw new Error("Tahap ini hanya bisa disetujui oleh peran yang berwenang.");
    await completeStage(doc.id, me.name, str(f, "note") || null);
    done(doc.id);
  });
}

export async function revisionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc, settings, wf } = await loadForAction(f);
    if (!canAct(me, doc, settings)) throw new Error("Anda tidak berwenang di tahap ini.");
    const to = revisionTarget(wf, doc.doc_type, doc.stage)?.key ?? "intake";
    await moveToStage(doc.id, to, me.name, { type: "revision", message: str(f, "note") || "Minta revisi" });
    done(doc.id);
  });
}

export async function moveAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc, wf } = await loadForAction(f);
    if (me.role === "staff" || me.role === "cpo") throw new Error("Memindahkan tahap secara manual hanya untuk Manager, AGM, atau Admin.");
    const to = str(f, "stage");
    if (!stageDef(wf, doc.doc_type, to)) throw new Error("Tahap tidak valid");
    await moveToStage(doc.id, to, me.name, { type: "moved", message: str(f, "note") || "Dipindah manual" });
    done(doc.id);
  });
}

export async function holdAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await setHold(doc.id, me.name, str(f, "reason") || "Menunggu pihak lain");
    done(doc.id);
  });
}

export async function resumeAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await resume(doc.id, me.name);
    done(doc.id);
  });
}

export async function cancelAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    if (me.role === "staff") throw new Error("Pembatalan butuh Manager ke atas.");
    await query(`update documents set status='cancelled', completed_at=now(), updated_at=now() where id=$1`, [doc.id]);
    await logEvent(doc.id, { type: "cancelled", actor: me.name, message: str(f, "reason") || "Dibatalkan" });
    done(doc.id);
  });
}

export async function reopenAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await query(`update documents set status='active', completed_at=null, stage_entered_at=now(), paused_ms=0, updated_at=now() where id=$1`, [doc.id]);
    await logEvent(doc.id, { type: "reopened", actor: me.name, message: "Dibuka kembali" });
    done(doc.id);
  });
}

export async function applySuggestionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc, settings, wf } = await loadForAction(f);
    const s = doc.ai_suggestion;
    if (!s) return;
    if (s.stage && stageDef(wf, doc.doc_type, s.stage)) {
      const target = stageDef(wf, doc.doc_type, s.stage)!;
      const current = stageDef(wf, doc.doc_type, doc.stage);
      if ((target.approval || current?.approval) && !canAct(me, doc, settings) && me.role !== "manager" && me.role !== "agm") {
        throw new Error("Saran ini melewati tahap approval; minta approver menerapkannya.");
      }
      await moveToStage(doc.id, s.stage, me.name, { type: "moved", message: `Menerapkan saran AI: ${s.reason}` });
    }
    if (s.hold) await setHold(doc.id, me.name, s.reason);
    await query(`update documents set ai_suggestion=null where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function dismissSuggestionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { doc } = await loadForAction(f);
    await query(`update documents set ai_suggestion=null where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function noteAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const note = str(f, "note");
    if (!note) return;
    await logEvent(doc.id, { type: "note", actor: me.name, message: note });
    await query(`update documents set last_activity_at=now() where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function updateDetailsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc, wf } = await loadForAction(f);
    const type = str(f, "doc_type");
    const docType = isDocType(wf, type) ? type : doc.doc_type;
    const assignee = str(f, "assignee_id") ? Number(str(f, "assignee_id")) : null;
    const fields = {
      title: str(f, "title") || doc.title,
      doc_type: docType,
      counterparty: str(f, "counterparty") || null,
      contract_value: num(f, "contract_value"),
      currency: str(f, "currency") || "IDR",
      deadline: str(f, "deadline") || null,
      urgent: f.get("urgent") === "on",
      risk_level: ["low", "medium", "high"].includes(str(f, "risk_level")) ? str(f, "risk_level") : doc.risk_level,
        assignee_id: assignee,
    };
    // If the type changed and the current stage doesn't exist in the new workflow, restart at intake.
    const steps = typeDef(wf, docType).stages;
    const stage = steps.some((s) => s.key === doc.stage) ? doc.stage : steps[0].key;
    // Per-document step overrides: "key" = skip this step, "+key" = force a conditional step on.
    let skip = doc.skip_stages ?? [];
    if (f.get("steps_form") && docType === doc.doc_type) {
      skip = [];
      for (const st of steps) {
        const v = str(f, `step_${st.key}`);
        if (st.key === doc.stage) continue;
        if (v === "skip") skip.push(st.key);
        else if (v === "force" && st.condition === "high_value") skip.push(`+${st.key}`);
      }
    } else if (docType !== doc.doc_type) skip = [];
    await query(
      `update documents set title=$2, doc_type=$3, counterparty=$4, contract_value=$5, currency=$6, deadline=$7, urgent=$8,
        risk_level=$9, require_cpo=null, assignee_id=$10, stage=$11, skip_stages=$12::jsonb, updated_at=now() where id=$1`,
      [doc.id, fields.title, fields.doc_type, fields.counterparty, fields.contract_value, fields.currency, fields.deadline, fields.urgent, fields.risk_level, fields.assignee_id, stage, JSON.stringify(skip)],
    );
    if (JSON.stringify(skip) !== JSON.stringify(doc.skip_stages ?? [])) {
      const names = (keys: string[]) => keys.map((k) => steps.find((x) => x.key === k.replace(/^\+/, ""))?.label ?? k).join(", ");
      const off = skip.filter((k) => !k.startsWith("+"));
      const on = skip.filter((k) => k.startsWith("+"));
      await logEvent(doc.id, { type: "edited", actor: me.name, message: `Alur dokumen diubah${off.length ? `. Dilewati: ${names(off)}` : ""}${on.length ? `. Diwajibkan: ${names(on)}` : ""}` });
    }
    const changes: string[] = [];
    if (fields.deadline !== doc.deadline) changes.push(`deadline → ${fields.deadline ?? "kosong"}`);
    if (fields.assignee_id !== doc.assignee_id) changes.push("PIC diganti");
    if (fields.doc_type !== doc.doc_type) changes.push("jenis dokumen diganti");
    if (fields.risk_level !== doc.risk_level) changes.push(`risiko → ${fields.risk_level}`);
    await logEvent(doc.id, { type: "edited", actor: me.name, message: changes.length ? changes.join(", ") : "Detail diperbarui" });
    if (fields.assignee_id && fields.assignee_id !== doc.assignee_id) {
      const after = (await getDocument(doc.id))!;
      await notify(await membersForStage(after), {
        kind: "assigned", documentId: doc.id, subject: `[${doc.code}] Ditugaskan ke Anda: ${doc.title}`,
        lines: [`${me.name} menugaskan dokumen ini ke Anda`, doc.title], link: `${appUrl()}/documents/${doc.id}`,
      });
    }
    done(doc.id);
  });
}

export async function uploadAttachmentAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    const saved = await saveAttachments(doc.id, null, await Promise.all(files.map(async (x) => ({ name: x.name, contentType: x.type, data: new Uint8Array(await x.arrayBuffer()) }))));
    if (saved) await logEvent(doc.id, { type: "attachment", actor: me.name, message: `${saved} lampiran ditambahkan` });
    done(doc.id);
  });
}

export async function createManualAction(f: FormData) {
  const me = await requireMember();
  const settings = await getSettings();
  const type = str(f, "doc_type");
  const title = str(f, "title");
  if (!title) throw new Error("Judul wajib diisi");
  const code = await nextCode();
  const assignee = str(f, "assignee_id") ? Number(str(f, "assignee_id")) : await pickAssignee();
  const r = await one<{ id: number }>(
    `insert into documents (code, title, doc_type, counterparty, contract_value, deadline, urgent, risk_level, assignee_id, requester_name, summary, source, normalized_subject, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12,$13) returning id`,
    [code, title, isDocType(settings.workflows, type) ? type : settings.workflows[0].key, str(f, "counterparty") || null, num(f, "contract_value"), str(f, "deadline") || null, f.get("urgent") === "on", str(f, "risk_level") || "medium", assignee, str(f, "requester_name") || me.name, str(f, "summary") || null, normalizeSubject(title), settings.uatMode],
  );
  await logEvent(r!.id, { type: "created", actor: me.name, message: "Dibuat manual" });
  const doc = (await getDocument(r!.id))!;
  await notify(await membersForStage(doc), {
    kind: "created", documentId: doc.id, subject: `[${code}] Dokumen baru: ${title}`,
    lines: [`${me.name} membuat dokumen baru untuk Anda`, title], link: `${appUrl()}/documents/${doc.id}`,
  });
  revalidatePath("/", "layout");
  redirect(`/documents/${r!.id}`);
}

/* ---------- settings ---------- */

async function requireLead() {
  const me = await requireMember();
  if (!["manager", "agm", "admin"].includes(me.role)) throw new Error("Pengaturan hanya bisa diubah Manager, AGM, atau Admin.");
  return me;
}

export async function saveMemberAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const id = str(f, "id");
    const role = str(f, "role");
    if (!isRole(role)) throw new Error("Peran tidak valid");
    const nik = str(f, "nik").toUpperCase().replace(/\s+/g, "") || null;
    const vals = [str(f, "name"), role, str(f, "email") || null, str(f, "whatsapp") || null, f.get("active") === "on", str(f, "title") || null, nik];
    if (!vals[0]) throw new Error("Nama wajib diisi");
    if (nik) {
      const dup = await one<{ id: number }>(`select id from team_members where upper(nik) = $1 and id <> $2`, [nik, Number(id) || 0]);
      if (dup) throw new Error(`NIK ${nik} sudah dipakai anggota lain.`);
    }
    const birth = str(f, "birth");
    if (id) {
      await query(`update team_members set name=$2, role=$3, email=$4, whatsapp=$5, active=$6, title=$7, nik=$8 where id=$1`, [Number(id), ...vals]);
    } else {
      if (!nik || !birth) throw new Error("Anggota baru wajib punya NIK dan tanggal lahir (untuk password awal).");
      await query(
        `insert into team_members (name, role, email, whatsapp, active, title, nik, password_hash, must_change_password) values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [...vals, hashPassword(birthPassword(birth))],
      );
    }
    revalidatePath("/settings");
  });
}

export async function resetPasswordAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const id = Number(str(f, "id"));
    const birth = str(f, "birth");
    if (!birth) throw new Error("Isi tanggal lahir anggota ini.");
    const m = await one<{ name: string; nik: string | null }>(`select name, nik from team_members where id = $1`, [id]);
    if (!m) throw new Error("Anggota tidak ditemukan.");
    if (!m.nik) throw new Error("Isi NIK anggota ini dulu.");
    await query(
      `update team_members set password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = null where id = $1`,
      [id, hashPassword(birthPassword(birth))],
    );
    revalidatePath("/settings");
    return `Password ${m.name} direset ke tanggal lahir`;
  });
}

export async function saveWorkflowsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(f.get("workflows") ?? ""));
    } catch {
      throw new Error("Data alur tidak terbaca. Muat ulang halaman lalu coba lagi.");
    }
    const wf = normaliseWorkflows(parsed);
    // Running documents must still point at a step and type that exist.
    const open = await query<{ code: string; doc_type: string; stage: string }>(`select code, doc_type, stage from documents where status in ('active','on_hold')`);
    for (const d of open) {
      const t = wf.find((x) => x.key === d.doc_type);
      if (!t) throw new Error(`Jenis dokumen untuk ${d.code} tidak boleh dihapus selama dokumen itu masih berjalan.`);
      if (!t.stages.some((x) => x.key === d.stage)) {
        const cur = typeDef((await getSettings()).workflows, d.doc_type).stages.find((x) => x.key === d.stage);
        throw new Error(`Langkah "${cur?.label ?? d.stage}" masih dipakai ${d.code}. Pindahkan dokumen itu dulu sebelum menghapus langkahnya.`);
      }
    }
    await saveSettings({ workflows: wf });
    revalidatePath("/", "layout");
    return "Alur persetujuan disimpan";
  });
}

export async function saveSystemAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireLead();
    const uatMode = f.get("uatMode") === "on";
    const maintenance = f.get("maintenance") === "on";
    const uatRecipient = str(f, "uatRecipient");
    if (uatMode && uatRecipient && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(uatRecipient)) throw new Error("Email penguji tidak valid.");
    const before = await getSettings();
    await saveSettings({ uatMode, uatRecipient, maintenance, maintenanceMessage: str(f, "maintenanceMessage") || before.maintenanceMessage });
    if (before.maintenance !== maintenance || before.uatMode !== uatMode) console.log(`[system] ${me.name}: uat=${uatMode} maintenance=${maintenance}`);
    revalidatePath("/", "layout");
    return "Pengaturan sistem disimpan";
  });
}

export async function saveSettingsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const current = await getSettings();
    await saveSettings({
      subjectKeywords: str(f, "subjectKeywords").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      cpoThreshold: num(f, "cpoThreshold") ?? current.cpoThreshold,
      holidays: str(f, "holidays").split(/[\s,]+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      escalateAfterDays: Number(str(f, "escalateAfterDays")) || current.escalateAfterDays,
      digestEnabled: f.get("digestEnabled") === "on",
    });
    revalidatePath("/", "layout");
  });
}

export async function syncNowAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    if (graphConfigured()) {
      await ensureSubscription(appUrl()).catch((e) => console.error("subscription", e));
      await syncMailbox(14);
    }
    revalidatePath("/", "layout");
  });
}

export async function runDailyAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    await runDaily();
    revalidatePath("/settings");
  });
}

export async function deleteDemoAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    await query(`delete from documents where is_demo`);
    revalidatePath("/", "layout");
  });
}
