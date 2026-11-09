"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireMember } from "@/lib/repo";
import { ACTIONS, isSuperAdmin, MODULES, ROLES, saveAccess, type AccessMatrix, type Action, type Module } from "@/lib/access";
import { saveFlows } from "@/lib/flows";
import { indexDrive, mirrorToDrive, setupDrive, syncKbFromDocs } from "@/lib/drive";
import { driveIdFromUrl, readSheet } from "@/lib/google";
import { audit } from "@/lib/ldms/permits";
import type { Result } from "@/app/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nOrNull = (v: string) => (v ? Number(v) || null : null);

async function sa() {
  const me = await requireMember();
  if (!isSuperAdmin(me)) throw new Error("Hanya Super Admin.");
  return me;
}
async function run(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal menyimpan." };
  }
}

export async function saveAccessAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const a = {} as AccessMatrix;
    for (const m of Object.keys(MODULES) as Module[]) {
      a[m] = { view: [], edit: [], approve: [] };
      for (const act of Object.keys(ACTIONS) as Action[]) a[m][act] = ROLES.filter((r) => f.get(`${m}.${act}.${r}`) === "on");
    }
    await saveAccess(a);
    await audit(me, "ubah hak akses", "admin", "access", "Matrix akses peran × modul diperbarui");
    return "Hak akses disimpan";
  });
}

export async function saveReminderFlowAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const stages = str(f, "agreementStages").split(/[,\s]+/).map(Number).filter((n) => n > 0 && n < 2000);
    await saveFlows({ reminder: {
      sendEnabled: f.get("sendEnabled") === "on", digestEnabled: f.get("digestEnabled") === "on",
      supervisorId: nOrNull(str(f, "supervisorId")), corpSupervisorId: nOrNull(str(f, "corpSupervisorId")), headId: nOrNull(str(f, "headId")), directorId: nOrNull(str(f, "directorId")),
      agreementStages: stages.length ? [...new Set(stages)].sort((a, b) => b - a) : [60, 30, 7],
    } });
    await audit(me, "ubah alur reminder", "admin", "flows", f.get("sendEnabled") === "on" ? "pengiriman email ON" : "pengiriman email OFF");
    return "Alur reminder disimpan";
  });
}

export async function savePunishmentFlowAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const emails = str(f, "hrApprovers").split(/[,\s;]+/).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    const fns = str(f, "submitterFunctions").split("\n").map((s) => s.trim()).filter(Boolean);
    await saveFlows({ punishment: fns.length ? { hrApprovers: emails, submitterFunctions: fns } : { hrApprovers: emails } });
    await audit(me, "ubah alur sanksi", "admin", "flows", `HR approver: ${emails.join(", ") || "—"}`);
    return "Alur sanksi disimpan";
  });
}

export async function saveAiAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    await saveFlows({ ai: { enabled: f.get("enabled") === "on", model: str(f, "model") || "claude-sonnet-5-5" } });
    await audit(me, "ubah pengaturan AI", "admin", "ai", `${f.get("enabled") === "on" ? "aktif" : "nonaktif"} · ${str(f, "model")}`);
    return "Pengaturan AI disimpan";
  });
}

export async function setupDriveAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const r = await setupDrive(str(f, "folderUrl"));
    await saveFlows({ drive: { mirrorEnabled: f.get("mirrorEnabled") === "on" } });
    await audit(me, "sambungkan Google Drive", "admin", "drive", r.folderName);
    return `Tersambung ke folder "${r.folderName}" — LDMS_DB & dokumen KB siap`;
  });
}

export async function driveJobAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const job = str(f, "job");
    if (job === "mirror") { const r = await mirrorToDrive(); await audit(me, "sinkron ke Drive", "admin", "drive", JSON.stringify(r)); return "Database ditulis ke spreadsheet LDMS_DB"; }
    if (job === "index") { const r = await indexDrive(); await audit(me, "index Drive", "admin", "drive", `${r.files} file`); return `Index selesai: ${r.files} file (${r.indexed} diperbarui)`; }
    if (job === "kb") { const r = await syncKbFromDocs(); await audit(me, "sinkron KB", "admin", "drive", `${r.cases} case`); return `KB: ${r.cases} case dari Google Docs`; }
    if (job === "mirror-toggle") { await saveFlows({ drive: { mirrorEnabled: f.get("mirrorEnabled") === "on" } }); return "Disimpan"; }
    throw new Error("Job tidak dikenal.");
  });
}

/* ---------- master data ---------- */

