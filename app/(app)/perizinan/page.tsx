import Link from "next/link";
import { AlertTriangle, MessageSquareText, Paperclip } from "lucide-react";
import { query } from "@/lib/db";
import { currentMember, listMembers } from "@/lib/repo";
import {
  daysText, inWindow, shortName, listBrands, listPermits, listPermitTypes, listUnits, needsAck, RENEWAL_LABEL, SCOPE_LABEL,
  TIME_CHIP, timeStatus, type PermitRow,
} from "@/lib/ldms/permits";
import { formatDate } from "@/lib/time";
import { Avatar, cx, Empty, Notice, PageHeader } from "@/components/ui";
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
  const me = (await currentMember())!;
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
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Registry Perizinan" sub={<>{all.length} dokumen izin outlet, Central Kitchen, dan korporat. Reminder hanya ke tim Legal.</>}>
        <PermitForm units={units} types={types} members={members} me={me} />
      </PageHeader>

      {isDemo && <div className="mb-4"><Notice tone="info">Ini <b>data contoh</b> untuk uji coba. Data asli bisa diimpor nanti dari Excel.</Notice></div>}

      <nav className="mb-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Filter cepat">
        {QUICK.map((x) => {
          const n = base.filter((p) => matchQuick(p, x.key)).length;
          const on = t === x.key;
          return (
            <Link key={x.key} href={href({ t: x.key || undefined, d: undefined })} scroll={false}
              className={cx("chip h-8 shrink-0 border px-3 text-[13px]", on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:text-ink")}>
              {x.label} <span className={cx("tnum", on ? "text-white/70" : "text-ink-3")}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <div className="card mb-4 p-3">
        <FilterBar q={sp.q} hidden={{ t: sp.t }}>
          <select name="pic" defaultValue={pic} className="input h-10 sm:w-auto" aria-label="PIC Legal">
            <option value="me">PIC: saya</option>
            <option value="all">Semua PIC</option>
            {members.filter((m) => m.id !== me.id).map((m) => <option key={m.id} value={m.id}>PIC: {m.name}</option>)}
          </select>
          <select name="brand" defaultValue={sp.brand ?? ""} className="input h-10 sm:w-auto" aria-label="Brand">
            <option value="">Semua brand</option>
            {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            <option value="—">Tanpa brand (CK/HO)</option>
          </select>
          <select name="scope" defaultValue={sp.scope ?? ""} className="input h-10 sm:w-auto" aria-label="Scope">
            <option value="">Semua scope</option>
            {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="r" defaultValue={sp.r ?? ""} className="input h-10 sm:w-auto" aria-label="Status renewal">
            <option value="">Semua status renewal</option>
            {Object.entries(RENEWAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FilterBar>
      </div>

      <p className="mb-2 px-1 text-[13px] text-ink-3">
        {rows.length} dokumen{picName ? <> · PIC {picName}</> : null}
        {(sp.q || sp.brand || sp.scope || sp.r || t || (sp.pic && sp.pic !== (me.role === "staff" ? "me" : "all"))) && <> · <Link href="/perizinan" className="font-semibold text-brand">Reset filter</Link></>}
      </p>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="Tidak ada dokumen yang cocok">Coba ubah filter atau kata kunci.{pic === "me" && <> Anda sedang melihat dokumen milik Anda saja — <Link className="font-semibold text-brand" href={href({ pic: "all" })}>lihat semua PIC</Link>.</>}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-left text-[14px] lg:table">
              <thead className="border-b border-line bg-bg text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Jenis izin</th>
                  <th className="px-3 py-2.5">Unit</th>
                  <th className="px-3 py-2.5">Jatuh tempo</th>
                  <th className="px-3 py-2.5">Sisa</th>
                  <th className="px-3 py-2.5">Status renewal</th>
                  <th className="px-3 py-2.5">PIC Legal</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Info</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {rows.map((p) => (
                  <tr key={p.id} className={cx("group relative hover:bg-bg", sp.d === p.code && "bg-brand-subtle")}>
                    <td className="px-4 py-3">
                      <Link href={href({ d: p.code })} scroll={false} className="font-semibold after:absolute after:inset-0 group-hover:text-brand">{p.type_name}</Link>
                      <div className="font-mono text-[12px] text-ink-3">{p.code} · {p.number ?? "tanpa nomor"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{p.unit_name}</div>
                      <div className="text-[12.5px] text-ink-3">{p.brand ?? SCOPE_LABEL[p.scope]}{p.city ? ` · ${p.city}` : ""}</div>
                    </td>
                    <td className="px-3 py-3 tnum whitespace-nowrap">{p.expiry_date ? formatDate(p.expiry_date) : "—"}</td>
                    <td className="px-3 py-3"><span className={cx("chip font-mono", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span></td>
                    <td className="px-3 py-3"><RenewalCell p={p} /></td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2"><Avatar name={p.pic_name} size={24} tone={p.pic_id === me.id ? "brand" : "ink"} /><span className="text-[13.5px]">{shortName(p.pic_name)}</span></span>
                    </td>
                    <td className="px-3 py-3"><Icons p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-line-2 lg:hidden">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={href({ d: p.code })} scroll={false} className="flex items-start gap-3 px-4 py-3.5 active:bg-bg">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-snug">{p.type_name}</div>
                      <div className="mt-0.5 text-[13px] text-ink-2">{p.unit_name}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <RenewalCell p={p} />
                        <Icons p={p} />
                        <span className="text-[12px] text-ink-3">{shortName(p.pic_name)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cx("chip font-mono", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span>
                      <div className="mt-1 text-[12px] text-ink-3 tnum">{p.expiry_date ? formatDate(p.expiry_date) : ""}</div>
                    </div>
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
  if (!inWindow(p) && p.renewal_status === "belum") return <span className="text-[13px] text-ink-3">Aktif</span>;
  const tone = p.renewal_status === "submitted" ? "bg-info-bg text-info" : p.renewal_status === "proses" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";
  return <span className={cx("chip", tone)}>{RENEWAL_LABEL[p.renewal_status]}</span>;
}

function Icons({ p }: { p: PermitRow }) {
  return (
    <span className="relative z-10 flex items-center gap-2 text-ink-3">
      {p.requires_ack && (
        <span title={needsAck(p) ? "Bersomasi — belum acknowledge" : "Bersomasi — sudah acknowledge"} className={cx("chip h-6 px-1.5", needsAck(p) ? "bg-brand text-white" : "bg-brand-subtle text-brand")}>
          <AlertTriangle size={13} /> Somasi
        </span>
      )}
      {p.note_count > 0 && <span title={`${p.note_count} catatan`} className="flex items-center gap-0.5 text-[12px]"><MessageSquareText size={14} />{p.note_count}</span>}
      {p.file_count > 0 && <span title={`${p.file_count} file`} className="flex items-center gap-0.5 text-[12px]"><Paperclip size={14} />{p.file_count}</span>}
    </span>
  );
}

