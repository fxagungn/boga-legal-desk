import Link from "next/link";
import { CheckCircle2, Circle, Database, ExternalLink, FileSpreadsheet, FolderOpen, RefreshCw } from "lucide-react";
import { superAdminGuard } from "@/lib/guard";
import { getKV, query } from "@/lib/db";
import { ACTIONS, MODULES, ROLES, type Action, type Module } from "@/lib/access";
import { getFlows } from "@/lib/flows";
import { aiKeySet } from "@/lib/ai";
import { googleAccountEmail, googleConfigured } from "@/lib/google";
import { emailChannel } from "@/lib/notify";
import { listMembers } from "@/lib/repo";
import { ROLE_LABEL } from "@/lib/workflow";
import { SCOPE_LABEL } from "@/lib/ldms/permits";
import { formatDateTime } from "@/lib/time";
import { money } from "@/lib/format";
import { cx } from "@/components/ui";
import { ActionDialog, ActionForm, Submit } from "@/components/actions";
import { Banner } from "@/components/ldms/bits";
import { TeamSystem } from "@/components/admin/TeamSystem";
import { Cohorts } from "@/components/admin/Cohorts";
import { getCaseConfig } from "@/lib/ldms/cases";
import * as X from "@/app/admin-actions";

export const dynamic = "force-dynamic";

const TABS = [
  ["akses", "Hak akses"], ["tim", "Tim & akun"], ["alur", "Alur & SIGAP"], ["master", "Master data"], ["drive", "Google Drive"], ["ai", "AI"], ["sistem", "Sistem"],
] as const;
type Tab = (typeof TABS)[number][0];

