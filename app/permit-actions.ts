"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireMember, type Member } from "@/lib/repo";
import { requireCan } from "@/lib/access";
import {
  audit, canEditPermit, canManageSomasi, getPermit, nextPermitCode, RENEWAL_LABEL, RENEWAL_STEPS,
  type PermitRow, type RenewalStatus,
} from "@/lib/ldms/permits";
import type { Result } from "@/app/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const money = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};

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

async function loadEditable(f: FormData): Promise<{ me: Member; p: PermitRow }> {
  const me = await requireMember();
  await requireCan(me, "permit", "edit");
  const p = await getPermit(Number(str(f, "id")));
  if (!p) throw new Error("Dokumen izin tidak ditemukan.");
  if (!canEditPermit(me, p)) throw new Error(`Hanya PIC (${p.pic_name ?? "—"}) atau Supervisor ke atas yang bisa mengubah izin ini.`);
  return { me, p };
}

const touch = (id: number, me: Member) => query(`update permits set updated_at = now(), updated_by = $2 where id = $1`, [id, me.name]);
const refresh = () => revalidatePath("/", "layout");

export async function setRenewalAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, p } = await loadEditable(f);
    const status = str(f, "status") as RenewalStatus;
    if (!RENEWAL_STEPS.includes(status)) throw new Error("Status tidak valid.");
    if (status === p.renewal_status) return;
    await query(`update permits set renewal_status = $2, renewal_eta = coalesce($3::date, renewal_eta) where id = $1`, [p.id, status, isoDate(str(f, "eta"))]);
    await touch(p.id, me);
    await audit(me, "status renewal", "permit", p.id, `${RENEWAL_LABEL[p.renewal_status]} → ${RENEWAL_LABEL[status]}`);
    refresh();
    return `Status: ${RENEWAL_LABEL[status]}`;
  });
}

/** "Terbit": archive the current period, store the new one, reminders restart from the new expiry date. */
export async function issuePermitAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, p } = await loadEditable(f);
    const issue = isoDate(str(f, "issue_date"));
    const expiry = isoDate(str(f, "expiry_date"));
    if (!expiry) throw new Error("Isi tanggal berlaku sampai yang baru.");
    if (p.expiry_date && expiry <= p.expiry_date) throw new Error("Tanggal berlaku baru harus setelah tanggal jatuh tempo lama.");
    if (issue && issue > expiry) throw new Error("Tanggal terbit tidak boleh setelah tanggal berlaku sampai.");
    await query(`insert into permit_periods (permit_id, number, issue_date, expiry_date, closed_by) values ($1,$2,$3,$4,$5)`,
      [p.id, p.number, p.issue_date, p.expiry_date, me.name]);
    await query(
      `update permits set number = coalesce(nullif($2,''), number), issue_date = $3, expiry_date = $4, renewal_status = 'belum',
         renewal_eta = null, cost_actual = coalesce($5, cost_actual) where id = $1`,
      [p.id, str(f, "number"), issue, expiry, money(str(f, "cost_actual"))],
    );
    const file = f.get("file");
    if (file instanceof File && file.size > 0) await saveFile(me, "permit", p.id, file);
    await touch(p.id, me);
    await audit(me, "terbit", "permit", p.id, `Berlaku s.d. ${expiry}${str(f, "number") ? ` · No. ${str(f, "number")}` : ""}`);
    refresh();
    return "Izin terbit — periode baru tersimpan";
  });
}

export async function markSomasiAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "permit", "approve");
    if (!canManageSomasi(me)) throw new Error("Menandai somasi hanya untuk Supervisor ke atas.");
    const p = await getPermit(Number(str(f, "id")));
    if (!p) throw new Error("Dokumen izin tidak ditemukan.");
    const text = str(f, "somasi_text");
    if (text.length < 10) throw new Error("Tulis nomor/perihal somasi (minimal 10 karakter).");
    await query(
      `update permits set requires_ack = true, somasi_text = $2, somasi_at = now(), somasi_by = $3, ack_by = null, ack_at = null, ack_via = null where id = $1`,
      [p.id, text, me.name],
    );
    await touch(p.id, me);
    await audit(me, "tandai somasi", "permit", p.id, text);
    refresh();
    return "Ditandai bersomasi — wajib acknowledge";
  });
}

export async function clearSomasiAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "permit", "approve");
    if (!canManageSomasi(me)) throw new Error("Mencabut somasi hanya untuk Supervisor ke atas.");
    const id = Number(str(f, "id"));
    await query(`update permits set requires_ack = false, somasi_text = null, somasi_at = null, somasi_by = null, ack_by = null, ack_at = null, ack_via = null where id = $1`, [id]);
    await touch(id, me);
    await audit(me, "cabut somasi", "permit", id, str(f, "reason") || null);
    refresh();
    return "Status somasi dicabut";
  });
}

