"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login } from "@/app/actions";
import { ROLE_LABEL, type Role } from "@/lib/workflow";

export function LoginForm({ members, next }: { members: { id: number; name: string; role: Role; title: string | null }[]; next: string }) {
  const [state, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="member">Nama</label>
        <select id="member" name="member" className="input" required defaultValue="">
          <option value="" disabled>Pilih nama Anda</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} — {m.title ?? ROLE_LABEL[m.role]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="code">Kode akses tim</label>
        <div className="relative">
          <input id="code" name="code" type={show ? "text" : "password"} className="input pr-10" required autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-ink-3 hover:text-ink" aria-label={show ? "Sembunyikan kode" : "Tampilkan kode"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      {state?.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>{pending && <Loader2 size={16} className="animate-spin" />}{pending ? "Memeriksa…" : "Masuk"}</button>
    </form>
  );
}