const Ok = ({ ok, children, sub }: { ok: boolean; children: React.ReactNode; sub?: React.ReactNode }) => (
  <li className="flex gap-3 py-3">
    {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={18} className="mt-0.5 shrink-0 text-ink-3" />}
    <div className="min-w-0 text-[13.5px]"><div className="font-semibold">{children} <span className={cx("ml-1 text-[12px]", ok ? "text-ok" : "text-ink-3")}>{ok ? "Siap" : "Belum"}</span></div>{sub && <div className="mt-0.5 text-ink-2">{sub}</div>}</div>
  </li>
);

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: Tab; preview?: string }> }) {
  const { access } = await superAdminGuard();
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "akses";
  const flows = await getFlows();

  return (
    <div className="mx-auto max-w-[1180px]">
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Admin Console">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin?tab=${k}`} scroll={false} aria-current={tab === k ? "page" : undefined}
            className={cx("-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[13.5px] font-semibold hover:no-underline", tab === k ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink")}>{l}</Link>
        ))}
      </nav>

      {tab === "akses" && <div className="space-y-5"><Cohorts />
        <section className="card overflow-hidden">
          <header className="px-5 py-4">
            <h2 className="text-[15px] font-extrabold">Tim Legal per peran</h2>
            <p className="mt-1 text-[12.5px] text-ink-3">Super Admin selalu punya semua akses.</p>
          </header>
          <ActionForm action={X.saveAccessAction} success="Hak akses disimpan">
            <div className="overflow-x-auto border-t border-line-2">
              <table className="w-full min-w-[900px] text-[12.5px]">
                <thead className="bg-[#fafbfc] text-[11px] font-bold tracking-[0.5px] text-ink-3 uppercase">
                  <tr><th className="px-5 py-2.5 text-left font-bold">Modul</th><th className="px-2 py-2.5 text-left font-bold">Hak</th>{ROLES.map((r) => <th key={r} className="px-2 py-2.5 font-bold">{ROLE_LABEL[r]}</th>)}</tr>
                </thead>
                <tbody>
                  {(Object.keys(MODULES) as Module[]).map((m) => (Object.keys(ACTIONS) as Action[]).map((a, i) => (
                    <tr key={`${m}.${a}`} className={cx(i === 0 && "border-t border-line-2")}>
                      {i === 0 && <td rowSpan={3} className="px-5 py-2 align-top font-semibold">{MODULES[m]}</td>}
                      <td className="px-2 py-1.5 text-ink-2">{ACTIONS[a]}</td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-2 py-1.5 text-center">
                          <input type="checkbox" name={`${m}.${a}.${r}`} defaultChecked={access.matrix[m][a].includes(r)} aria-label={`${MODULES[m]} — ${ACTIONS[a]} — ${ROLE_LABEL[r]}`} className="h-4 w-4 accent-[#c41e29]" />
                        </td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-line-2 px-5 py-3"><Submit>Simpan hak akses</Submit></div>
          </ActionForm>
        </section>
      </div>}

      {(tab === "tim" || tab === "sistem") && <TeamSystem tab={tab} preview={sp.preview === "1"} />}

      {tab === "alur" && <FlowsTab />}
      {tab === "master" && <MasterTab />}
      {tab === "drive" && <DriveTab />}

      {tab === "ai" && (
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-[15px] font-extrabold">Claude (Anthropic)</h2>
            <ul className="mt-2 divide-y divide-line-2"><Ok ok={aiKeySet()} sub={aiKeySet() ? "ANTHROPIC_API_KEY terpasang di Vercel." : "Isi ANTHROPIC_API_KEY di Vercel → Settings → Environment Variables, lalu redeploy."}>Kunci API</Ok></ul>
            <ActionForm action={X.saveAiAction} success="Disimpan" className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
              <label className="flex items-center gap-2 text-[13.5px] font-semibold"><input type="checkbox" name="enabled" defaultChecked={flows.ai.enabled} className="h-4 w-4 accent-[#c41e29]" /> Fitur AI aktif</label>
              <div><label className="label" htmlFor="ai-m">Model</label>
                <select id="ai-m" name="model" defaultValue={flows.ai.model} className="input">
                  {["claude-sonnet-5-5", "claude-sonnet-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-4-6"].map((m) => <option key={m}>{m}</option>)}
                </select></div>
              <Submit>Simpan</Submit>
            </ActionForm>
          </section>
          <AiLog />
        </div>
      )}
    </div>
  );
}

async function FlowsTab() {
  const [flows, members] = await Promise.all([getFlows(), listMembers(true)]);
  const sel = (name: string, label: string, v: number | null, hint: string) => (
    <div><label className="label" htmlFor={`fl-${name}`}>{label}</label>
      <select id={`fl-${name}`} name={name} defaultValue={v ?? ""} className="input"><option value="">Otomatis ({hint})</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.title ?? ROLE_LABEL[m.role]}</option>)}</select></div>
  );
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Reminder perizinan & perjanjian</h2>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">H-ambang → H-ambang/2 → H-7 → H-1 → hari ini → overdue harian.</p>
        <ActionForm action={X.saveReminderFlowAction} success="Disimpan" className="grid gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            {sel("supervisorId", "Legal Supervisor (CC tahap 2+)", flows.reminder.supervisorId, "Supervisor Permit")}
            {sel("headId", "Head of Legal (CC tahap 3+)", flows.reminder.headId, "AGM")}
            {sel("directorId", "Director Legal (CC hari ini & overdue)", flows.reminder.directorId, "CPLO")}
            {sel("corpSupervisorId", "Legal Corporate Supervisor (perjanjian & digest)", flows.reminder.corpSupervisorId, "Supervisor lain")}
          </div>
          <div><label className="label" htmlFor="fl-ag">Titik reminder perjanjian (hari, selain ambang notice)</label><input id="fl-ag" name="agreementStages" defaultValue={flows.reminder.agreementStages.join(", ")} className="input max-w-xs" /></div>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="digestEnabled" defaultChecked={flows.reminder.digestEnabled} className="h-4 w-4 accent-[#c41e29]" /> Weekly digest Senin ke kedua Supervisor</label>
          <label className="flex items-start gap-2 text-[13.5px]"><input type="checkbox" name="sendEnabled" defaultChecked={flows.reminder.sendEnabled} disabled={!emailChannel()} className="mt-0.5 h-4 w-4 accent-[#c41e29]" />
            <span><b>Kirim email sungguhan</b><br /><span className="text-[12.5px] text-ink-3">{emailChannel() ? "Kanal email siap. Saat aktif, cron harian mengirim antrean." : "Belum bisa: isi RESEND_API_KEY (dan RESEND_FROM) atau koneksi Microsoft 365 di Vercel dulu. Sampai itu, Reminder Engine berjalan sebagai simulasi."}</span></span></label>
          <div><Submit>Simpan alur reminder</Submit></div>
        </ActionForm>
      </section>
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">SIGAP</h2>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">Sistem SIGAP ditampilkan di Data Record › SIGAP. Hasilnya masuk ke Knowledge Base.</p>
        <ActionForm action={X.saveSigapFlowAction} success="Disimpan" className="grid gap-3.5">
          <div><label className="label" htmlFor="sg-url">Link SIGAP</label><input id="sg-url" name="url" type="url" defaultValue={flows.sigap.url} placeholder="https://…" className="input" /></div>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="newTab" defaultChecked={flows.sigap.newTab} className="h-4 w-4 accent-[#c41e29]" /> Buka di tab baru (bila SIGAP tidak bisa di-embed)</label>
          <div><label className="label" htmlFor="sg-cat">Kategori pelanggaran (satu per baris)</label><textarea id="sg-cat" name="categories" rows={5} defaultValue={flows.sigap.categories.join("\n")} className="input" /></div>
          <div><Submit>Simpan SIGAP</Submit></div>
        </ActionForm>
      </section>
    </div>
  );
}

