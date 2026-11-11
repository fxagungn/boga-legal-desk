import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { query } from "@/lib/db";
import { listMembers } from "@/lib/repo";
import { pageGuard } from "@/lib/guard";
import {
  daysText, inWindow, listBrands, listPermits, listPermitTypes, listUnits, needsAck, RENEWAL_LABEL, SCOPE_LABEL,
  TIME_CHIP, timeStatus, type PermitRow,
} from "@/lib/ldms/permits";
import { cx, Empty, Notice } from "@/components/ui";
import { FilterBar } from "@/components/permits/FilterBar";
import { PermitDrawer } from "@/components/permits/PermitDrawer";
import { PermitForm } from "@/components/permits/PermitForm";

export const dynamic = "force-dynamic";

type SP = { q?: string; t?: string; brand?: string; scope?: string; r?: string; pic?: string; d?: string };

const QUICK = [
  { key: "", label: "Semua" },
  { key: "aksi", label: "Perlu tindakan" },
  { key: "overdue", label: "Overdue" },
  { key: "d30", label: "≤ 30 hari" },
  { key: "somasi", label: "Bersomasi" },
  { key: "belum", label: "Belum diproses" },
] as const;

function matchQuick(p: PermitRow, t: string) {
  switch (t) {
    case "aksi": return inWindow(p) || needsAck(p);
    case "overdue": return p.days !== null && p.days < 0;
    case "d30": return p.days !== null && p.days >= 0 && p.days <= 30;
    case "somasi": return p.requires_ack;
    case "belum": return inWindow(p) && p.renewal_status === "belum";
    default: return true;
  }
}