export async function saveBrandAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const id = Number(str(f, "id")) || 0;
    const name = str(f, "name");
    if (!name) throw new Error("Nama brand wajib diisi.");
    const vals = [name, f.get("has_principal") === "on", str(f, "principal_name") || null, str(f, "currency") || "IDR", f.get("active") === "on"];
    if (id) await query(`update brands set name=$2, has_principal=$3, principal_name=$4, currency=$5, active=$6 where id=$1`, [id, ...vals]);
    else await query(`insert into brands (name, has_principal, principal_name, currency, active) values ($1,$2,$3,$4,$5)`, vals);
    await audit(me, id ? "ubah brand" : "tambah brand", "admin", "brand", name);
    return "Brand disimpan";
  });
}

export async function savePermitTypeAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const id = Number(str(f, "id")) || 0;
    const lead = Number(str(f, "lead_days"));
    if (!lead || lead < 1) throw new Error("Ambang renewal (hari) wajib diisi.");
    const cost = str(f, "est_cost").replace(/[^\d]/g, "");
    const vals = [str(f, "name"), str(f, "scope"), lead, Number(str(f, "validity_years")) || null, str(f, "agency") || null, cost ? Number(cost) : null, str(f, "blocker_note") || null, f.get("active") === "on"];
    if (!vals[0]) throw new Error("Nama izin wajib diisi.");
    if (id) await query(`update permit_types set name=$2, scope=$3, lead_days=$4, validity_years=$5, agency=$6, est_cost=$7, blocker_note=$8, active=$9 where id=$1`, [id, ...vals]);
    else {
      const code = str(f, "code").toUpperCase();
      if (!/^[A-Z0-9]{2,6}$/.test(code)) throw new Error("Kode 2–6 huruf/angka.");
      await query(`insert into permit_types (code, name, scope, lead_days, validity_years, agency, est_cost, blocker_note, active, sort) values ($1,$2,$3,$4,$5,$6,$7,$8,$9, (select coalesce(max(sort),0)+1 from permit_types))`, [code, ...vals]);
    }
    await audit(me, id ? "ubah jenis izin" : "tambah jenis izin", "admin", "permit_type", `${vals[0]} · H-${lead}`);
    return "Jenis izin disimpan";
  });
}

export async function saveUnitAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    const id = Number(str(f, "id")) || 0;
    const vals = [str(f, "name"), nOrNull(str(f, "brand_id")), str(f, "scope") || "outlet", str(f, "mall") || null, str(f, "city") || null, str(f, "address") || null,
      str(f, "contact_name") || null, str(f, "contact_email") || null, str(f, "status") === "tutup" ? "tutup" : "aktif"];
    if (!vals[0]) throw new Error("Nama outlet wajib diisi.");
    if (id) await query(`update units set name=$2, brand_id=$3, scope=$4, mall=$5, city=$6, address=$7, contact_name=$8, contact_email=$9, status=$10, is_demo=false where id=$1`, [id, ...vals]);
    else {
      const code = str(f, "code").toUpperCase() || String(vals[0]).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24);
      await query(`insert into units (code, name, brand_id, scope, mall, city, address, contact_name, contact_email, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [code, ...vals]);
    }
    await audit(me, id ? "ubah outlet" : "tambah outlet", "admin", "unit", String(vals[0]));
    return "Outlet disimpan";
  });
}

/** Import LIST OUTLET: paste CSV/TSV (brand, outlet, mal, kota, status[, alamat]) or a Google Sheet link (share Viewer to the service account). */
export async function importOutletsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    let rows: string[][] = [];
    const link = str(f, "sheet");
    if (link) {
      const id = driveIdFromUrl(link);
      if (!id) throw new Error("Link Google Sheet tidak dikenali.");
      rows = (await readSheet(id, str(f, "range") || "A:F")).map((r) => r.map((c) => String(c ?? "").trim()));
    } else {
      const text = str(f, "csv");
      if (!text) throw new Error("Tempel isi CSV atau isi link Google Sheet.");
      const sep = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
      rows = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
    }
    if (rows.length && /brand/i.test(rows[0][0] ?? "")) rows = rows.slice(1);
    const brands = new Map((await query<{ id: number; name: string }>(`select id, name from brands`)).map((b) => [b.name.toLowerCase(), b.id]));
    let added = 0, updated = 0;
    const skipped: string[] = [];
    for (const [brand, name, mall, city, status, address] of rows) {
      if (!name) continue;
      const scope = /central kitchen/i.test(`${brand} ${name}`) ? "central_kitchen" : /head office|korporat/i.test(`${brand} ${name}`) ? "korporat" : "outlet";
      const bid = brand ? brands.get(brand.toLowerCase()) ?? null : null;
      if (scope === "outlet" && brand && !bid) { skipped.push(`${name} (brand "${brand}" belum ada)`); continue; }
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
      const ex = await one<{ id: number }>(`select id from units where lower(name) = lower($1) or code = $2`, [name, code]);
      const vals = [name, bid, scope, mall || null, city || null, address || null, /tutup|closed|non/i.test(status ?? "") ? "tutup" : "aktif"];
      if (ex) { await query(`update units set name=$2, brand_id=$3, scope=$4, mall=$5, city=$6, address=coalesce($7, address), status=$8, is_demo=false where id=$1`, [ex.id, ...vals]); updated++; }
      else { await query(`insert into units (code, name, brand_id, scope, mall, city, address, status) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [code, ...vals]); added++; }
    }
    await audit(me, "impor outlet", "admin", "unit", `${added} baru · ${updated} diperbarui${skipped.length ? ` · ${skipped.length} dilewati` : ""}`);
    return `${added} outlet baru, ${updated} diperbarui${skipped.length ? `; dilewati: ${skipped.slice(0, 5).join(", ")}` : ""}`;
  });
}

