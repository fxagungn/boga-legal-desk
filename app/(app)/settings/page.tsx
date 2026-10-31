import { CheckCircle2, Circle } from "lucide-react";
import { getKV, getSettings, query } from "@/lib/db";
import { currentMember, listMembers } from "@/lib/repo";
import { graphConfigured, mailbox } from "@/lib/graph";
import { appUrl, emailChannel, waChannel } from "@/lib/notify";
import { aiEnabled } from "@/lib/ai";
import { DOC_TYPE_LABEL, ROLE_LABEL, WORKFLOWS, type DocType, type Role } from "@/lib/workflow";
import { formatDateTime } from "@/lib/time";
import { Card, cx, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/actions";
import * as A from "@/app/actions";

export const dynamic = "force-dynamic";

function Conn({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={18} className="mt-0.5 shrink-0 text-ink-3" />}
      <div className="min-w-0 text-[14px]">
        <div className="font-semibold">{title} <span className={cx("ml-1 text-[12.5px]", ok ? "text-ok" : "text-ink-3")}>{ok ? "Aktif" : "Belum aktif"}</span></div>
        <div className="mt-0.5 text-ink-2">{children}</div>
      </div>
    </li>
  );
}

export default async function Settings() {
  const [me, settings, members, sub, lastDaily, demo] = await Promise.all([
    currentMember(),
    getSettings(),
    listMembers(),
    getKV<{ id: string; expiration: string }>("graph_subscription"),
    getKV<{ at: string; breaches: number; escalations: number; digests: number }>("last_daily"),
    query<{ n: number }>(`select count(*)::int as n from documents where is_demo`),
  ]);
  const lead = Boolean(me && ["manager", "agm", "admin"].includes(me.role));
  const roles = Object.keys(ROLE_LABEL) as Role[];

  return (
    <div className="mx-auto max-w-[980px] space-y-6">
      <PageHeader title="Pengaturan" sub={lead ? "Perubahan langsung berlaku untuk seluruh tim." : "Hanya Manager, AGM, atau Admin yang bisa mengubah pengaturan."} />

      {lead && demo[0]?.n > 0 && (
        <Notice tone="warn" action={<ActionButton action={A.deleteDemoAction} id={0} className="btn btn-sm" success="Data contoh dihapus" pending="Menghapus…">Hapus {demo[0].n} data contoh</ActionButton>}>
          Masih ada data contoh. Hapus sebelum tim mulai memakai Legal Desk.
        </Notice>
      )}

      <Card title="Tim" sub="Nama, peran, dan kontak untuk notifikasi email & WhatsApp." pad={false}>
        <div className="divide-y divide-line-2">
          {[...members, null].map((m) => (
            <ActionForm key={m?.id ?? "new"} action={A.saveMemberAction} success={m ? "Tersimpan" : "Anggota ditambahkan"} resetOnDone={!m}
              className="grid gap-2 px-5 py-3 sm:grid-cols-[1.3fr_1fr_1.4fr_1fr_auto] sm:items-center">
              {m && <input type="hidden" name="id" value={m.id} />}
              <input name="name" defaultValue={m?.name} placeholder={m ? "Nama" : "Tambah anggota baru…"} aria-label="Nama" className="input" required disabled={!lead} />
              <select name="role" defaultValue={m?.role ?? "staff"} aria-label="Peran" className="input" disabled={!lead}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <input name="email" type="email" defaultValue={m?.email ?? ""} placeholder="email@bogagroup.com" aria-label="Email" className="input" disabled={!lead} />
              <input name="whatsapp" defaultValue={m?.whatsapp ?? ""} placeholder="0812…" aria-label="WhatsApp" className="input" disabled={!lead} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[13px] text-ink-2"><input type="checkbox" name="active" defaultChecked={m ? m.active : true} disabled={!lead} className="accent-[#c0272d]" /> Aktif</label>
                {lead && <Submit className={m ? "btn btn-sm" : "btn btn-primary btn-sm"}>{m ? "Simpan" : "Tambah"}</Submit>}
              </div>
            </ActionForm>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Aturan">
          <ActionForm action={A.saveSettingsAction} className="space-y-4" success="Aturan disimpan">
            <div>
              <label className="label" htmlFor="s-kw">Kata kunci di subjek email</label>
              <textarea id="s-kw" name="subjectKeywords" rows={2} defaultValue={settings.subjectKeywords.join("\n")} className="input" disabled={!lead} />
              <p className="hint">Email dengan kata ini di subjek otomatis menjadi dokumen. Satu per baris.</p>
            </div>
            <div>
              <label className="label" htmlFor="s-cpo">Kontrak vendor perlu persetujuan CPLO jika nilainya minimal (Rp)</label>
              <input id="s-cpo" name="cpoThreshold" defaultValue={settings.cpoThreshold.toLocaleString("id-ID")} className="input tnum" disabled={!lead} />
            </div>
            <div>
              <label className="label" htmlFor="s-esc">Lapor ke atasan jika terlambat lebih dari (hari kerja)</label>
              <input id="s-esc" name="escalateAfterDays" type="number" min={0} step={0.5} defaultValue={settings.escalateAfterDays} className="input" disabled={!lead} />
            </div>
            <div>
              <label className="label" htmlFor="s-hol">Hari libur (tidak dihitung)</label>
              <textarea id="s-hol" name="holidays" rows={3} defaultValue={settings.holidays.join("\n")} className="input tnum" disabled={!lead} />
              <p className="hint">Format TTTT-BB-HH, satu per baris.</p>
            </div>
            <label className="flex items-center gap-2.5 text-[14px] font-semibold"><input type="checkbox" name="digestEnabled" defaultChecked={settings.digestEnabled} disabled={!lead} className="h-4 w-4 accent-[#c0272d]" /> Kirim daftar tugas tiap pagi kerja (08.00 WIB)</label>
            {lead && <Submit>Simpan aturan</Submit>}
          </ActionForm>
        </Card>

        <Card title="Koneksi">
          <ul className="-my-3 divide-y divide-line-2">
            <Conn ok={graphConfigured()} title="Outlook (mailbox legal)">
              {graphConfigured()
                ? <>Membaca {mailbox()}.{sub && ` Pemantauan aktif s.d. ${formatDateTime(sub.expiration)}.`}</>
                : <>Perlu izin dari IT (App Registration Microsoft). Sementara itu, gunakan Upload email.</>}
            </Conn>
            <Conn ok={aiEnabled()} title="Pembaca dokumen otomatis (AI)">Mengisi pihak lawan, nilai, deadline, dan poin penting dari email & PDF.</Conn>
            <Conn ok={Boolean(emailChannel())} title="Notifikasi email">{emailChannel() ? "Terkirim otomatis saat dokumen pindah langkah atau terlambat." : "Aktif setelah Outlook tersambung."}</Conn>
            <Conn ok={Boolean(waChannel())} title="Notifikasi WhatsApp">{waChannel() ? "Terkirim ke nomor yang diisi di daftar tim." : "Perlu token Fonnte atau WhatsApp Business API."}</Conn>
            <Conn ok={Boolean(lastDaily)} title="Pengecekan harian">
              {lastDaily ? `Terakhir ${formatDateTime(lastDaily.at)}: ${lastDaily.breaches} terlambat, ${lastDaily.escalations} dilaporkan ke atasan.` : "Berjalan otomatis tiap pagi."}
            </Conn>
          </ul>
          {lead && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line-2 pt-4">
              {graphConfigured() && <ActionButton action={A.syncNowAction} id={0} className="btn btn-sm" success="Sinkron selesai" pending="Menyinkron…">Ambil email 14 hari terakhir</ActionButton>}
              <ActionButton action={A.runDailyAction} id={0} className="btn btn-sm" success="Pengecekan selesai" pending="Mengecek…">Cek keterlambatan sekarang</ActionButton>
            </div>
          )}
          <details className="mt-4 text-[13px] text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">Info teknis untuk IT</summary>
            <p className="mt-2">Webhook Outlook: <code>{appUrl()}/api/graph/webhook</code></p>
            <p className="mt-1">Endpoint Power Automate: <code>POST {appUrl()}/api/ingest</code> (header Authorization: Bearer INGEST_TOKEN)</p>
          </details>
        </Card>
      </div>

      <Card title="Alur & target waktu" sub="Target dalam hari kerja. Hitungan berhenti saat menunggu pihak luar." pad={false}>
        <div className="grid gap-px overflow-hidden rounded-b-[12px] bg-line-2 md:grid-cols-3">
          {(Object.keys(WORKFLOWS) as DocType[]).map((t) => (
            <div key={t} className="bg-surface px-5 py-4">
              <h3 className="mb-3 font-bold">{DOC_TYPE_LABEL[t]}</h3>
              <ol className="space-y-2 text-[13.5px]">
                {WORKFLOWS[t].map((s, k) => (
                  <li key={s.key} className="flex justify-between gap-2">
                    <span><span className="text-ink-3 tnum">{k + 1}.</span> {s.label}{s.when ? <span className="text-ink-3"> (jika perlu)</span> : ""}</span>
                    <span className="shrink-0 text-ink-2 tnum">{s.slaDays} hari</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