async function MasterTab() {
  const caseCfg = await getCaseConfig();
  const [brands, types, units] = await Promise.all([
    query<{ id: number; name: string; has_principal: boolean; principal_name: string | null; currency: string; active: boolean }>(`select id, name, has_principal, principal_name, currency, active from brands order by name`),
    query<{ id: number; code: string; name: string; scope: string; lead_days: number; validity_years: string | null; agency: string | null; est_cost: string | null; blocker_note: string | null; active: boolean }>(`select id, code, name, scope, lead_days, validity_years::text, agency, est_cost::text, blocker_note, active from permit_types order by sort`),
    query<{ id: number; code: string; name: string; brand_id: number | null; brand: string | null; scope: string; mall: string | null; city: string | null; address: string | null; contact_name: string | null; contact_email: string | null; status: string; is_demo: boolean }>(
      `select u.id, u.code, u.name, u.brand_id, b.name as brand, u.scope, u.mall, u.city, u.address, u.contact_name, u.contact_email, u.status, u.is_demo from units u left join brands b on b.id = u.brand_id order by u.scope, b.name nulls last, u.name`),
  ]);
  const unitForm = (u?: (typeof units)[number]) => (
    <div className="grid gap-3">
      {!u && <div><label className="label" htmlFor="un-code">Kode (opsional)</label><input id="un-code" name="code" className="input uppercase" /></div>}
      <div><label className="label" htmlFor={`un-n${u?.id ?? 0}`}>Nama outlet / unit</label><input id={`un-n${u?.id ?? 0}`} name="name" required defaultValue={u?.name} className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor={`un-b${u?.id ?? 0}`}>Brand</label><select id={`un-b${u?.id ?? 0}`} name="brand_id" defaultValue={u?.brand_id ?? ""} className="input"><option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label" htmlFor={`un-s${u?.id ?? 0}`}>Scope</label><select id={`un-s${u?.id ?? 0}`} name="scope" defaultValue={u?.scope ?? "outlet"} className="input">{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor={`un-m${u?.id ?? 0}`}>Mal</label><input id={`un-m${u?.id ?? 0}`} name="mall" defaultValue={u?.mall ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`un-c${u?.id ?? 0}`}>Kota</label><input id={`un-c${u?.id ?? 0}`} name="city" defaultValue={u?.city ?? ""} className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`un-a${u?.id ?? 0}`}>Alamat</label><input id={`un-a${u?.id ?? 0}`} name="address" defaultValue={u?.address ?? ""} className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor={`un-cn${u?.id ?? 0}`}>Kontak unit (info saja)</label><input id={`un-cn${u?.id ?? 0}`} name="contact_name" defaultValue={u?.contact_name ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`un-ce${u?.id ?? 0}`}>Email kontak</label><input id={`un-ce${u?.id ?? 0}`} name="contact_email" type="email" defaultValue={u?.contact_email ?? ""} className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`un-st${u?.id ?? 0}`}>Status</label><select id={`un-st${u?.id ?? 0}`} name="status" defaultValue={u?.status ?? "aktif"} className="input"><option value="aktif">Aktif</option><option value="tutup">Tutup</option></select></div>
    </div>
  );
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Kategori case</h2>
        <ActionForm action={X.saveCaseConfigAction} success="Disimpan" className="mt-3 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {([["categories", "Kategori case"], ["rootCauses", "Kategori root cause"], ["forums", "Forum"], ["outcomes", "Hasil akhir"]] as const).map(([k, l]) => (
              <div key={k}><label className="label" htmlFor={`cc-${k}`}>{l} (satu per baris)</label><textarea id={`cc-${k}`} name={k} rows={6} defaultValue={caseCfg[k].join("\n")} className="input" /></div>
            ))}
          </div>
          <div><Submit>Simpan kategori</Submit></div>
        </ActionForm>
      </section>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Outlet & unit</h2>
          <span className="font-mono text-[12px] text-ink-3">{units.length} unit · {units.filter((u) => u.is_demo).length} contoh</span>
          <span className="ml-auto flex gap-2">
            <ActionDialog action={X.importOutletsAction} id={0} trigger="Impor LIST OUTLET" triggerClass="btn btn-sm" title="Impor daftar outlet" desc="Kolom: brand, nama outlet, mal, kota, status (aktif/tutup), alamat. Outlet dengan nama sama diperbarui." submit="Impor">
              <div className="grid gap-3">
                <div><label className="label" htmlFor="im-s">Link Google Sheet (share Viewer ke {googleAccountEmail() ?? "service account"})</label><input id="im-s" name="sheet" className="input" placeholder="https://docs.google.com/spreadsheets/d/…" /></div>
                <div><label className="label" htmlFor="im-r">Range</label><input id="im-r" name="range" defaultValue="LIST OUTLET!A:F" className="input" /></div>
                <p className="text-center text-[12px] text-ink-3">— atau —</p>
                <div><label className="label" htmlFor="im-c">Tempel CSV / dari Excel</label><textarea id="im-c" name="csv" rows={6} className="input font-mono text-[12px]" placeholder={"Brand,Outlet,Mal,Kota,Status\nPepper Lunch,Pepper Lunch Plaza Senayan,Plaza Senayan,Jakarta,aktif"} /></div>
              </div>
            </ActionDialog>
            <ActionDialog action={X.saveUnitAction} id={0} trigger="Tambah outlet" triggerClass="btn btn-primary btn-sm" title="Tambah outlet / unit" submit="Simpan">{unitForm()}</ActionDialog>
          </span>
        </header>
        <div className="max-h-[420px] overflow-auto border-t border-line-2">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="sticky top-0 bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.5px] text-ink-3 uppercase"><tr><th className="px-5 py-2 font-bold">Unit</th><th className="px-2 py-2 font-bold">Brand</th><th className="px-2 py-2 font-bold">Mal · kota</th><th className="px-2 py-2 font-bold">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-line-2">{units.map((u) => (
              <tr key={u.id}><td className="px-5 py-2"><b>{u.name}</b> <span className="font-mono text-[11px] text-ink-3">{u.code}</span>{u.is_demo && <span className="ml-1 text-[10.5px] font-bold text-info">CONTOH</span>}</td><td className="px-2 py-2">{u.brand ?? SCOPE_LABEL[u.scope as keyof typeof SCOPE_LABEL]}</td><td className="px-2 py-2">{[u.mall, u.city].filter(Boolean).join(" · ")}</td><td className="px-2 py-2">{u.status}</td>
                <td className="px-2 py-2 text-right"><ActionDialog action={X.saveUnitAction} id={u.id} trigger="Ubah" triggerClass="btn btn-ghost btn-sm" title={`Ubah ${u.name}`} submit="Simpan">{unitForm(u)}</ActionDialog></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Jenis izin & ambang renewal</h2>
          <span className="font-mono text-[12px] text-ink-3">{types.length} jenis</span>
          <span className="ml-auto flex gap-2">
            <ActionDialog action={X.importPermitsAction} id={0} trigger="Impor registry izin" triggerClass="btn btn-sm" title="Impor registry izin" desc="Kolom: outlet (nama/kode), jenis izin (kode/nama), nomor, tanggal terbit, jatuh tempo, PIC Legal (nama/NIK). Outlet+jenis yang sudah ada diperbarui." submit="Impor">
              <div className="grid gap-3">
                <div><label className="label" htmlFor="ip-s">Link Google Sheet</label><input id="ip-s" name="sheet" className="input" placeholder="https://docs.google.com/spreadsheets/d/…" /></div>
                <div><label className="label" htmlFor="ip-r">Range</label><input id="ip-r" name="range" defaultValue="A:F" className="input" /></div>
                <p className="text-center text-[12px] text-ink-3">— atau —</p>
                <div><label className="label" htmlFor="ip-c">Tempel CSV / dari Excel</label><textarea id="ip-c" name="csv" rows={6} className="input font-mono text-[12px]" placeholder={"Outlet,Jenis,Nomor,Terbit,Jatuh tempo,PIC\nPepper Lunch Plaza Senayan,SLS,503/123/2025,05/03/2024,05/03/2027,Destika"} /></div>
              </div>
            </ActionDialog>
            <ActionDialog action={X.savePermitTypeAction} id={0} trigger="Tambah jenis izin" triggerClass="btn btn-primary btn-sm" title="Tambah jenis izin" submit="Simpan"><TypeFields /></ActionDialog>
          </span>
        </header>
        <div className="max-h-[420px] overflow-auto border-t border-line-2">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="sticky top-0 bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.5px] text-ink-3 uppercase"><tr><th className="px-5 py-2 font-bold">Jenis izin</th><th className="px-2 py-2 font-bold">Scope</th><th className="px-2 py-2 font-bold">Ambang</th><th className="px-2 py-2 font-bold">Masa berlaku</th><th className="px-2 py-2 font-bold">Estimasi biaya</th><th /></tr></thead>
            <tbody className="divide-y divide-line-2">{types.map((t) => (
              <tr key={t.id} className={cx(!t.active && "opacity-50")}><td className="px-5 py-2"><b>{t.name}</b> <span className="font-mono text-[11px] text-ink-3">{t.code}</span><div className="text-[11.5px] text-ink-3">{t.agency}</div></td><td className="px-2 py-2">{SCOPE_LABEL[t.scope as keyof typeof SCOPE_LABEL]}</td><td className="px-2 py-2 font-mono">H-{t.lead_days}</td><td className="px-2 py-2">{t.validity_years ? `${Number(t.validity_years)} th` : "—"}</td><td className="px-2 py-2">{t.est_cost ? money(Number(t.est_cost)) : "—"}</td>
                <td className="px-2 py-2 text-right"><ActionDialog action={X.savePermitTypeAction} id={t.id} trigger="Ubah" triggerClass="btn btn-ghost btn-sm" title={`Ubah ${t.name}`} submit="Simpan"><TypeFields t={t} /></ActionDialog></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Brand</h2>
        <ul className="mt-3 divide-y divide-line-2">
          {[...brands, null].map((b) => (
            <li key={b?.id ?? "new"} className="py-3">
              <ActionForm action={X.saveBrandAction} success="Brand disimpan" className="grid gap-2 sm:grid-cols-[1.2fr_auto_1.4fr_auto_auto_auto] sm:items-center">
                <input type="hidden" name="id" value={b?.id ?? 0} />
                <input name="name" defaultValue={b?.name ?? ""} placeholder="Brand baru" aria-label="Nama brand" className="input h-9" />
                <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" name="has_principal" defaultChecked={b?.has_principal} className="accent-[#c41e29]" /> Berprincipal</label>
                <input name="principal_name" defaultValue={b?.principal_name ?? ""} placeholder="Nama principal" aria-label="Principal" className="input h-9" />
                <select name="currency" defaultValue={b?.currency ?? "IDR"} aria-label="Mata uang ULA" className="input h-9 w-auto">{["IDR", "USD", "SGD", "JPY"].map((c) => <option key={c}>{c}</option>)}</select>
                <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" name="active" defaultChecked={b?.active ?? true} className="accent-[#c41e29]" /> Aktif</label>
                <Submit className="btn btn-sm">{b ? "Simpan" : "Tambah"}</Submit>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TypeFields({ t }: { t?: { code: string; name: string; scope: string; lead_days: number; validity_years: string | null; agency: string | null; est_cost: string | null; blocker_note: string | null; active: boolean } }) {
  const k = t?.code ?? "new";
  return (
    <div className="grid gap-3">
      {!t && <div><label className="label" htmlFor={`pt-c${k}`}>Kode</label><input id={`pt-c${k}`} name="code" required className="input uppercase" /></div>}
      <div><label className="label" htmlFor={`pt-n${k}`}>Nama izin</label><input id={`pt-n${k}`} name="name" required defaultValue={t?.name} className="input" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label" htmlFor={`pt-s${k}`}>Scope</label><select id={`pt-s${k}`} name="scope" defaultValue={t?.scope ?? "outlet"} className="input">{Object.entries(SCOPE_LABEL).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><label className="label" htmlFor={`pt-l${k}`}>Ambang (hari)</label><input id={`pt-l${k}`} name="lead_days" inputMode="numeric" required defaultValue={t?.lead_days} className="input" /></div>
        <div><label className="label" htmlFor={`pt-v${k}`}>Berlaku (th)</label><input id={`pt-v${k}`} name="validity_years" inputMode="decimal" defaultValue={t?.validity_years ? Number(t.validity_years) : ""} className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`pt-a${k}`}>Instansi</label><input id={`pt-a${k}`} name="agency" defaultValue={t?.agency ?? ""} className="input" /></div>
      <div><label className="label" htmlFor={`pt-e${k}`}>Estimasi biaya (Rp)</label><input id={`pt-e${k}`} name="est_cost" inputMode="numeric" defaultValue={t?.est_cost ? Number(t.est_cost).toLocaleString("id-ID") : ""} className="input" /></div>
      <div><label className="label" htmlFor={`pt-b${k}`}>Blocker umum</label><input id={`pt-b${k}`} name="blocker_note" defaultValue={t?.blocker_note ?? ""} className="input" /></div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="accent-[#c41e29]" /> Aktif</label>
    </div>
  );
}

async function DriveTab() {
  const [flows, mirror, mirrorErr, idx, kb, files] = await Promise.all([
    getFlows(), getKV<{ at: string; tabs: number }>("drive_mirror"), getKV<{ at: string; error: string }>("drive_mirror_error"),
    getKV<{ at: string; files: number }>("drive_index"), getKV<{ at: string; cases: number }>("kb_sync"),
    query<{ file_id: string; name: string; path: string | null; mime: string; web_link: string | null; indexed_at: string; len: number }>(`select file_id, name, path, mime, web_link, indexed_at, coalesce(length(text),0) as len from drive_docs order by path limit 200`),
  ]);
  const d = flows.drive;
  const sa = googleAccountEmail();
  return (
    <div className="space-y-5">
      <Banner tone="info" icon={FolderOpen}>Semua data LDMS ditulis ke <b>LDMS_DB</b>, pelajaran KB ke Google Docs, dan isi folder diindeks untuk Tanya LDMS.</Banner>
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Sambungkan folder</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
          <li>Buat folder di <b>Shared Drive</b> kantor, mis. &ldquo;LDMS Boga Group&rdquo;.</li>
          <li>Share folder ke <code className="rounded bg-mute-bg px-1">{sa ?? "service account (GOOGLE_SERVICE_ACCOUNT_JSON belum diset)"}</code> sebagai <b>Content manager / Editor</b>.</li>
          <li>Tempel link folder di bawah lalu klik Sambungkan — LDMS_DB dan Google Doc KB dibuat otomatis.</li>
        </ol>
        <ActionForm action={X.setupDriveAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="dr-url">Link folder Google Drive</label><input id="dr-url" name="folderUrl" defaultValue={d.folderUrl} required className="input" placeholder="https://drive.google.com/drive/folders/…" /></div>
          <Submit pending="Menyambungkan…">Sambungkan</Submit>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="mirrorEnabled" defaultChecked={d.mirrorEnabled} className="accent-[#c41e29]" /> Tulis otomatis setiap perubahan ke LDMS_DB</label>
        </ActionForm>
        <ul className="mt-3 divide-y divide-line-2">
          <Ok ok={googleConfigured()} sub={googleConfigured() ? sa : "Isi GOOGLE_SERVICE_ACCOUNT_JSON di Vercel (dipakai juga untuk sinkron karyawan)."}>Service account Google</Ok>
          <Ok ok={Boolean(d.folderId)} sub={d.folderId ? <a href={d.folderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Buka folder <ExternalLink size={12} /></a> : "Belum disambungkan."}>Folder repository</Ok>
          <Ok ok={Boolean(d.dbSheetId)} sub={d.dbSheetId ? <><a href={`https://docs.google.com/spreadsheets/d/${d.dbSheetId}/edit`} target="_blank" rel="noreferrer">LDMS_DB</a> · {mirror ? `ditulis ${formatDateTime(mirror.at)} (${mirror.tabs} tab)` : "belum ditulis"}{mirrorErr && (!mirror || mirrorErr.at > mirror.at) ? <span className="text-bad"> · error: {mirrorErr.error.slice(0, 140)}</span> : null}</> : undefined}><FileSpreadsheet size={14} className="inline" /> Spreadsheet LDMS_DB</Ok>
          <Ok ok={Boolean(d.kbDocId)} sub={d.kbDocId ? <><a href={`https://docs.google.com/document/d/${d.kbDocId}/edit`} target="_blank" rel="noreferrer">Knowledge Base</a> · {kb ? `sinkron ${formatDateTime(kb.at)} (${kb.cases} entri)` : "belum disinkron"}</> : undefined}>Google Doc Knowledge Base</Ok>
          <Ok ok={Boolean(idx)} sub={idx ? `Diindeks ${formatDateTime(idx.at)} · ${idx.files} file` : "Belum diindeks."}><Database size={14} className="inline" /> Index Tanya LDMS</Ok>
        </ul>
        {d.folderId && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[["mirror", "Tulis database ke LDMS_DB"], ["index", "Index ulang isi Drive"], ["kb", "Sinkron KB dari Google Docs"]].map(([job, label]) => (
              <ActionForm key={job} action={X.driveJobAction} className="contents"><input type="hidden" name="job" value={job} /><Submit className="btn btn-sm" pending="Memproses…"><RefreshCw size={14} /> {label}</Submit></ActionForm>
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] text-ink-3">Cron harian juga menjalankan ketiganya otomatis.</p>
      </section>
      {files.length > 0 && (
        <section className="card overflow-hidden">
          <header className="px-5 py-4"><h2 className="text-[15px] font-extrabold">File terindeks</h2></header>
          <ul className="max-h-[360px] divide-y divide-line-2 overflow-auto border-t border-line-2 text-[12.5px]">{files.map((f) => (
            <li key={f.file_id} className="flex items-center gap-3 px-5 py-2"><span className="min-w-0 flex-1 truncate">{f.web_link ? <a href={f.web_link} target="_blank" rel="noreferrer">{f.path ?? f.name}</a> : f.path ?? f.name}</span><span className="shrink-0 text-ink-3">{f.len ? `${Math.round(f.len / 1000)}k karakter` : "tidak terbaca (PDF/gambar)"}</span></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

async function AiLog() {
  const rows = await query<{ id: string; module: string; actor: string | null; at: string; model: string | null; ok: boolean; error: string | null; confidence: string | null; refs: string | null; decided_value: string | null; decided_by: string | null }>(
    `select id::text, module, actor, at, model, ok, error, confidence, refs, decided_value, decided_by from ai_runs order by at desc limit 60`,
  );
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-4"><h2 className="text-[15px] font-extrabold">Log AI</h2></header>
      <div className="overflow-x-auto border-t border-line-2">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.5px] text-ink-3 uppercase"><tr><th className="px-5 py-2 font-bold">Waktu</th><th className="px-2 py-2 font-bold">Modul</th><th className="px-2 py-2 font-bold">User</th><th className="px-2 py-2 font-bold">Hasil</th><th className="px-2 py-2 font-bold">Referensi</th><th className="px-2 py-2 font-bold">Keputusan</th></tr></thead>
          <tbody className="divide-y divide-line-2">{rows.map((r) => (
            <tr key={r.id}><td className="px-5 py-2 font-mono text-[11.5px] whitespace-nowrap text-ink-3">{formatDateTime(r.at)}</td><td className="px-2 py-2">{r.module}</td><td className="px-2 py-2">{r.actor}</td>
              <td className="px-2 py-2">{r.ok ? <span className="text-ok">OK{r.confidence ? ` · ${r.confidence}` : ""}</span> : <span className="text-bad">Gagal: {r.error?.slice(0, 80)}</span>}</td>
              <td className="px-2 py-2 font-mono text-[11px]">{r.refs ?? "—"}</td><td className="px-2 py-2">{r.decided_value ? `${r.decided_value} · ${r.decided_by}` : "—"}</td></tr>
          ))}</tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-ink-2">Belum ada panggilan AI.</p>}
      </div>
    </section>
  );
}
