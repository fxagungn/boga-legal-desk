import Link from "next/link";
import { pageGuard } from "@/lib/guard";
import { listMatrix } from "@/lib/ldms/discipline";
import { MATRIX_DISCLAIMER } from "@/lib/ldms/matrix-data";
import { cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const lvl = (v: string) => cx("font-mono text-[12px] font-semibold", v.includes("SP3 PHK") ? "text-brand" : v.includes("SP3") ? "text-brand-deep" : v === "-" ? "text-ink-3" : "text-ink");
const auth = (v: string) => cx("text-[12px] font-semibold", v.startsWith("LEGAL") ? "text-brand" : v.startsWith("HCO") ? "text-warn" : "text-ink-3");

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  await pageGuard("matrix");
  const sp = await searchParams;
  const all = await listMatrix();
  const cats = [...new Set(all.map((m) => m.category))];
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((m) => (!sp.cat || m.category === sp.cat) && (!q || `${m.code} ${m.category} ${m.sub_category}`.toLowerCase().includes(q)));
  return (
    <div className="space-y-4">
      <form method="get" className="card flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="mq">Cari</label>
        <input id="mq" name="q" defaultValue={sp.q} placeholder="Cari kode atau perbuatan (mis. merokok, absen, kartu diskon)…" className="input flex-1" />
        <label className="sr-only" htmlFor="mc">Kategori</label>
        <select id="mc" name="cat" defaultValue={sp.cat ?? ""} className="input sm:w-72">
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn">Terapkan</button>
        <span className="font-mono text-[12px] whitespace-nowrap text-ink-3">{rows.length} dari {all.length} kode</span>
      </form>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="border-b border-line bg-[#fafbfc] text-[11px] font-bold tracking-[0.6px] text-ink-3 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-bold">Kode</th><th className="px-3 py-2.5 font-bold">Kategori / sub-kategori</th>
              <th className="px-3 py-2.5 font-bold">1st</th><th className="px-3 py-2.5 font-bold">Repeat</th><th className="px-3 py-2.5 font-bold">Severe</th>
              <th className="px-3 py-2.5 font-bold">Banding</th><th className="px-3 py-2.5 font-bold">Authority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map((m) => (
              <tr key={m.code} className="group relative align-top hover:bg-[#fafbfc]">
                <td className="px-4 py-3"><Link href={`/terapkan-matrix?kode=${m.code}`} className="font-mono text-[12.5px] font-bold text-ink after:absolute after:inset-0 group-hover:text-brand hover:no-underline">{m.code}</Link></td>
                <td className="px-3 py-3"><div className="text-[11.5px] font-semibold text-ink-3">{m.category}</div><div>{m.sub_category}</div></td>
                <td className="px-3 py-3"><span className={lvl(m.s_1st)}>{m.s_1st}</span></td>
                <td className="px-3 py-3"><span className={lvl(m.s_repeat)}>{m.s_repeat}</span></td>
                <td className="px-3 py-3"><span className={lvl(m.s_severe)}>{m.s_severe}</span></td>
                <td className="px-3 py-3 text-[12px]">{m.appeal}</td>
                <td className="px-3 py-3"><span className={auth(m.authority)}>{m.authority}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[12px] leading-relaxed text-ink-3"><b>Disclaimer matrix ({all[0]?.version}).</b> {MATRIX_DISCLAIMER} Klik baris untuk membuka Terapkan Matrix dengan kode terpilih.</p>
    </div>
  );
}
