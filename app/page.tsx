import { ArrowRight, ArrowUpRight, Check, FileCheck2, Lock, ScrollText, ShieldCheck } from "lucide-react";
import { hasDb } from "@/lib/db";
import { getFlows, SIGAP_URL } from "@/lib/flows";
import { currentMember } from "@/lib/repo";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

const LDMS_POINTS = ["Registry permit & license dengan pengingat jatuh tempo", "MLA, ULA, PKS dan Government Inspection", "Cases, Legal Opinion, NCP dan Knowledge Base"];
const SIGAP_POINTS = ["Pelaporan & penanganan pelanggaran disiplin", "Alur persetujuan sanksi", "Login terpisah dengan akun SIGAP"];

/** Entry page: choose LDMS (this app, NIK login) or SIGAP (a separate system with its own login). Shows no business data. */
export default async function Portal() {
  let sigap = SIGAP_URL;
  let who: string | null = null;
  if (hasDb()) {
    try {
      const [flows, me] = await Promise.all([getFlows(), currentMember()]);
      sigap = flows.sigap.url;
      who = me && !me.must_change_password ? me.name : null;
    } catch (e) {
      console.error("portal", e);
    }
  }
  const year = new Date().getFullYear();

  return (
    <div className="portal-bg relative flex min-h-screen flex-col overflow-hidden">
      <div className="portal-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto flex w-full max-w-[1120px] items-center justify-between px-5 pt-6 md:px-8">
        <div className="flex items-center gap-3">
          <BrandMark size={38} />
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">Boga Group</div>
            <div className="text-[12px] font-medium text-ink-3">Legal Department</div>
          </div>
        </div>
        {who && <span className="hidden text-[13px] text-ink-2 sm:inline">Masuk sebagai <b className="text-ink">{who}</b></span>}
      </header>

      <main className="relative mx-auto w-full max-w-[1120px] flex-1 px-5 pt-14 pb-16 md:px-8 md:pt-20">
        <div className="rise mx-auto max-w-[640px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white/80 px-3 py-1 text-[12px] font-semibold text-brand-deep backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> Portal Legal
          </span>
          <h1 className="mt-5 text-[34px] leading-[1.12] font-extrabold tracking-[-1.1px] text-balance text-ink md:text-[46px]">
            Satu pintu untuk urusan legal <span className="text-brand">Boga Group</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[15.5px] leading-relaxed text-ink-2">Pilih sistem yang ingin Anda buka.</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[920px] gap-5 md:grid-cols-2">
          <a href="/dashboard" className="portal-card rise rise-2 group relative flex flex-col rounded-[20px] border border-line bg-white p-7 hover:border-brand-line hover:no-underline focus-visible:outline-offset-4">
            <div className="flex items-start justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.6)]"><ScrollText size={23} /></span>
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand-deep uppercase">Utama</span>
            </div>
            <h2 className="mt-6 text-[22px] font-extrabold tracking-[-0.4px] text-ink">LDMS</h2>
            <p className="mt-1 text-[13.5px] font-medium text-ink-3">Legal Document Management System</p>
            <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink-2">
              {LDMS_POINTS.map((t) => <li key={t} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />{t}</li>)}
            </ul>
            <span className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-colors group-hover:bg-brand-hover">
              {who ? "Lanjut ke LDMS" : "Masuk LDMS"} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>

          <a href={sigap} target="_blank" rel="noopener noreferrer" className="portal-card rise rise-3 group relative flex flex-col rounded-[20px] border border-line bg-white p-7 hover:border-[#c7d6f2] hover:no-underline focus-visible:outline-offset-4">
            <div className="flex items-start justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy text-white shadow-[0_8px_20px_-8px_rgb(11_31_75/0.6)]"><ShieldCheck size={23} /></span>
              <span className="inline-flex items-center gap-1 rounded-full bg-mute-bg px-2.5 py-1 text-[11px] font-bold tracking-wide text-ink-2 uppercase"><Lock size={11} /> Login terpisah</span>
            </div>
            <h2 className="mt-6 text-[22px] font-extrabold tracking-[-0.4px] text-ink">SIGAP</h2>
            <p className="mt-1 text-[13.5px] font-medium text-ink-3">Sistem penanganan pelanggaran disiplin</p>
            <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink-2">
              {SIGAP_POINTS.map((t) => <li key={t} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />{t}</li>)}
            </ul>
            <span className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-navy transition-colors group-hover:border-navy group-hover:bg-navy group-hover:text-white">
              Buka SIGAP <ArrowUpRight size={16} />
              <span className="sr-only">(tab baru)</span>
            </span>
          </a>
        </div>

        <ul className="rise rise-3 mx-auto mt-10 flex max-w-[920px] flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[12.5px] text-ink-3">
          <li className="flex items-center gap-1.5"><Lock size={14} aria-hidden="true" /> Masuk dengan NIK karyawan</li>
          <li className="flex items-center gap-1.5"><FileCheck2 size={14} aria-hidden="true" /> Setiap perubahan tercatat di audit trail</li>
          <li className="flex items-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" /> Akses sesuai peran</li>
        </ul>
      </main>

      <footer className="relative border-t border-line/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2 px-5 py-4 text-[12px] text-ink-3 md:px-8">
          <span>© {year} Boga Group · Legal Department</span>
          <span>Butuh akses? Hubungi tim Legal.</span>
        </div>
      </footer>
    </div>
  );
}