export async function ackSomasiAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, p } = await loadEditable(f);
    if (!p.requires_ack) throw new Error("Dokumen ini tidak sedang bersomasi.");
    if (p.ack_at) return "Sudah di-acknowledge";
    await query(`update permits set ack_by = $2, ack_at = now(), ack_via = 'web app' where id = $1`, [p.id, me.name]);
    await audit(me, "acknowledge somasi", "permit", p.id, str(f, "note") || null);
    refresh();
    return "Somasi di-acknowledge";
  });
}

export async function addNoteAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    const entity = str(f, "entity") || "permit";
    if (!["permit", "agreement"].includes(entity)) throw new Error("Jenis catatan tidak dikenal.");
    await requireCan(me, entity === "permit" ? "permit" : "agreement", "edit");
    const id = Number(str(f, "id"));
    if (entity === "permit") {
      const p = await getPermit(id);
      if (!p) throw new Error("Dokumen izin tidak ditemukan.");
      if (!canEditPermit(me, p)) throw new Error(`Hanya PIC (${p.pic_name ?? "—"}) atau Supervisor ke atas yang bisa menambah catatan di izin ini.`);
    }
    const body = str(f, "body");
    if (!body) throw new Error("Catatan masih kosong.");
    if (body.length > 4000) throw new Error("Catatan terlalu panjang (maks. 4.000 karakter).");
    await query(`insert into notes (entity, entity_id, body, by_id, by_name) values ($1,$2,$3,$4,$5)`, [entity, id, body, me.id, me.name]);
    await audit(me, "catatan", entity, id, body.slice(0, 140));
    refresh();
    return "Catatan ditambahkan";
  });
}

const MAX_FILE = 4 * 1024 * 1024;

async function saveFile(me: Member, entity: string, id: number, file: File) {
  if (file.size > MAX_FILE) throw new Error("File maksimal 4 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  await query(
    `insert into files (entity, entity_id, filename, content_type, size, sha256, data, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entity, id, file.name.slice(0, 200), file.type || "application/octet-stream", file.size, createHash("sha256").update(buf).digest("hex"), buf, me.name],
  );
  await audit(me, "upload file", entity, id, file.name);
}

export async function uploadFileAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, p } = await loadEditable(f);
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Pilih file dulu.");
    await saveFile(me, "permit", p.id, file);
    await touch(p.id, me);
    refresh();
    return "File diunggah";
  });
}

/** Create (no id) or edit the core fields of a permit. */
export async function savePermitAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "permit", "edit");
    const id = Number(str(f, "id")) || 0;
    const fields = {
      unit_id: Number(str(f, "unit_id")) || null,
      permit_type_id: Number(str(f, "permit_type_id")) || null,
      number: str(f, "number") || null,
      issue_date: isoDate(str(f, "issue_date")),
      expiry_date: isoDate(str(f, "expiry_date")),
      pic_id: Number(str(f, "pic_id")) || null,
      cost_actual: money(str(f, "cost_actual")),
    };
    if (fields.issue_date && fields.expiry_date && fields.issue_date > fields.expiry_date) throw new Error("Tanggal terbit tidak boleh setelah jatuh tempo.");
    if (id) {
      const { p } = await loadEditable(f);
      if (me.role === "staff" && fields.pic_id !== p.pic_id) throw new Error("Memindahkan PIC hanya untuk Supervisor ke atas.");
      await query(
        `update permits set number=$2, issue_date=$3, expiry_date=$4, pic_id=$5, cost_actual=$6 where id=$1`,
        [id, fields.number, fields.issue_date, fields.expiry_date, fields.pic_id, fields.cost_actual],
      );
      await touch(id, me);
      await audit(me, "ubah data", "permit", id, [fields.number && `No. ${fields.number}`, fields.expiry_date && `jatuh tempo ${fields.expiry_date}`].filter(Boolean).join(" · "));
      refresh();
      return "Data izin disimpan";
    }
    if (!fields.unit_id || !fields.permit_type_id) throw new Error("Pilih unit dan jenis izin.");
    if (!fields.expiry_date) throw new Error("Isi tanggal jatuh tempo.");
    const dup = await one<{ code: string }>(`select code from permits where unit_id = $1 and permit_type_id = $2`, [fields.unit_id, fields.permit_type_id]);
    if (dup) throw new Error(`Unit ini sudah punya izin tersebut (${dup.code}). Perbarui dokumen itu saja.`);
    const code = await nextPermitCode();
    const r = await one<{ id: number }>(
      `insert into permits (code, unit_id, permit_type_id, number, issue_date, expiry_date, pic_id, cost_actual, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [code, fields.unit_id, fields.permit_type_id, fields.number, fields.issue_date, fields.expiry_date, fields.pic_id ?? me.id, fields.cost_actual, me.name],
    );
    const file = f.get("file");
    if (file instanceof File && file.size > 0) await saveFile(me, "permit", r!.id, file);
    await audit(me, "tambah izin", "permit", r!.id, code);
    refresh();
    return `${code} ditambahkan`;
  });
}
