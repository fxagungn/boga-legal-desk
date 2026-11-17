import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, FileText, FolderKanban, ShieldCheck } from "lucide-react";
import { getSettings, hasDb } from "@/lib/db";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

const POINTS = [
  { icon: ShieldCheck, t: "Permit & License", d: "Jatuh tempo dan renewal terpantau dengan pengingat otomatis." },
  { icon: FileText, t: "Perjanjian", d: "MLA, ULA dan PKS dengan notice period yang terjaga." },
  { icon: FolderKanban, t: "Cases", d: "Alur penanganan dari laporan sampai keputusan." },
  { icon: BookOpenCheck, t: "Knowledge Base", d: "Pelajaran dari setiap case untuk keputusan berikutnya." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDb()) redirect("/setup");
  const settings = await getSettings();
  const { next = "/dashboard" } = await searchParams;
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-[#12306f] to-brand-deep text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgb(255_255_255/0.5)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.5)_1px,transparent_1px)] [background-size:44px_44px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-white/12 text-[15px] font-extrabold ring-1 ring-white/25 backdrop-blur" aria-hidden="true">BG</span>
            <div className="leading-tight"><div className="text-[15px] font-extrabold">Boga Group</div><div className="text-[12px] text-white/70">Legal Department</div></div>
          </div>
          <div className="mt-auto max-w-[460px]">
            <h1 className="text-[34px] leading-[1.15] font-extrabold tracking-[-0.9px] text-balance">Legal Document Management System</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-white/75">Dokumen, kepatuhan dan pengetahuan legal Boga Group dalam satu tempat.</p>
            <ul className="mt-9 grid gap-5 sm:grid-cols-2">
              {POINTS.map(({ icon: Icon, t, d }) => (
                <li key={t}>
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15"><Icon size={17} aria-hidden="true" /></span>
                  <div className="mt-2.5 text-[14px] font-bold">{t}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/65">{d}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-12 text-[12px] text-white/50">© {new Date().getFullYear()} Boga Group</p>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-ink-2 hover:text-brand hover:no-underline"><ArrowLeft size={15} /> Pilih sistem</Link>
        <div className="mx-auto my-auto w-full max-w-[380px] py-10">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark size={40} />
            <div className="leading-tight"><div className="text-[15px] font-extrabold">LDMS</div><div className="text-[12px] text-ink-3">Boga Group · Legal</div></div>
          </div>
          <h2 className="mt-8 text-[26px] font-extrabold tracking-[-0.6px] text-ink lg:mt-0">Masuk ke LDMS</h2>
          <p className="mt-1.5 text-[14px] text-ink-2">Gunakan NIK karyawan Anda.</p>
          <div className="mt-7">
            {settings.maintenance && <p className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">{settings.maintenanceMessage}</p>}
            {settings.uatMode && <p className="mb-4 rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info">Mode UAT aktif: ini lingkungan uji coba.</p>}
            <LoginForm next={next} />
          </div>
          <p className="mt-8 text-[12.5px] leading-relaxed text-ink-3">Lupa password atau belum punya akses? Hubungi tim Legal.</p>
        </div>
      </main>
    </div>
  );
}
