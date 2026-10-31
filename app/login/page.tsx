import { redirect } from "next/navigation";
import { hasDb } from "@/lib/db";
import { listMembers } from "@/lib/repo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDb() || !process.env.ACCESS_CODE) redirect("/setup");
  const members = await listMembers(true);
  const { next = "/" } = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-[18px] font-extrabold">B</span>
          <span className="text-[16px] font-extrabold">Boga Legal Desk</span>
        </div>
        <div className="max-w-md">
          <p className="text-[32px] leading-tight font-extrabold tracking-tight">Setiap dokumen legal kelihatan ada di meja siapa.</p>
          <ul className="mt-6 space-y-2.5 text-[15px] text-white/85">
            <li>Email masuk langsung jadi dokumen</li>
            <li>Urutan prioritas dihitung otomatis</li>
            <li>Persetujuan cukup satu ketukan dari HP</li>
          </ul>
        </div>
        <p className="text-[13px] text-white/60">Tim Legal · Boga Group</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-white/5" />
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="mb-6 h-10 w-10 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-tight">Masuk</h1>
          <p className="mt-1 mb-6 text-ink-2">Pilih nama Anda dan masukkan kode akses tim legal.</p>
          <LoginForm members={members.map((m) => ({ id: m.id, name: m.name, role: m.role }))} next={next} />
          <p className="mt-6 text-[13px] text-ink-3">Belum punya akses? Hubungi Manager Legal.</p>
        </div>
      </div>
    </div>
  );
}
