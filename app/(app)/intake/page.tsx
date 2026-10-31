import Link from "next/link";
import { Mail, PenLine, Upload } from "lucide-react";
import { getSettings, query } from "@/lib/db";
import { listMembers } from "@/lib/repo";
import { graphConfigured, mailbox } from "@/lib/graph";
import { RISK_LABEL } from "@/lib/workflow";
import { timeAgo } from "@/lib/time";
import { EmailDrop } from "@/components/EmailDrop";
import { SubjectBuilder } from "@/components/SubjectBuilder";
import { Card, cx, PageHeader } from "@/components/ui";
import { Submit } from "@/components/actions";
import { createManualAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const OUTCOME: Record<string, string> = { created: "Dokumen baru", updated: "Balasan tertaut", duplicate: "Sudah ada", ignored: "Diabaikan" };
type Mode = "upload" | "email" | "manual";

export default async function Intake({ searchParams }: { searchParams: Promise<{ via?: Mode }> }) {
  const via: Mode = (await searchParams).via ?? "upload";
  const [settings, members, log] = await Promise.all([
    getSettings(),
    listMembers(true),
    query<{ id: number; subject: string; outcome: string; document_id: number | null; created_at: string }>(
      `select id, subject, outcome, document_id, created_at from ingest_log where outcome <> 'ignored' order by created_at desc limit 6`,
    ),
  ]);
  const kw = settings.subjectKeywords[0] ?? "[LEGAL]";
  const modes = [
    { key: "upload" as const, icon: Upload, title: "Upload email", desc: "Seret email dari Outlook. Paling cepat." },
    { key: "email" as const, icon: Mail, title: "Kirim lewat email", desc: "Untuk peminta dari divisi lain." },
    { key: "manual" as const, icon: PenLine, title: "Isi manual", desc: "Kalau dokumennya tidak lewat email." },
  ];

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader title="Tambah dokumen" sub="Pilih cara yang paling mudah. Semua jalur masuk ke antrean yang sama." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {modes.map((m) => (
          <Link key={m.key} href={`/intake?via=${m.key}`} scroll={false}
            className={cx("card flex gap-3 p-4 transition-colors", via === m.key ? "border-brand bg-brand-subtle ring-1 ring-brand" : "hover:bg-bg")}>
            <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg", via === m.key ? "bg-brand text-white" : "bg-mute-bg text-ink-2")}><m.icon size={19} /></span>
            <span className="min-w-0">
              <span className="block font-bold">{m.title}</span>
              <span className="block text-[13px] text-ink-2">{m.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      {via === "upload" && (
        <Card>
          <EmailDrop />
          <p className="hint mt-3">Di Outlook desktop: seret email langsung ke kotak di atas. Di Outlook web: buka email, pilih Download, lalu unggah file .eml-nya.</p>
        </Card>
      )}

      {via === "email" && (
        <Card title="Buat subjek email" sub={graphConfigured() ? "Mailbox legal sudah tersambung. Email baru dibaca otomatis." : "Bagikan format ini ke peminta di divisi lain."}>
          <SubjectBuilder keyword={kw} mailbox={graphConfigured() ? mailbox() : null} types={settings.workflows.map((t) => ({ tag: t.tag, label: t.label }))} />
        </Card>
      )}

      {via === "manual" && (
        <Card>
          <form action={createManualAction} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="m-title">Judul dokumen</label><input id="m-title" name="title" className="input" required placeholder="Perjanjian Jasa Logistik 2027" /></div>
            <div><label className="label" htmlFor="m-cp">Pihak lawan</label><input id="m-cp" name="counterparty" className="input" placeholder="PT …" /></div>
            <div><label className="label" htmlFor="m-type">Jenis dokumen</label>
              <select id="m-type" name="doc_type" className="input">{settings.workflows.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
            <div><label className="label" htmlFor="m-val">Nilai kontrak (Rp)</label><input id="m-val" name="contract_value" inputMode="numeric" className="input" placeholder="Opsional" /></div>
            <div><label className="label" htmlFor="m-dl">Deadline</label><input id="m-dl" name="deadline" type="date" className="input" /></div>
            <div><label className="label" htmlFor="m-pic">PIC</label>
              <select id="m-pic" name="assignee_id" className="input"><option value="">Otomatis (yang paling sedikit tugasnya)</option>{members.filter((m) => m.role === "staff").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label className="label" htmlFor="m-risk">Tingkat risiko</label>
              <select id="m-risk" name="risk_level" defaultValue="medium" className="input">{(["low", "medium", "high"] as const).map((k) => <option key={k} value={k}>{RISK_LABEL[k]}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="m-req">Peminta</label><input id="m-req" name="requester_name" className="input" placeholder="Nama / divisi" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="m-sum">Ringkasan singkat</label><textarea id="m-sum" name="summary" rows={3} className="input" placeholder="Apa yang diminta dan konteksnya" /></div>
            <label className="flex items-center gap-2.5 text-[14px] font-semibold sm:col-span-2"><input type="checkbox" name="urgent" className="h-4 w-4 accent-[#c0272d]" /> Urgent</label>
            <div className="sm:col-span-2"><Submit pending="Membuat…">Buat dokumen</Submit></div>
          </form>
        </Card>
      )}

      {log.length > 0 && (
        <Card title="Baru masuk" className="mt-5" pad={false}>
          <ul className="divide-y divide-line-2">
            {log.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{l.document_id ? <Link className="font-semibold hover:text-brand" href={`/documents/${l.document_id}`}>{l.subject}</Link> : l.subject}</span>
                <span className="chip bg-mute-bg text-ink-2">{OUTCOME[l.outcome] ?? l.outcome}</span>
                <span className="hidden w-24 text-right text-[12.5px] text-ink-3 sm:block">{timeAgo(l.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
