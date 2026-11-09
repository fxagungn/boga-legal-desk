import Link from "next/link";
import { Mail, Play, Send } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { getKV, query } from "@/lib/db";
import { getFlows } from "@/lib/flows";
import { emailChannel } from "@/lib/notify";
import { computeQueue, ladderSummary, renderEmail, weeklyDigest } from "@/lib/ldms/reminders";
import { formatDateTime } from "@/lib/time";
import { money } from "@/lib/format";
import { cx } from "@/components/ui";
import { ActionForm, Submit } from "@/components/actions";
import { Banner, MonoChip } from "@/components/ldms/bits";
import { runReminderAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

const LADDER = [
  ["T1 · H-lead", "PIC Legal dokumen", "—", "Mulai proses renewal"],
  ["T2 · H-lead/2", "PIC Legal", "Legal Supervisor", "Cek progres"],
  ["T3 · H-7", "PIC Legal", "Legal Supervisor, Head of Legal", "Urgent"],
  ["T4 · H-1", "PIC Legal", "Legal Supervisor, Head of Legal", "Peringatan terakhir"],
  ["HARI INI (H-0)", "PIC Legal", "Supervisor, Head, Director Legal", "Besok masuk kedaluwarsa"],
  ["OVERDUE (harian)", "PIC Legal", "Supervisor, Head, Director Legal", "Sudah kedaluwarsa N hari"],
  ["SOMASI (harian sampai ack)", "PIC Legal", "Legal Supervisor", "Wajib acknowledge"],
];

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { can } = await pageGuard("reminder");
  const sp = await searchParams;
  const [jobs, flows, last, people, digest, log] = await Promise.all([
    computeQueue(), getFlows(), getKV<{ at: string; mode: string; queued: number; sent: number; failed: number; by: string }>("reminder_last_run"), ladderSummary(), weeklyDigest(),
    query<{ id: number; stage: string; stage_key: string; to_list: string | null; cc_list: string | null; status: string; sent_at: string }>(`select id, stage, stage_key, to_list, cc_list, status, sent_at from reminders order by sent_at desc limit 30`),
  ]);
  const pending = jobs.filter((j) => !j.sent);
  const sel = sp.k ? jobs.find((j) => j.key === sp.k) ?? pending[0] : pending[0];
  const channel = emailChannel();
  const live = flows.reminder.sendEnabled && Boolean(channel);
  const canRun = can("reminder", "approve");

  return (
    <div className="space-y-5">
      <Banner tone={live ? "ok" : "warn"} icon={Mail}>
        {live
          ? <><b>Pengiriman email aktif</b> lewat {channel === "graph" ? "Microsoft 365" : "Resend"}. Cron harian mengirim antrean otomatis.</>
          : <><b>Mode simulasi.</b> Alur reminder sudah berjalan dan antrean di bawah dihitung setiap hari, tetapi belum ada email yang keluar{!channel ? " — kanal email (Resend / Microsoft 365) belum dikonfigurasi" : " — Super Admin belum menyalakan pengiriman di Admin Console"}. Notifikasi hanya untuk tim Legal, tidak ke outlet.</>}
      </Banner>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,420px)]">
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4">
            <h2 className="text-[15px] font-extrabold">Antrean hari ini</h2>
            <span className="font-mono text-[12px] text-ink-3">{pending.length} akan dikirim · {jobs.length - pending.length} sudah terkirim</span>
            {canRun && (
              <div className="ml-auto flex gap-2">
                <ActionForm action={runReminderAction} className="contents"><input type="hidden" name="mode" value="simulate" /><Submit className="btn btn-sm" pending="Menjalankan…"><Play size={14} /> Jalankan simulasi</Submit></ActionForm>
                {live && <ActionForm action={runReminderAction} className="contents"><input type="hidden" name="mode" value="send" /><Submit className="btn btn-primary btn-sm" pending="Mengirim…"><Send size={14} /> Kirim sekarang</Submit></ActionForm>}
              </div>
            )}
          </header>
          <p className="border-t border-line-2 px-5 py-2 text-[12px] text-ink-3">{last ? `Terakhir dijalankan ${formatDateTime(last.at)} oleh ${last.by} · ${last.mode === "send" ? `${last.sent} terkirim${last.failed ? `, ${last.failed} gagal` : ""}` : `simulasi ${last.queued} antrean`}` : "Belum pernah dijalankan."}</p>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead className="sticky top-0 border-y border-line bg-[#fafbfc] text-[11px] font-bold tracking-[0.6px] text-ink-3 uppercase">
                <tr><th className="px-5 py-2.5 font-bold">Tahap</th><th className="px-3 py-2.5 font-bold">Dokumen</th><th className="px-3 py-2.5 font-bold">To</th><th className="px-3 py-2.5 font-bold">CC</th><th className="px-3 py-2.5 font-bold">Sisa</th></tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {jobs.map((j) => (
                  <tr key={j.key} className={cx("group relative hover:bg-[#fafbfc]", sel?.key === j.key && "bg-brand-subtle", j.sent && "opacity-60")}>
                    <td className="px-5 py-2.5"><MonoChip cls={j.stage === "OVERDUE" || j.stage === "H-0" || j.stage === "SOMASI" ? "bg-brand text-white" : "bg-[#fff4e2] text-[#8a5a0b]"}>{j.stage}</MonoChip>{j.sent && <span className="ml-1 text-[11px] text-ok">terkirim</span>}</td>
                    <td className="px-3 py-2.5"><Link href={`/reminder?k=${encodeURIComponent(j.key)}`} scroll={false} className="font-semibold text-ink after:absolute after:inset-0 hover:no-underline">{j.code} · {j.title}</Link><div className="text-[11.5px] text-ink-3">{j.unit}</div></td>
                    <td className="px-3 py-2.5">{j.to?.name ?? <span className="text-bad">PIC kosong</span>}{j.to && !j.to.email && <div className="text-[11px] text-bad">email belum diisi</div>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-2">{j.cc.map((c) => c.name.split(" ")[0]).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px]">{j.days < 0 ? `-${-j.days}h` : `${j.days}h`}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-ink-2">Tidak ada reminder hari ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <div className="card p-5">
            <h2 className="text-[15px] font-extrabold">Tangga eskalasi (Legal-only)</h2>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              {LADDER.map(([s, to, cc, tone]) => (
                <li key={s} className="rounded-lg bg-bg px-3 py-2"><b className="font-mono">{s}</b> — To: {to} · CC: {cc} <span className="text-ink-3">· {tone}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">Penerima saat ini: Supervisor <b>{people.supervisor?.name ?? "—"}</b> · Head <b>{people.head?.name ?? "—"}</b> · Director <b>{people.director?.name ?? "—"}</b> · Corporate (perjanjian) <b>{people.corp?.name ?? "—"}</b>. Diatur di Admin Console → Alur & notifikasi.</p>
          </div>
          {sel && (
            <div className="card overflow-hidden">
              <header className="border-b border-line-2 px-5 py-3"><h2 className="text-[13.5px] font-extrabold">Preview email</h2><p className="truncate font-mono text-[11.5px] text-ink-3">{sel.subject}</p></header>
              <iframe title="Preview email reminder" srcDoc={renderEmail(sel)} sandbox="" className="h-[440px] w-full border-0 bg-white" />
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="px-5 py-4"><h2 className="text-[15px] font-extrabold">Weekly digest (Senin)</h2><p className="text-[12px] text-ink-3">Ke Legal Supervisor & Legal Corporate Supervisor{flows.reminder.digestEnabled ? "" : " — dimatikan"}.</p></header>
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-y border-line bg-[#fafbfc] text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase"><tr><th className="px-5 py-2 font-bold">PIC Legal</th><th className="px-2 py-2 font-bold">Overdue</th><th className="px-2 py-2 font-bold">≤30h</th><th className="px-2 py-2 font-bold">Somasi</th><th className="px-2 py-2 font-bold">Belum diproses</th><th className="px-2 py-2 font-bold">Biaya 30h</th></tr></thead>
            <tbody className="divide-y divide-line-2">{digest.map((d) => (
              <tr key={d.pic}><td className="px-5 py-2 font-semibold">{d.pic}</td><td className="px-2 py-2 font-mono">{d.overdue}</td><td className="px-2 py-2 font-mono">{d.d30}</td><td className="px-2 py-2 font-mono">{d.somasi}</td><td className="px-2 py-2 font-mono">{d.belum}</td><td className="px-2 py-2 font-mono">{money(d.cost)}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="card overflow-hidden">
          <header className="px-5 py-4"><h2 className="text-[15px] font-extrabold">Outbox / log terkirim</h2></header>
          {log.length === 0 ? <p className="border-t border-line-2 px-5 py-6 text-center text-[13px] text-ink-2">Belum ada email terkirim.</p> : (
            <ul className="divide-y divide-line-2 border-t border-line-2 text-[12.5px]">{log.map((r) => (
              <li key={r.id} className="px-5 py-2"><b className="font-mono">{r.stage}</b> → {r.to_list}{r.cc_list ? ` (cc ${r.cc_list})` : ""} · <span className={r.status === "sent" ? "text-ok" : "text-bad"}>{r.status}</span><div className="text-[11.5px] text-ink-3">{formatDateTime(r.sent_at)} · {r.stage_key}</div></li>
            ))}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
