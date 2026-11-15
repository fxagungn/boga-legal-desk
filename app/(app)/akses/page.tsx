import { Search, UserPlus } from "lucide-react";
import { legalGuard } from "@/lib/guard";
import { query } from "@/lib/db";
import { listMembers, type Member } from "@/lib/repo";
import { ACTIONS, can, canSetAccessOf, getAccessCtx, isSuperAdmin, MODULES, type AccessCtx, type Action, type Module } from "@/lib/access";
import { ROLE_LABEL } from "@/lib/workflow";
import { cx } from "@/components/ui";
import { ActionButton, ActionDialog } from "@/components/actions";
import { grantEmployeeAccessAction, saveUserAccessAction, toggleUserAction } from "@/app/access-actions";

export const dynamic = "force-dynamic";

const MODS = Object.keys(MODULES) as Module[];
const ACTS = Object.keys(ACTIONS) as Action[];

/** What an account can open right now (checklist, role or cohort), as short text. */
function summary(a: AccessCtx, m: Member) {
  if (isSuperAdmin(m)) return "Semua modul";
  const mods = MODS.filter((x) => can(a, m, x, "view"));
  if (mods.length === 0) return "Belum ada akses";
  if (mods.length === MODS.length) return "Semua modul";
  return mods.map((x) => MODULES[x]).join(", ");
}

