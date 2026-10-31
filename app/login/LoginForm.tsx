"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);
  const [nik, setNik] = useState("");
  const [pass, setPass] = useState("");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="nik">NIK</label>
        <input id="nik" name="nik" value={nik} onChange={(e) => setNik(e.target.value)} className="input uppercase" required autoComplete="username" placeholder="Contoh: BG012345" autoCapitalize="characters" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} className="input pr-10" required autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-ink-3 hover:text-ink" aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="hint">Login pertama: tanggal lahir Anda, format DDMMYYYY.</p>
      </div>
      {state?.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>{pending && <Loader2 size={16} className="animate-spin" />}{pending ? "Memeriksa…" : "Masuk"}</button>
    </form>
  );
}
