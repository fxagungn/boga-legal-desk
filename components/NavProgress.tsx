"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Thin bar at the top of the screen from the moment a link is clicked until the new page (or tab) has arrived. */
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [path, search]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const start = () => {
      setBusy(true);
      clearTimeout(t);
      t = setTimeout(() => setBusy(false), 12_000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || to.pathname.startsWith("/api/")) return;
      if (to.pathname === location.pathname && to.search === location.search) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (f && (f.getAttribute("method") ?? "get").toLowerCase() === "get") start();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("submit", onSubmit); clearTimeout(t); };
  }, []);

  if (!busy) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden bg-brand-soft" role="progressbar" aria-label="Memuat halaman">
      <div className="nav-progress h-full w-1/3 rounded-full bg-brand" />
    </div>
  );
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
