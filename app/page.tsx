import { ArrowRight, ExternalLink, Scale, ShieldAlert } from "lucide-react";
import { hasDb } from "@/lib/db";
import { getFlows, SIGAP_URL } from "@/lib/flows";

export const dynamic = "force-dynamic";

/** Entry page: choose LDMS (this app, NIK login) or SIGAP (a separate system with its own login). Shows no data. */
export default async function Portal() {
  let sigap = SIGAP_URL;
  if (hasDb()) {
    try { sigap = (await getFlows()).sigap.url; } catch (e) { console.error("portal", e); /* keep the default address */ }
  }
  const card = "group flex flex-col rounded-[16px] border border-line bg-surface p-6 transition-colors hover:border-brand-line hover:no-underline focus-visible:border-brand";
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <main className="w-full max-w-[760px]">
        <div className="flex items-center justify-center gap-[13px]">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-brand text-[17px] font-extrabold tracking-[-0.6px] text-white" aria-hidden="true">BG</span>
          <div>
            <h1 className="text-[20px] leading-tight font-extrabold tracking-[-0.4px]">Legal Boga Group</h1>
            <p className="mt-0.5 text-[13px] font-medium text-ink-3">Pilih sistem yang ingin dibuka</p>
          </div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <a href="/dashboard" className={card}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-subtle text-brand"><Scale size={22} /></span>
            <h2 className="mt-4 text-[18px] font-extrabold text-ink">LDMS</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Legal Document Management System: permit, perjanjian, case, repository, dan knowledge base.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand">Masuk LDMS <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
          </a>
          <a href={sigap} target="_blank" rel="noopener noreferrer" className={card}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff4e2] text-[#8a5a0b]"><ShieldAlert size={22} /></span>
            <h2 className="mt-4 text-[18px] font-extrabold text-ink">SIGAP</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Sistem penanganan pelanggaran disiplin. Sistem terpisah dengan login sendiri.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[#8a5a0b]">Buka SIGAP <ExternalLink size={14} /></span>
          </a>
        </div>
      </main>
    </div>
  );
}
