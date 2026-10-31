"use client";
import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { changePasswordAction } from "@/app/actions";

export function ChangePasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const [pw, setPw] = useState("");
  const [cur, setCur] = useState("");
  const [conf, setConf] = useState("");
  const rules = [
    { ok: pw.length >= 8, label: "Minimal 8 karakter" },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), label: "Ada huruf dan angka" },
    { ok: pw.length > 0 && !/^\d{8}$/.test(pw), label: "Bukan tanggal lahir" },
  ];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div><label className="label" htmlFor="cur">Password saat ini</label><input id="cur" name="current" type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="input" required autoComplete="current-password" /></div>
      <div>
        <label className="label" htmlFor="new">Password baru</label>
        <input id="new" name="new" type="password" className="input" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <ul className="mt-2 space-y-1">
          {rules.map((r) => (
            <li key={r.label} className={`flex items-center gap-1.5 text-[12.5px] ${r.ok ? "text-ok" : "text-ink-3"}`}><Check size={13} strokeWidth={3} /> {r.label}</li>
          ))}
        </ul>
      </div>
      <div><label className="label" htmlFor="conf">Ulangi password baru</label><input id="conf" name="confirm" type="password" value={conf} onChange={(e) => setConf(e.target.value)} className="input" required autoComplete="new-password" /></div>
      {state?.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>{pending && <Loader2 size={16} className="animate-spin" />}Simpan password</button>
    </form>
  );
}
