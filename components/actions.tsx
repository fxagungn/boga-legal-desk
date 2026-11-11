"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, X } from "lucide-react";
import type { Result } from "@/app/actions";

type Act = (prev: Result, f: FormData) => Promise<Result>;

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("ld-toast", { detail: message }));
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener("ld-toast", on);
    return () => window.removeEventListener("ld-toast", on);
  }, []);
  if (!msg) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8">
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-white shadow-[var(--shadow-float)]">
        <CheckCircle2 size={16} className="text-[#86efac]" /> {msg}
      </div>
    </div>
  );
}

export function Submit({ children, className = "btn btn-primary", pending: pendingText }: { children: React.ReactNode; className?: string; pending?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {pending ? pendingText ?? "Menyimpan…" : children}
    </button>
  );
}

/** A form bound to a server action that returns Result. Shows errors inline and a toast on success. */
export function ActionForm({ action, children, className, success, onDone, resetOnDone }: {
  action: Act; children: React.ReactNode; className?: string; success?: string; onDone?: () => void; resetOnDone?: boolean;
}) {
  // Toast as soon as the server answers: the form may unmount when the page re-renders.
  const [state, formAction] = useActionState(async (prev: Result, f: FormData) => {
    const r = await action(prev, f);
    if (r && "ok" in r) {
      const m = r.message || success;
      if (m) toast(m);
    }
    return r;
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "ok" in state) {
      if (resetOnDone) ref.current?.reset();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && "error" in state && <p className="mt-2 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{state.error}</p>}
    </form>
  );
}

/** Button that opens a small dialog containing an action form. */
export function ActionDialog({ action, id, trigger, triggerClass = "btn", title, desc, children, submit, submitClass = "btn btn-primary", success, wide }: {
  action: Act; id: number; trigger: React.ReactNode; triggerClass?: string; title: string; desc?: string;
  children?: React.ReactNode; submit: string; submitClass?: string; success?: string; wide?: boolean;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => { setKey((k) => k + 1); dlg.current?.showModal(); }}>{trigger}</button>
      <dialog ref={dlg} className={`m-auto ${wide ? "w-[min(680px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]"} rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-float)]`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <ActionForm key={key} action={action} success={success} onDone={() => dlg.current?.close()} className="max-h-[calc(100dvh-48px)] overflow-y-auto p-5">
          <input type="hidden" name="id" value={id} />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-bold">{title}</h3>
              {desc && <p className="mt-1 text-[14px] text-ink-2">{desc}</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm -mr-2 -mt-1 px-2" onClick={() => dlg.current?.close()} aria-label="Tutup"><X size={18} /></button>
          </div>
          {children}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>Batal</button>
            <Submit className={submitClass}>{submit}</Submit>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}

/** One-click action (no dialog). */
export function ActionButton({ action, id, children, className = "btn", success, pending }: { action: Act; id: number; children: React.ReactNode; className?: string; success?: string; pending?: string }) {
  return (
    <ActionForm action={action} success={success} className="contents">
      <input type="hidden" name="id" value={id} />
      <Submit className={className} pending={pending}>{children}</Submit>
    </ActionForm>
  );
}
