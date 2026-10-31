import Link from "next/link";
import { CheckCircle2, Circle, FlaskConical, KeyRound, Wrench } from "lucide-react";
import { getKV, getSettings, query } from "@/lib/db";
import { currentMember, listMembers } from "@/lib/repo";
import { graphConfigured, mailbox } from "@/lib/graph";
import { appUrl, emailChannel, waChannel } from "@/lib/notify";
import { aiEnabled } from "@/lib/ai";
import { DEFAULT_WORKFLOWS, ROLE_LABEL, type Role } from "@/lib/workflow";
import { money } from "@/lib/format";
import { formatDateTime, timeAgo } from "@/lib/time";
import { Avatar, Card, cx, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionDialog, ActionForm, Submit } from "@/components/actions";
import { WorkflowEditor } from "@/components/WorkflowEditor";
import * as A from "@/app/actions";

export const dynamic = "force-dynamic";

type Tab = "tim" | "alur" | "aturan" | "sistem";

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

function Toggle({ name, defaultChecked, disabled, title, desc, icon: Icon, tone }: { name: string; defaultChecked: boolean; disabled: boolean; title: string; desc: string; icon: typeof Wrench; tone: string }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:checked]:border-current", tone)}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13.5px] text-ink-2">{desc}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
      <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-line transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-current peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
    </label>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: Tab }> }) {
  const tab: Tab = (await searchParams).tab ?? "tim";
  const [me, settings, members, sub, lastDaily, demo, usageRows] = await Promise.all([
    currentMember(),
    getSettings(),
    listMembers(),
    getKV<{ id: string; expiration: string }>("graph_subscription"),
    getKV<{ at: string; breaches: number; escalations: number }>("last_daily"),
    query<{ n: number }>(`select count(*)::int as n from documents where is_demo`),
    query<{ doc_type: string; stage: string; n: number }>(`select doc_type, stage, count(*)::int as n from documents where status in ('active','on_hold') group by 1, 2`),
  ]);
  const lead = Boolean(me && ["manager", "agm", "admin"].includes(me.role));
  const roles = Object.keys(ROLE_LABEL) as Role[];
  const usage: Record<string, Record<string, number>> = {};
  for (const r of usageRows) (usage[r.doc_type] ??= {})[r.stage] = r.n;

  const tabs: { key: Tab; label: string }[] = [
    { key: "tim", label: "Tim & akses" },
    { key: "alur", label: "Alur persetujuan" },
    { key: "aturan", label: "Aturan" },
    { key: "sistem", label: "Sistem" },
  ];

  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader title="Pengaturan" sub={lead ? "Perubahan langsung berlaku untuk seluruh tim." : "Hanya Manager, AGM, atau Admin yang bisa mengubah pengaturan."} />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link key={t.key} href={`/settings${t.key === "tim" ? "" : `?tab=${t.key}`}`} scroll={false}
            className={cx("-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[14px] font-semibold", tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "tim" && (
        <div className="space-y-5">
          <Notice tone="info">
            Login memakai <b>NIK</b>. Password awal adalah <b>tanggal lahir (DDMMYYYY)</b>, misalnya 17 Agustus 1990 → <code>17081990</code>, dan wajib diganti saat login pertama.
          </Notice>
          <Card pad={false}>
            <ul className="divide-y divide-line-2">
              {members.map((m) => (
                <li key={m.id} className="px-5 py-4">
                  <ActionForm action={A.saveMemberAction} success="Tersimpan" className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1.4fr_auto] lg:items-end">
                    <input type="hidden" name="id" value={m.id} />
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={36} tone={m.active ? "ink" : "mute"} />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input name="name" defaultValue={m.name} aria-label="Nama" className="input h-9 font-semibold" required disabled={!lead} />
                        <input name="title" defaultValue={m.title ?? ""} aria-label="Jabatan" placeholder="Jabatan" className="input h-8 text-[13px]" disabled={!lead} />
                      </div>
                    </div>
                    <div><label className="label">Peran</label>
                      <select name="role" defaultValue={m.role} className="input h-9" disabled={!lead}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
                    <div><label className="label">NIK</label><input name="nik" defaultValue={m.nik ?? ""} className="input h-9 uppercase tnum" placeholder="BG000000" disabled={!lead} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="label">Email</label><input name="email" type="email" defaultValue={m.email ?? ""} className="input h-9" placeholder="nama@boga.co.id" disabled={!lead} /></div>
                      <div><label className="label">WhatsApp</label><input name="whatsapp" defaultValue={m.whatsapp ?? ""} className="input h-9" placeholder="0812…" disabled={!lead} /></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[13px] text-ink-2"><input type="checkbox" name="active" defaultChecked={m.active} disabled={!lead} className="accent-[#c0272d]" /> Aktif</label>
                      {lead && <Submit className="btn btn-sm">Simpan</Submit>}
                    </div>
                  </ActionForm>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-[12.5px]">
                    {!m.nik ? <span className="font-semibold text-warn">Belum bisa login: NIK kosong</span>
                      : !m.has_password ? <span className="font-semibold text-warn">Belum punya password</span>
                      : m.must_change_password ? <span className="text-ink-2">Belum ganti password awal</span>
                      : <span className="text-ok">Aktif login</span>}
                    {m.last_login_at && <span className="text-ink-3">Login terakhir {timeAgo(m.last_login_at)}</span>}
                    {lead && m.nik && (
                      <ActionDialog action={A.resetPasswordAction} id={m.id} triggerClass="btn btn-ghost btn-sm -ml-2 h-7 text-[12.5px]"
                        trigger={<><KeyRound size={13} /> Reset password</>}
                        title={`Reset password ${m.name}`} desc="Password kembali ke tanggal lahir dan wajib diganti saat login berikutnya. Kunci akun juga dibuka."
                        submit="Reset password">
                        <label className="label" htmlFor={`birth-${m.id}`}>Tanggal lahir</label>
                        <input id={`birth-${m.id}`} name="birth" type="date" required className="input" />
                      </ActionDialog>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {lead && (
            <Card title="Tambah anggota">
              <ActionForm action={A.saveMemberAction} success="Anggota ditambahkan" resetOnDone className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div><label className="label" htmlFor="n-name">Nama</label><input id="n-name" name="name" className="input" required /></div>
                <div><label className="label" htmlFor="n-title">Jabatan</label><input id="n-title" name="title" className="input" /></div>
                <div><label className="label" htmlFor="n-role">Peran</label>
                  <select id="n-role" name="role" defaultValue="staff" className="input">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
                <div><label className="label" htmlFor="n-nik">NIK</label><input id="n-nik" name="nik" className="input uppercase" required placeholder="BG000000" /></div>
                <div><label className="label" htmlFor="n-birth">Tanggal lahir</label><input id="n-birth" name="birth" type="date" className="input" required /><p className="hint">Jadi password awal (DDMMYYYY).</p></div>
                <div><label className="label" htmlFor="n-email">Email</label><input id="n-email" name="email" type="email" className="input" placeholder="nama@boga.co.id" /></div>
                <input type="hidden" name="active" value="on" />
                <div className="sm:col-span-2 lg:col-span-3"><Submit>Tambah anggota</Submit></div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "alur" && (
        <Card title="Alur persetujuan per jenis dokumen" sub="Atur urutan langkah, siapa yang mengerjakan atau menyetujui, dan target waktunya. Berlaku untuk dokumen baru dan yang sedang berjalan.">
          <WorkflowEditor initial={settings.workflows} defaults={DEFAULT_WORKFLOWS} usage={usage} threshold={money(settings.cpoThreshold)} action={A.saveWorkflowsAction} readOnly={!lead} />
        </Card>
      )}

      {tab === "aturan" && (
        <Card title="Aturan">
          <ActionForm action={A.saveSettingsAction} className="grid max-w-2xl gap-4" success="Aturan disimpan">
            <div>
              <label className="label" htmlFor="s-kw">Kata kunci di subjek email</label>
              <textarea id="s-kw" name="subjectKeywords" rows={2} defaultValue={settings.subjectKeywords.join("\n")} className="input" disabled={!lead} />
              <p className="hint">Email dengan kata ini di subjek otomatis menjadi dokumen. Satu per baris.</p>
            </div>
            <div>
              <label className="label" htmlFor="s-cpo">Batas &ldquo;nilai besar&rdquo; (Rp)</label>
              <input id="s-cpo" name="cpoThreshold" defaultValue={settings.cpoThreshold.toLocaleString("id-ID")} className="input tnum" disabled={!lead} />
              <p className="hint">Dipakai langkah alur yang diatur &ldquo;Jika nilai besar / risiko tinggi&rdquo;, misalnya persetujuan CPLO.</p>
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
            {lead && <div><Submit>Simpan aturan</Submit></div>}
          </ActionForm>
        </Card>
      )}

      {tab === "sistem" && (
        <div className="space-y-5">
          <Card title="Mode sistem">
            <ActionForm action={A.saveSystemAction} className="space-y-4" success="Pengaturan sistem disimpan">
              <Toggle name="uatMode" defaultChecked={settings.uatMode} disabled={!lead} icon={FlaskConical} tone="border-line text-info"
                title="Mode UAT (uji coba)"
                desc="Banner UAT tampil di semua halaman. Notifikasi tidak dikirim ke tim, semuanya dialihkan ke email penguji. Dokumen yang dibuat selama UAT ditandai sebagai data uji dan bisa dihapus sekaligus." />
              <div className="pl-1 sm:pl-8">
                <label className="label" htmlFor="uat-to">Email penguji (penerima semua notifikasi saat UAT)</label>
                <input id="uat-to" name="uatRecipient" type="email" defaultValue={settings.uatRecipient} placeholder="penguji@boga.co.id" className="input max-w-md" disabled={!lead} />
              </div>
              <Toggle name="maintenance" defaultChecked={settings.maintenance} disabled={!lead} icon={Wrench} tone="border-line text-warn"
                title="Mode maintenance"
                desc="Hanya Manager Legal, AGM, dan Admin yang bisa masuk. Anggota lain melihat pesan di bawah. Email yang masuk tetap tercatat." />
              <div className="pl-1 sm:pl-8">
                <label className="label" htmlFor="mt-msg">Pesan untuk pengguna</label>
                <input id="mt-msg" name="maintenanceMessage" defaultValue={settings.maintenanceMessage} className="input max-w-xl" disabled={!lead} />
              </div>
              {lead && <Submit>Simpan mode sistem</Submit>}
            </ActionForm>
            {lead && demo[0]?.n > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-2 pt-4 text-[14px]">
                <span className="flex-1 text-ink-2">Ada <b className="text-ink">{demo[0].n} dokumen</b> contoh/uji (dibuat saat UAT atau data contoh awal).</span>
                <ActionButton action={A.deleteDemoAction} id={0} className="btn btn-sm btn-danger" success="Data uji dihapus" pending="Menghapus…">Hapus data uji</ActionButton>
              </div>
            )}
          </Card>

          <Card title="Koneksi">
            <ul className="-my-3 divide-y divide-line-2">
              <Conn ok={graphConfigured()} title="Outlook (mailbox legal)">
                {graphConfigured() ? <>Membaca {mailbox()}.{sub && ` Pemantauan aktif s.d. ${formatDateTime(sub.expiration)}.`}</> : <>Perlu izin dari IT (App Registration Microsoft). Sementara itu, gunakan Upload email.</>}
              </Conn>
              <Conn ok={aiEnabled()} title="Pembaca dokumen otomatis (AI)">Mengisi pihak lawan, nilai, deadline, dan poin penting dari email & PDF.</Conn>
              <Conn ok={Boolean(emailChannel())} title="Notifikasi email">{emailChannel() ? "Terkirim otomatis saat dokumen pindah langkah atau terlambat." : "Aktif setelah Outlook tersambung."}</Conn>
              <Conn ok={Boolean(waChannel())} title="Notifikasi WhatsApp">{waChannel() ? "Terkirim ke nomor yang diisi di daftar tim." : "Perlu token Fonnte atau WhatsApp Business API."}</Conn>
              <Conn ok={Boolean(lastDaily)} title="Pengecekan harian">{lastDaily ? `Terakhir ${formatDateTime(lastDaily.at)}: ${lastDaily.breaches} terlambat, ${lastDaily.escalations} dilaporkan ke atasan.` : "Berjalan otomatis tiap pagi."}</Conn>
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
      )}
    </div>
  );
}
