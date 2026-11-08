import Link from "next/link";
import { CheckCircle2, Circle, FlaskConical, KeyRound, RefreshCw, Wrench } from "lucide-react";
import { getSettings, query } from "@/lib/db";
import { currentMember, listMembers } from "@/lib/repo";
import { emailChannel, waChannel } from "@/lib/notify";
import { ROLE_LABEL, type Role } from "@/lib/workflow";
import { formatDateTime, timeAgo } from "@/lib/time";
import { Avatar, Card, cx, Notice } from "@/components/ui";
import { ActionButton, ActionDialog, ActionForm, Submit } from "@/components/actions";
import * as A from "@/app/actions";
import { employeeSheetId, employeeSyncConfigured, lastSync, planSync } from "@/lib/employees";
import { googleAccountEmail } from "@/lib/google";

export const dynamic = "force-dynamic";

type Tab = "tim" | "sistem";

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

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: Tab; preview?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "sistem" ? "sistem" : "tim";
  const [me, settings, members, demo] = await Promise.all([
    currentMember(),
    getSettings(),
    listMembers(),
    query<{ n: number }>(`select count(*)::int as n from permits where is_demo`),
  ]);
  const lead = Boolean(me && ["manager", "agm", "admin"].includes(me.role));
  const roles = Object.keys(ROLE_LABEL) as Role[];

  const tabs: { key: Tab; label: string }[] = [
    { key: "tim", label: "Tim & akses" },
    { key: "sistem", label: "Sistem" },
  ];

  return (
    <div className="mx-auto max-w-[1080px]">
      {!lead && <div className="mb-4"><Notice tone="info">Hanya Manager, AGM, atau Admin yang bisa mengubah pengaturan.</Notice></div>}

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
          <SyncCard lead={lead} preview={sp.preview === "1"} />
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
                      <label className="flex items-center gap-1.5 text-[13px] text-ink-2"><input type="checkbox" name="active" defaultChecked={m.active} disabled={!lead} className="accent-[#c41e29]" /> Aktif</label>
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
                desc="Hanya Manager Legal, AGM, dan Admin yang bisa masuk. Anggota lain melihat pesan di bawah. " />
              <div className="pl-1 sm:pl-8">
                <label className="label" htmlFor="mt-msg">Pesan untuk pengguna</label>
                <input id="mt-msg" name="maintenanceMessage" defaultValue={settings.maintenanceMessage} className="input max-w-xl" disabled={!lead} />
              </div>
              {lead && <Submit>Simpan mode sistem</Submit>}
            </ActionForm>
            {lead && demo[0]?.n > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-2 pt-4 text-[14px]">
                <span className="flex-1 text-ink-2">Ada <b className="text-ink">{demo[0].n} dokumen</b> contoh/uji di registry perizinan.</span>
                <ActionButton action={A.deleteDemoAction} id={0} className="btn btn-sm btn-danger" success="Data uji dihapus" pending="Menghapus…">Hapus data uji</ActionButton>
              </div>
            )}
          </Card>

          <Card title="Koneksi">
            <ul className="-my-3 divide-y divide-line-2">
              <Conn ok={Boolean(emailChannel())} title="Notifikasi email">{emailChannel() ? "Siap dipakai untuk reminder perizinan ke tim Legal." : "Aktif setelah mailbox Legal (Microsoft 365) tersambung."}</Conn>
              <Conn ok={Boolean(waChannel())} title="Notifikasi WhatsApp">{waChannel() ? "Terkirim ke nomor yang diisi di daftar tim." : "Perlu token Fonnte atau WhatsApp Business API."}</Conn>
              <Conn ok={employeeSyncConfigured()} title="Sinkron data karyawan">{employeeSyncConfigured() ? "Akun tim Legal diperbarui otomatis tiap pagi dari sheet karyawan." : "Belum tersambung ke sheet karyawan."}</Conn>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