function Checklist({ k, checked }: { k: string; checked: (m: Module, a: Action) => boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[12.5px]">
        <thead className="bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.5px] text-ink-3 uppercase">
          <tr><th className="px-3 py-2 text-left font-bold">Modul</th>{ACTS.map((a) => <th key={a} className="px-2 py-2 font-bold">{a === "view" ? "Lihat" : a === "edit" ? "Ubah" : "Approve"}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line-2">
          {MODS.map((m) => (
            <tr key={m}>
              <td className="px-3 py-1.5">{MODULES[m]}</td>
              {ACTS.map((a) => (
                <td key={a} className="px-2 py-1.5 text-center">
                  <input type="checkbox" name={`p.${m}.${a}`} defaultChecked={checked(m, a)} aria-label={`${MODULES[m]} — ${ACTIONS[a]}`} id={`${k}-${m}-${a}`} className="h-4 w-4 accent-[#c41e29]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ m, me, access }: { m: Member; me: Member; access: AccessCtx }) {
  const editable = canSetAccessOf(me, m);
  const legal = m.role !== "viewer";
  return (
    <li className={cx("flex flex-wrap items-center gap-3 px-5 py-3", !m.active && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{m.name} {!m.active && <span className="ml-1 text-[11px] font-semibold text-ink-3">nonaktif</span>}</div>
        <div className="truncate text-[12px] text-ink-3">{[m.title ?? ROLE_LABEL[m.role], m.dept, m.nik].filter(Boolean).join(" · ")}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-2">
          {summary(access, m)}
          {m.perms ? <span className="ml-1.5 rounded-[5px] bg-brand-soft px-1.5 py-px text-[10.5px] font-bold text-brand">checklist pribadi</span> : !isSuperAdmin(m) && <span className="ml-1.5 text-[11px] text-ink-3">({legal ? "ikut peran" : "ikut cohort"})</span>}
        </div>
      </div>
      {editable && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionDialog action={saveUserAccessAction} id={m.id} wide trigger="Atur akses" triggerClass="btn btn-sm" title={`Akses ${m.name}`} desc={legal ? "Checklist ini menggantikan hak dari perannya." : "Centang modul yang boleh dibuka."} submit="Simpan akses">
            <Checklist k={`u${m.id}`} checked={(mod, a) => can(access, m, mod, a)} />
            {m.perms && <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" name="mode" value="default" className="h-4 w-4 accent-[#c41e29]" /> Hapus checklist pribadi (kembali ikut {legal ? "peran" : "cohort"})</label>}
          </ActionDialog>
          {!legal && <ActionButton action={toggleUserAction} id={m.id} className="btn btn-ghost btn-sm">{m.active ? "Nonaktifkan" : "Aktifkan"}</ActionButton>}
        </div>
      )}
    </li>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { me, superAdmin } = await legalGuard();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const [members, access, found, empCount] = await Promise.all([
    listMembers(), getAccessCtx(),
    q.length >= 2
      ? query<{ nik: string; name: string; title: string | null; dept: string | null; division: string | null; has_account: boolean }>(
        `select e.nik, e.name, e.title, e.dept, e.division, exists (select 1 from team_members t where upper(t.nik) = e.nik) as has_account
         from employees e where e.active and (e.name ilike '%' || $1 || '%' or e.nik ilike '%' || $1 || '%' or coalesce(e.title,'') ilike '%' || $1 || '%')
         order by e.name limit 20`, [q])
      : Promise.resolve([]),
    query<{ n: number }>(`select count(*)::int as n from employees where active`),
  ]);
  const legal = members.filter((m) => m.role !== "viewer");
  const others = members.filter((m) => m.role === "viewer");

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><UserPlus size={17} className="text-ink-3" /> Beri akses ke karyawan lain</h2>
          <form method="get" className="mt-3 flex gap-2">
            <label className="relative flex-1"><span className="sr-only">Cari karyawan</span>
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input name="q" defaultValue={q} placeholder="Cari nama, NIK, atau jabatan…" className="input pl-9" />
            </label>
            <button className="btn">Cari</button>
          </form>
          {empCount[0].n === 0 && <p className="mt-2 text-[12.5px] text-warn">Data karyawan belum disinkron. Minta Super Admin menjalankan sinkron di Pengaturan › Tim & akun.</p>}
        </header>
        {q.length >= 2 && (
          found.length === 0 ? <p className="border-t border-line-2 px-5 py-6 text-center text-[13px] text-ink-2">Tidak ada karyawan aktif yang cocok.</p> : (
            <ul className="divide-y divide-line-2 border-t border-line-2">
              {found.map((e) => (
                <li key={e.nik} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.name}</div>
                    <div className="truncate text-[12px] text-ink-3">{[e.title, e.dept ?? e.division, e.nik].filter(Boolean).join(" · ")}</div>
                  </div>
                  {e.has_account ? <span className="shrink-0 text-[12px] text-ink-3">Sudah punya akun (lihat daftar di bawah)</span> : (
                    <ActionDialog action={grantEmployeeAccessAction} id={0} wide trigger="Beri akses" triggerClass="btn btn-primary btn-sm" title={`Beri akses: ${e.name}`} desc="Login pertama memakai NIK + tanggal lahir (DDMMYYYY), lalu wajib ganti password." submit="Beri akses">
                      <input type="hidden" name="nik" value={e.nik} />
                      <Checklist k={`e${e.nik}`} checked={(mod, a) => a === "view" && (mod === "dashboard" || mod === "kb")} />
                    </ActionDialog>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-baseline gap-2 px-5 py-4"><h2 className="text-[15px] font-extrabold">Karyawan lain</h2><span className="font-mono text-[12px] text-ink-3">{others.length}</span></header>
        {others.length === 0 ? <p className="border-t border-line-2 px-5 py-6 text-center text-[13px] text-ink-2">Belum ada. Cari karyawan di atas untuk memberi akses.</p> : (
          <ul className="divide-y divide-line-2 border-t border-line-2">{others.map((m) => <Row key={m.id} m={m} me={me} access={access} />)}</ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Tim Legal <span className="ml-1 font-mono text-[12px] font-normal text-ink-3">{legal.length}</span></h2>
          {!superAdmin && <p className="mt-1 text-[12.5px] text-ink-3">Akses tim Legal hanya bisa diubah Super Admin.</p>}
        </header>
        <ul className="divide-y divide-line-2 border-t border-line-2">{legal.map((m) => <Row key={m.id} m={m} me={me} access={access} />)}</ul>
      </section>
    </div>
  );
}
