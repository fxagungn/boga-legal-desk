import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { currentMember } from "@/lib/repo";
import { can, getAccessCtx, isSuperAdmin, MODULES, ACTIONS, type Module, type Action } from "@/lib/access";
import { ROLE_LABEL } from "@/lib/workflow";
import { getSettings } from "@/lib/db";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = (await currentMember())!;
  const [access, settings] = await Promise.all([getAccessCtx(), getSettings()]);
  const sa = isSuperAdmin(me);
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Akun saya</h2>
        <dl className="mt-3 grid gap-3 text-[13.5px] sm:grid-cols-2">
          <div><dt className="text-ink-3">Nama</dt><dd className="font-semibold">{me.name}</dd></div>
          <div><dt className="text-ink-3">NIK</dt><dd className="font-mono font-semibold">{me.nik ?? "—"}</dd></div>
          <div><dt className="text-ink-3">Jabatan</dt><dd className="font-semibold">{me.title ?? "—"}</dd></div>
          <div><dt className="text-ink-3">Peran LDMS</dt><dd className="font-semibold">{ROLE_LABEL[me.role]}{sa ? " · Super Admin" : ""}</dd></div>
          <div><dt className="text-ink-3">Email</dt><dd className="font-semibold">{me.email ?? "—"}</dd></div>
          <div><dt className="text-ink-3">Login terakhir</dt><dd className="font-semibold">{me.last_login_at ? formatDateTime(me.last_login_at) : "—"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/ganti-password" className="btn btn-sm"><KeyRound size={14} /> Ganti password</Link>
          {sa && <Link href="/admin" className="btn btn-primary btn-sm"><ShieldCheck size={14} /> Buka Admin Console</Link>}
        </div>
      </section>
      <section className="card p-5">
        <h2 className="text-[15px] font-extrabold">Hak akses Anda</h2>
        <ul className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-2">
          {(Object.keys(MODULES) as Module[]).filter((m) => can(access, me, m, "view")).map((m) => (
            <li key={m} className="flex justify-between gap-2 rounded-lg bg-bg px-3 py-2"><span>{MODULES[m]}</span><span className="text-ink-3">{(Object.keys(ACTIONS) as Action[]).filter((a) => can(access, me, m, a)).map((a) => ACTIONS[a]).join(" · ")}</span></li>
          ))}
        </ul>
      </section>
      {(settings.uatMode || settings.maintenance) && <p className="text-[12.5px] text-ink-3">Mode UAT {settings.uatMode ? "aktif" : "nonaktif"} · Maintenance {settings.maintenance ? "aktif" : "nonaktif"}</p>}
    </div>
  );
}
