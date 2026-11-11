import { redirect } from "next/navigation";
import { getSettings, hasDb } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDb()) redirect("/setup");
  const settings = await getSettings();
  const { next = "/" } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center justify-center gap-[13px]">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-brand text-[17px] font-extrabold tracking-[-0.6px] text-white" aria-hidden="true">BG</span>
          <div>
            <h1 className="text-[20px] leading-tight font-extrabold tracking-[-0.4px]">Legal Document Management System</h1>
            <p className="mt-0.5 text-[13px] font-medium text-ink-3">Boga Group · Data Record · Repository · Knowledge Base</p>
          </div>
        </div>
        <div className="mt-[26px] rounded-[14px] border border-line bg-surface p-6">
          <h2 className="text-[13px] font-extrabold tracking-[-0.2px]">Masuk</h2>
          <p className="mt-1 mb-5 text-[12px] leading-relaxed text-ink-3">Gunakan NIK karyawan Anda.</p>
          {settings.maintenance && <p className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">{settings.maintenanceMessage}</p>}
          {settings.uatMode && <p className="mb-4 rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info">Mode UAT aktif: ini lingkungan uji coba.</p>}
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-3">Lupa password atau belum punya akses? Hubungi tim Legal.</p>
      </div>
    </div>
  );
}
