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
        <input id="nik" name="nik" value={nik} onChange={(e) => setNik(e.target.value)} className="input h-11 text-[14.5px] uppercase placeholder:normal-case" required autoFocus autoComplete="username" placeholder="Contoh: BG012345" autoCapitalize="characters" spellCheck={false} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} className="input h-11 pr-11 text-[14.5px]" required autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink" aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="hint">Login pertama: tanggal lahir Anda, format DDMMYYYY.</p>
      </div>
      {state?.error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-subtle px-3 py-2.5 text-[13.5px] text-danger-deep">{state.error}</p>}
      <button className="btn btn-primary btn-lg w-full rounded-xl" disabled={pending}>{pending && <Loader2 size={16} className="animate-spin" />}{pending ? "Memeriksa…" : "Masuk"}</button>
    </form>
  );
}