async function SyncCard({ lead, preview }: { lead: boolean; preview: boolean }) {
  const last = await lastSync();
  if (!employeeSyncConfigured()) {
    return (
      <Card title="Sinkron dari data karyawan" action={<RefreshCw size={18} className="text-ink-3" />}>
        <p className="text-[14px] text-ink-2">Belum tersambung. Akun tim Legal akan dibuat & dinonaktifkan otomatis dari sheet karyawan Boga (jabatan/departemen Legal dan CPLO) setiap pagi.</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13.5px] text-ink-2">
          <li>Buat service account di Google Cloud, aktifkan Google Sheets API, unduh key JSON.</li>
          <li>Isi env Vercel <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> (isi file JSON) dan <code>EMPLOYEE_SHEET_ID</code>.</li>
          <li>Share sheet karyawan ke email service account sebagai <b>Viewer</b>, lalu redeploy.</li>
        </ol>
      </Card>
    );
  }
  let plan: Awaited<ReturnType<typeof planSync>> | null = null;
  let err: string | null = null;
  if (preview) {
    try { plan = await planSync(); } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  const changes = plan ? plan.create.length + plan.link.length + plan.update.length + plan.deactivate.length : 0;
  return (
    <Card title="Sinkron dari data karyawan" sub={<>Sheet <code className="text-[12px]">{employeeSheetId().slice(0, 10)}…</code> dibaca sebagai {googleAccountEmail()}. Otomatis tiap pagi.</>}
      action={<RefreshCw size={18} className="text-ink-3" />}>
      <p className="text-[14px] text-ink-2">
        {last ? <>Terakhir {formatDateTime(last.at)} oleh {last.actor ?? "sistem"}: {last.legal} karyawan Legal aktif · {last.created} akun baru · {last.deactivated} dinonaktifkan.</> : "Belum pernah dijalankan."}
      </p>
      {err && <p className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{err}</p>}
      {plan && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-bg p-4 text-[13.5px]">
          <p className="font-semibold">{plan.legal} karyawan aktif cocok (dari {plan.scanned.toLocaleString("id-ID")} baris). {changes === 0 ? "Tidak ada perubahan." : `${changes} perubahan:`}</p>
          {plan.create.length > 0 && <Diff title="Akun baru (password awal = tanggal lahir)" items={plan.create.map((e) => `${e.name} · ${e.nik} · ${e.title} → ${ROLE_LABEL[e.role]}`)} />}
          {plan.link.length > 0 && <Diff title="Ditautkan ke NIK" items={plan.link.map((l) => `${l.name} → ${l.emp.nik}`)} />}
          {plan.update.length > 0 && <Diff title="Diperbarui" items={plan.update.map((u) => `${u.name}: ${u.changes.join(", ")}`)} />}
          {plan.deactivate.length > 0 && <Diff title="Akses dicabut" tone="bad" items={plan.deactivate.map((d) => `${d.name} — ${d.reason}`)} />}
          {plan.inactiveInApp.length > 0 && <Diff title="Aktif di HR tapi dinonaktifkan manual di LDMS (tidak diubah)" items={plan.inactiveInApp.map((m) => m.name)} />}
          {plan.noBirth.length > 0 && <Diff title="Tanggal lahir kosong/tidak terbaca — reset password manual" tone="bad" items={plan.noBirth} />}
          <p className="text-[12.5px] text-ink-3">Peran akun yang sudah ada tidak pernah diubah oleh sync. Tanggal lahir tidak disimpan.</p>
        </div>
      )}
      {lead && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!preview && <Link href="/settings?preview=1" className="btn btn-sm">Pratinjau perubahan</Link>}
          {(!preview || changes > 0) && <ActionButton action={A.applyEmployeeSyncAction} id={0} className="btn btn-sm btn-primary" pending="Menyinkron…">Sinkron sekarang</ActionButton>}
          {preview && <Link href="/settings" className="btn btn-sm btn-ghost">Tutup pratinjau</Link>}
        </div>
      )}
    </Card>
  );
}

function Diff({ title, items, tone }: { title: string; items: string[]; tone?: "bad" }) {
  return (
    <div>
      <p className={cx("text-[12px] font-bold tracking-wide uppercase", tone === "bad" ? "text-bad" : "text-ink-3")}>{title}</p>
      <ul className="mt-1 list-disc pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