export default async function Perizinan({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { me, can } = await pageGuard("permit");
  const [all, brands, units, types, members] = await Promise.all([listPermits(), listBrands(), listUnits(), listPermitTypes(), listMembers(true)]);

  // Staff see their own documents by default (blueprint: Legal2 = dokumen sendiri); everyone can switch to "Semua PIC".
  const pic = sp.pic ?? (me.role === "staff" ? "me" : "all");
  const q = (sp.q ?? "").trim().toLowerCase();
  const noteHits = q
    ? new Set((await query<{ id: number }>(`select distinct entity_id as id from notes where entity = 'permit' and body ilike $1`, [`%${q}%`])).map((r) => r.id))
    : null;

  const base = all.filter((p) => {
    if (pic === "me" && p.pic_id !== me.id) return false;
    if (pic !== "me" && pic !== "all" && String(p.pic_id) !== pic) return false;
    if (sp.brand && (p.brand ?? "—") !== sp.brand) return false;
    if (sp.scope && p.scope !== sp.scope) return false;
    if (sp.r && p.renewal_status !== sp.r) return false;
    if (q) {
      const hay = [p.code, p.type_name, p.type_code, p.unit_name, p.unit_code, p.brand, p.number, p.pic_name, p.city, p.mall, SCOPE_LABEL[p.scope], p.somasi_text, p.agency]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q) && !noteHits?.has(p.id)) return false;
    }
    return true;
  });
  const t = sp.t ?? "";
  const rows = base.filter((p) => matchQuick(p, t)).sort((a, b) => Number(needsAck(b)) - Number(needsAck(a)) || (a.days ?? 1e9) - (b.days ?? 1e9));

  const href = (patch: Partial<SP>) => {
    const next = { ...sp, pic: sp.pic, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/perizinan?${s}` : "/perizinan";
  };
  const closeHref = href({ d: undefined });
  const isDemo = all.some((p) => p.is_demo);
  const picName = pic === "me" ? "saya" : pic === "all" ? null : members.find((m) => String(m.id) === pic)?.name;

  return (
    <div>
      {isDemo && <div className="mb-3"><Notice tone="info">Berisi <b>data contoh</b>.</Notice></div>}

      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" aria-label="Filter cepat">
          {QUICK.map((x) => {
            const n = base.filter((p) => matchQuick(p, x.key)).length;
            const on = t === x.key;
            return (
              <Link key={x.key} href={href({ t: x.key || undefined, d: undefined })} scroll={false} aria-current={on ? "true" : undefined}
                className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold hover:no-underline", on ? "border-brand-line bg-brand-subtle text-brand-hover" : "border-line bg-surface text-ink-2 hover:text-ink")}>
                {x.label} <span className={cx("font-mono text-[11px]", on ? "text-brand" : "text-ink-3")}>{n}</span>
              </Link>
            );
          })}
        </nav>
        {can("permit", "edit") && <PermitForm units={units} types={types} members={members} me={me} />}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line-2 p-4 md:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <FilterBar q={sp.q} hidden={{ t: sp.t }}>
              <select name="pic" defaultValue={pic} className="input sm:w-auto" aria-label="PIC Legal">
                <option value="me">PIC: saya</option>
                <option value="all">Semua PIC</option>
                {members.filter((m) => m.id !== me.id).map((m) => <option key={m.id} value={m.id}>PIC: {m.name}</option>)}
              </select>
              <select name="brand" defaultValue={sp.brand ?? ""} className="input sm:w-auto" aria-label="Brand">
                <option value="">Semua brand</option>
                {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                <option value="—">Tanpa brand (CK/HO)</option>
              </select>
              <select name="scope" defaultValue={sp.scope ?? ""} className="input sm:w-auto" aria-label="Scope">
                <option value="">Semua scope</option>
                {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select name="r" defaultValue={sp.r ?? ""} className="input sm:w-auto" aria-label="Status renewal">
                <option value="">Semua status renewal</option>
                {Object.entries(RENEWAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FilterBar>
          </div>
          <p className="shrink-0 font-mono text-[12px] text-ink-3">
            {rows.length} dokumen{picName ? <> · PIC {picName}</> : null}
            {(sp.q || sp.brand || sp.scope || sp.r || t || (sp.pic && sp.pic !== (me.role === "staff" ? "me" : "all"))) && <> · <Link href="/perizinan" className="font-sans font-semibold text-brand">Reset</Link></>}
          </p>
        </div>

        {rows.length === 0 ? (
          <Empty title="Tidak ada dokumen yang cocok">Coba ubah filter atau kata kunci.{pic === "me" && <> Anda sedang melihat dokumen milik Anda saja — <Link className="font-semibold text-brand" href={href({ pic: "all" })}>lihat semua PIC</Link>.</>}</Empty>
        ) : (
          <>
            <ul className="divide-y divide-line-2">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={href({ d: p.code })} scroll={false} className={cx("flex items-center gap-3 px-4 py-3 hover:bg-[#fafbfc] hover:no-underline md:px-5", sp.d === p.code && "bg-brand-subtle")}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-ink">{p.type_name}</div>
                      <div className="truncate text-[12.5px] text-ink-3">{p.unit_name}</div>
                    </div>
                    {needsAck(p) && <span title="Somasi belum acknowledge" className="chip h-6 shrink-0 bg-brand px-1.5 text-white"><AlertTriangle size={13} /><span className="hidden sm:inline">Somasi</span></span>}
                    <span className="hidden w-[110px] shrink-0 text-right text-[12.5px] md:block"><RenewalCell p={p} /></span>
                    <span className={cx("inline-block w-[92px] shrink-0 rounded-md px-2 py-[3px] text-center font-mono text-[11px] font-semibold whitespace-nowrap", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {sp.d && <PermitDrawer code={sp.d} me={me} closeHref={closeHref} />}
    </div>
  );
}

function RenewalCell({ p }: { p: PermitRow }) {
  if (!inWindow(p) && p.renewal_status === "belum") return <span className="text-ink-3">Aktif</span>;
  const tone = p.renewal_status === "submitted" ? "text-info" : p.renewal_status === "proses" ? "text-ink" : "text-brand";
  return <span className={cx("font-semibold", tone)}>{RENEWAL_LABEL[p.renewal_status]}</span>;
}