/** Import registry izin: CSV / Google Sheet with columns outlet, kode jenis izin, nomor, tanggal terbit, jatuh tempo, PIC (nama atau NIK). */
export async function importPermitsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await sa();
    let rows: string[][] = [];
    const link = str(f, "sheet");
    if (link) {
      const id = driveIdFromUrl(link);
      if (!id) throw new Error("Link Google Sheet tidak dikenali.");
      rows = (await readSheet(id, str(f, "range") || "A:F")).map((r) => r.map((c) => String(c ?? "").trim()));
    } else {
      const text = str(f, "csv");
      if (!text) throw new Error("Tempel isi CSV atau isi link Google Sheet.");
      const sep = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
      rows = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
    }
    if (rows.length && /outlet|unit/i.test(rows[0][0] ?? "")) rows = rows.slice(1);
    const units = await query<{ id: number; name: string; code: string }>(`select id, name, code from units`);
    const types = await query<{ id: number; code: string; name: string }>(`select id, code, name from permit_types`);
    const members = await query<{ id: number; name: string; nik: string | null }>(`select id, name, nik from team_members where active`);
    const toIso = (v: string) => {
      if (!v) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (/^\d{5}$/.test(v)) return new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000).toISOString().slice(0, 10);
      return null;
    };
    let added = 0, updated = 0;
    const skipped: string[] = [];
    for (const [unit, type, number, issue, expiry, pic] of rows) {
      const u = units.find((x) => x.name.toLowerCase() === (unit ?? "").toLowerCase() || x.code === (unit ?? "").toUpperCase());
      const t = types.find((x) => x.code === (type ?? "").toUpperCase() || x.name.toLowerCase() === (type ?? "").toLowerCase());
      const exp = toIso(expiry ?? "");
      if (!u || !t || !exp) { skipped.push(`${unit ?? "?"} / ${type ?? "?"}`); continue; }
      const m = members.find((x) => x.nik?.toUpperCase() === (pic ?? "").toUpperCase() || x.name.toLowerCase().startsWith((pic ?? "").toLowerCase()) && (pic ?? "").length > 2);
      const ex = await one<{ id: number }>(`select id from permits where unit_id = $1 and permit_type_id = $2`, [u.id, t.id]);
      if (ex) {
        await query(`update permits set number = coalesce(nullif($2,''), number), issue_date = coalesce($3, issue_date), expiry_date = $4, pic_id = coalesce($5, pic_id), is_demo = false, updated_at = now(), updated_by = $6 where id = $1`,
          [ex.id, number ?? "", toIso(issue ?? ""), exp, m?.id ?? null, me.name]);
        updated++;
      } else {
        const n = (await one<{ n: number }>(`select nextval('permit_code_seq')::int as n`))!.n;
        await query(`insert into permits (code, unit_id, permit_type_id, number, issue_date, expiry_date, pic_id, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [`D${String(n).padStart(4, "0")}`, u.id, t.id, number || null, toIso(issue ?? ""), exp, m?.id ?? me.id, me.name]);
        added++;
      }
    }
    await audit(me, "impor registry izin", "admin", "permit", `${added} baru · ${updated} diperbarui${skipped.length ? ` · ${skipped.length} dilewati` : ""}`);
    return `${added} izin baru, ${updated} diperbarui${skipped.length ? `; dilewati (outlet/jenis/tanggal tidak dikenali): ${skipped.slice(0, 5).join(", ")}` : ""}`;
  });
}
