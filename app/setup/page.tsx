import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const steps = [
    { ok: hasDb(), title: "Hubungkan database", body: "Di Vercel: project ini → Storage → Create Database → Neon → Connect (centang Production), lalu redeploy." },
    { ok: Boolean(process.env.AUTH_SECRET), title: "Atur kunci sesi", body: "Isi AUTH_SECRET (string acak panjang) di Settings → Environment Variables." },
  ];
  const ready = steps.every((s) => s.ok);
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-lg p-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="mb-5 h-10 w-10" />
        <h1 className="text-2xl font-bold tracking-tight">Siapkan Boga LDMS</h1>
        <p className="mt-1 text-ink-2">Dua langkah lagi sebelum tim bisa masuk.</p>
        <ol className="mt-6 space-y-4">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3">
              {s.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-ok" size={20} /> : <Circle className="mt-0.5 shrink-0 text-ink-3" size={20} />}
              <div>
                <div className="font-bold">{s.title}</div>
                <p className="text-[14px] text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {ready && <Link href="/login" className="btn btn-primary mt-6 w-full">Lanjut masuk</Link>}
      </div>
    </div>
  );
}
