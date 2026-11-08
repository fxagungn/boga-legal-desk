import { CheckCircle2, Clock, Eye } from "lucide-react";
import { currentMember } from "@/lib/repo";
import { canPreview, NAV_ITEMS } from "@/lib/nav";

/**
 * A planned LDMS screen. Admins see the LDMS design (sample data) so they can review what is coming;
 * everyone else gets an honest "segera hadir" page.
 */
export async function ComingSoon({ href, phase, points }: { href: string; phase: string; points: string[] }) {
  const it = NAV_ITEMS.find((i) => i.href === href)!;
  const me = await currentMember();

  if (me && it.preview && canPreview(me.role)) {
    return (
      <div className="-mx-4 -mt-5 -mb-28 flex h-[calc(100dvh-57px)] flex-col md:-mx-7 md:-my-6 md:h-[calc(100dvh-77px)]">
        <p className="flex flex-wrap items-center gap-2 border-b border-info/20 bg-info-bg px-4 py-2 text-[12.5px] text-info md:px-7">
          <Eye size={15} className="shrink-0" />
          <span><b>Pratinjau desain · hanya terlihat admin.</b> Data contoh, perubahan tidak tersimpan. Modul ini {phase.toLowerCase()} — anggota tim melihat halaman &ldquo;segera hadir&rdquo;.</span>
        </p>
        <iframe src={`/preview/ldms.html#embed&screen=${it.preview}`} title={`Pratinjau ${it.title}`} className="w-full flex-1 border-0 bg-bg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <section className="card p-6">
        <span className="chip bg-warn-bg text-warn"><Clock size={13} /> Segera hadir · {phase}</span>
        <h2 className="mt-4 text-[16px] font-bold">{it.title}</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">{it.sub}</p>
        <h3 className="mt-5 text-[13px] font-bold tracking-wide text-ink-3 uppercase">Yang akan ada di sini</h3>
        <ul className="mt-3 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] text-ink-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ink-3" />{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
