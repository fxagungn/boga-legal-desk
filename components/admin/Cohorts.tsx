import { Plus, Trash2, Users } from "lucide-react";
import { query } from "@/lib/db";
import { ACTIONS, getCohorts, inCohort, MODULES, type Action, type Cohort, type Module } from "@/lib/access";
import { lastSync } from "@/lib/employees";
import { ActionForm, Submit } from "@/components/actions";
import * as X from "@/app/admin-actions";

const EMPTY: Cohort = { id: "", name: "", enabled: true, grades: [], depts: [], titles: [], niks: [], perms: { dashboard: ["view"], chat: ["view"], kb: ["view"] } };

/** Admin Console › Hak akses › Cohort karyawan: access for Boga employees outside the Legal team. */
export async function Cohorts() {
  const [cohorts, emps, sync] = await Promise.all([
    getCohorts(),
    query<{ nik: string; title: string | null; grade: string | null; dept: string | null; division: string | null }>(`select nik, title, grade, dept, division from employees where active`),
    lastSync(),
  ]);
  const grades = [...new Set(emps.map((e) => e.grade).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
  const count = (c: Cohort) => emps.filter((e) => inCohort({ ...c, enabled: true }, e)).length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-5 py-4">
        <Users size={18} className="text-ink-3" />
        <h2 className="text-[15px] font-extrabold">Cohort karyawan</h2>
        <span className="text-[12.5px] text-ink-3">{emps.length ? `${emps.length.toLocaleString("id-ID")} karyawan aktif dari data HR` : "Data karyawan belum disinkron — jalankan sinkron di tab Tim & akun."}</span>
      </header>
      {emps.length > 0 && grades.length === 0 && (
        <p className="mx-5 mb-3 rounded-lg bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
          Kolom grade tidak ditemukan di sheet karyawan{sync?.gradeColumn === false ? "" : " (atau belum disinkron ulang)"}. Pakai kriteria jabatan / departemen, atau tambahkan kolom &ldquo;Grade&rdquo; di sheet.
        </p>
      )}
      <ul className="divide-y divide-line-2 border-t border-line-2">
        {cohorts.map((c) => (
          <li key={c.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-[#fafbfc]">
                <span className={c.enabled ? "h-2 w-2 rounded-full bg-ok" : "h-2 w-2 rounded-full bg-ink-3"} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{summary(c)}</span>
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-2">{count(c)} orang</span>
              </summary>
              <div className="border-t border-line-2 bg-bg px-5 py-4">
                <CohortForm c={c} grades={grades} />
                <ActionForm action={X.deleteCohortAction} success="Cohort dihapus" className="mt-2 flex justify-end">
                  <input type="hidden" name="cid" value={c.id} />
                  <Submit className="btn btn-ghost btn-sm text-bad" pending="Menghapus…"><Trash2 size={14} /> Hapus cohort</Submit>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
        <li>
          <details className="group" open={cohorts.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-semibold text-brand hover:bg-[#fafbfc]"><Plus size={16} /> Tambah cohort</summary>
            <div className="border-t border-line-2 bg-bg px-5 py-4"><CohortForm c={EMPTY} grades={grades} /></div>
          </details>
        </li>
      </ul>
    </section>
  );
}

function summary(c: Cohort) {
  const parts = [
    c.grades.length ? `Grade ${c.grades.join(", ")}` : null,
    c.depts.length ? `Dept/brand: ${c.depts.join(", ")}` : null,
    c.titles.length ? `Jabatan: ${c.titles.join(", ")}` : null,
    c.niks.length ? `${c.niks.length} NIK khusus` : null,
  ].filter(Boolean);
  const mods = Object.keys(c.perms).map((m) => MODULES[m as Module]).join(", ");
  return `${parts.join(" · ") || "tanpa kriteria"} → ${mods}`;
}

function CohortForm({ c, grades }: { c: Cohort; grades: string[] }) {
  const k = c.id || "new";
  return (
    <ActionForm action={X.saveCohortAction} success="Cohort disimpan" className="grid gap-3.5">
      <input type="hidden" name="cid" value={c.id} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div><label className="label" htmlFor={`co-n-${k}`}>Nama cohort</label><input id={`co-n-${k}`} name="name" defaultValue={c.name} required placeholder="mis. Leader outlet, Area Manager" className="input" /></div>
        <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold"><input type="checkbox" name="enabled" defaultChecked={c.enabled} className="h-4 w-4 accent-[#c41e29]" /> Aktif</label>
      </div>

      <fieldset>
        <legend className="label">Grade</legend>
        {grades.length ? (
          <div className="flex flex-wrap gap-1.5">
            {grades.map((g) => (
              <label key={g} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12.5px] has-[:checked]:border-brand-line has-[:checked]:bg-brand-subtle">
                <input type="checkbox" name="grades" value={g} defaultChecked={c.grades.includes(g)} className="accent-[#c41e29]" /> {g}
              </label>
            ))}
          </div>
        ) : <p className="text-[12.5px] text-ink-3">Belum ada data grade.</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`co-d-${k}`}>Departemen / brand berisi</label><input id={`co-d-${k}`} name="depts" defaultValue={c.depts.join(", ")} placeholder="mis. Operation, Pepper Lunch" className="input" /></div>
        <div><label className="label" htmlFor={`co-t-${k}`}>Jabatan berisi</label><input id={`co-t-${k}`} name="titles" defaultValue={c.titles.join(", ")} placeholder="mis. Manager, Head, Director" className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`co-k-${k}`}>Tambah orang tertentu (NIK, pisahkan koma)</label><textarea id={`co-k-${k}`} name="niks" rows={2} defaultValue={c.niks.join(", ")} className="input font-mono text-[12.5px]" /></div>

      <fieldset>
        <legend className="label">Modul yang dibuka</legend>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[460px] text-[12.5px]">
            <thead className="bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.5px] text-ink-3 uppercase"><tr><th className="px-3 py-2 text-left font-bold">Modul</th>{(Object.keys(ACTIONS) as Action[]).map((a) => <th key={a} className="px-2 py-2 font-bold">{ACTIONS[a]}</th>)}</tr></thead>
            <tbody className="divide-y divide-line-2">
              {(Object.keys(MODULES) as Module[]).map((m) => (
                <tr key={m}>
                  <td className="px-3 py-1.5">{MODULES[m]}</td>
                  {(Object.keys(ACTIONS) as Action[]).map((a) => (
                    <td key={a} className="px-2 py-1.5 text-center"><input type="checkbox" name={`p.${m}.${a}`} defaultChecked={Boolean(c.perms[m]?.includes(a))} aria-label={`${MODULES[m]} — ${ACTIONS[a]}`} className="h-4 w-4 accent-[#c41e29]" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      <p className="text-[12px] text-ink-3">Orang masuk cohort bila cocok dengan <b>semua</b> kriteria yang diisi, atau NIK-nya tercantum. Login pertama: NIK + tanggal lahir (DDMMYYYY), lalu wajib ganti password.</p>
      <div className="flex justify-end"><Submit>{c.id ? "Simpan cohort" : "Tambah cohort"}</Submit></div>
    </ActionForm>
  );
}
