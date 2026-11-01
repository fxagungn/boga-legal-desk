import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText, Paperclip, Sparkles } from "lucide-react";
import { getSettings } from "@/lib/db";
import { buildJourney, needsMe } from "@/lib/journey";
import { currentMember, getDocument, listAttachments, listEmails, listEvents, listMembers } from "@/lib/repo";
import { conditionMet, RISK_LABEL, ROLE_LABEL, stageDef, typeDef, typeLabel } from "@/lib/workflow";
import { stageCtx } from "@/lib/insight";
import { deadlineText, PRIORITY } from "@/lib/labels";
import { formatDate, formatDateTime, formatShort } from "@/lib/time";
import { fileSize, money } from "@/lib/format";
import { DocActions } from "@/components/DocActions";
import { HolderLine, JourneyStepper, JourneyTimeline, MiniJourney } from "@/components/journey";
import { ActionButton, ActionForm, Submit } from "@/components/actions";
import { Avatar, Card, cx, PriorityChip, StatusChip } from "@/components/ui";
import * as A from "@/app/actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  created: "Dokumen dibuat", stage: "Lanjut ke", approved: "Disetujui, lanjut ke", revision: "Dikembalikan ke", moved: "Dipindah ke",
  hold: "Menunggu pihak luar", resume: "Dilanjutkan", done: "Selesai", email: "Email masuk", note: "Catatan", edited: "Detail diubah",
  cancelled: "Dibatalkan", attachment: "File ditambahkan", reopened: "Dibuka kembali",
};

type Tab = "ringkasan" | "riwayat" | "email" | "file" | "detail";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: Tab }> }) {
  const id = Number((await params).id);
  const tab: Tab = (await searchParams).tab ?? "ringkasan";
  if (!Number.isFinite(id)) notFound();
  const [doc, me, settings] = await Promise.all([getDocument(id), currentMember(), getSettings()]);
  if (!doc || !me) notFound();
  const [events, emails, files, members] = await Promise.all([listEvents(id), listEmails(id), listAttachments(id), listMembers()]);

  const j = buildJourney(doc, [...events].reverse(), members, settings);
  const mine = needsMe(doc, me, settings);
  const wf = settings.workflows;
  const pdf = files.find((f) => f.content_type.includes("pdf"));
  const s = doc.ai_suggestion;
  const sStage = s?.stage ? stageDef(wf, doc.doc_type, s.stage) : null;
  const dl = j.ins.daysToDeadline;
  const tabs: { key: Tab; label: string }[] = [
    { key: "ringkasan", label: "Ringkasan" },
    { key: "riwayat", label: "Riwayat" },
    { key: "email", label: `Email (${emails.length})` },
    { key: "file", label: `File (${files.length})` },
    { key: "detail", label: "Ubah detail" },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link href="/kontrak" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} /> Review Kontrak</Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {!j.closed && <PriorityChip level={j.ins.level} />}
          <StatusChip status={doc.status} />
          {!j.closed && <span className={cx("chip", dl !== null && dl < 0 ? "bg-bad-bg text-bad" : "bg-mute-bg text-ink-2")}>{deadlineText(dl)}</span>}
          {doc.urgent && <span className="chip bg-brand-subtle text-brand">Urgent</span>}
          {doc.is_demo && <span className="chip bg-warn-bg text-warn">Data contoh</span>}
        </div>
        <h1 className="mt-2 text-[26px] leading-tight font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-ink-2">
          {doc.code} · {typeLabel(wf, doc.doc_type)} · {doc.counterparty ?? "Pihak lawan belum diisi"}
          {doc.contract_value !== null && <> · {money(Number(doc.contract_value), doc.currency)}</>}
        </p>
      </header>

      {/* Where it is + what to do */}
      <section className={cx("card mb-5 overflow-hidden", mine && "border-brand-line")}>
        <div className="hidden px-5 pt-5 pb-4 md:block"><JourneyStepper j={j} /></div>
        <Link href={`/documents/${doc.id}?tab=riwayat`} scroll={false} className="flex items-center justify-between gap-3 px-5 pt-4 pb-3.5 md:hidden">
          <MiniJourney j={j} />
          <span className="shrink-0 text-[13px] font-semibold text-brand">Perjalanan</span>
        </Link>
        <div className={cx("flex flex-wrap items-center justify-between gap-4 border-t px-5 py-4", mine ? "border-brand-line bg-brand-subtle" : "border-line-2 bg-bg")}>
          {mine ? (
            <div>
              <p className="font-bold text-brand">Giliran Anda</p>
              <p className="text-[13.5px] text-brand-deep/80">{j.current?.label}{j.ins.slaState === "breach" ? " · sudah lewat target waktu" : ""}</p>
            </div>
          ) : (
            <HolderLine j={j} />
          )}
          <div className="hidden md:block"><DocActions doc={doc} j={j} me={me} settings={settings} /></div>
        </div>
      </section>

      {s && !j.closed && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-info/20 bg-info-bg px-4 py-3 text-[14px] text-info">
          <Sparkles size={18} className="shrink-0" />
          <p className="min-w-0 flex-1">
            <b>Dari email terbaru:</b> {sStage ? <>sepertinya sudah masuk langkah <b>{sStage.label}</b>{s.hold ? " dan menunggu pihak luar" : ""}.</> : "sepertinya sedang menunggu pihak luar."} <span className="opacity-80">{s.reason}</span>
          </p>
          <div className="flex gap-2">
            <ActionButton action={A.dismissSuggestionAction} id={doc.id} className="btn btn-sm">Abaikan</ActionButton>
            <ActionButton action={A.applySuggestionAction} id={doc.id} className="btn btn-primary btn-sm" success="Perubahan diterapkan">Terapkan</ActionButton>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t) => (
              <Link key={t.key} href={`/documents/${doc.id}${t.key === "ringkasan" ? "" : `?tab=${t.key}`}`} scroll={false}
                className={cx("-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[14px] font-semibold", tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink")}>
                {t.label}
              </Link>
            ))}
          </nav>

          {tab === "ringkasan" && (
            <div className="space-y-5">
              <Card>
                <p className="max-w-[68ch] text-[15px] leading-relaxed">{doc.summary || "Belum ada ringkasan."}</p>
                {doc.key_points.length > 0 && (
                  <>
                    <h3 className="mt-5 mb-2 text-[13px] font-bold text-ink-2">Yang perlu dicek</h3>
                    <ul className="space-y-2">
                      {doc.key_points.map((p, k) => <li key={k} className="flex gap-2.5"><span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{p}</li>)}
                    </ul>
                  </>
                )}
              </Card>
              {pdf ? (
                <div className="card overflow-hidden">
                  <a href={`/api/attachments/${pdf.id}?view=1`} target="_blank" className="flex items-center gap-2 border-b border-line px-4 py-3 text-[14px] font-semibold hover:bg-bg">
                    <FileText size={16} className="text-brand" /> <span className="truncate">{pdf.filename}</span>
                    <span className="ml-auto flex items-center gap-1 text-[13px] text-ink-2">Buka <ArrowUpRight size={14} /></span>
                  </a>
                  <iframe src={`/api/attachments/${pdf.id}?view=1#view=FitH`} title={pdf.filename} className="hidden h-[640px] w-full bg-mute-bg md:block" />
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-ink-2">Belum ada file PDF. <Link href={`/documents/${doc.id}?tab=file`} className="font-semibold text-brand">Unggah file</Link></p>
              )}
            </div>
          )}

          {tab === "riwayat" && (
            <div className="space-y-5">
              <Card title="Perjalanan per langkah" sub="Siapa memegang tiap langkah dan berapa lama (hari kerja).">
                <JourneyTimeline j={j} />
              </Card>
              <Card title="Aktivitas">
                <ActionForm action={A.noteAction} className="mb-4 flex gap-2" success="Catatan ditambahkan" resetOnDone>
                  <input type="hidden" name="id" value={doc.id} />
                  <input name="note" className="input" placeholder="Tulis catatan untuk tim…" aria-label="Catatan" required />
                  <Submit className="btn" pending="…">Kirim</Submit>
                </ActionForm>
                <ol className="space-y-4">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <Avatar name={e.actor ?? "Sistem"} size={28} tone={e.type === "note" ? "ink" : "mute"} />
                      <div className="min-w-0 flex-1 text-[14px]">
                        <p>
                          <b>{e.actor ?? "Sistem"}</b> <span className="text-ink-2">{EVENT_LABEL[e.type] ?? e.type}</span>
                          {e.to_stage && <> <b>{stageDef(wf, doc.doc_type, e.to_stage)?.label ?? e.to_stage}</b></>}
                        </p>
                        {e.message && e.type !== "created" && <p className={cx("mt-1", e.type === "note" || e.type === "revision" ? "rounded-lg bg-bg px-3 py-2" : "text-ink-2")}>{e.message}</p>}
                        <p className="mt-0.5 text-[12px] text-ink-3">{formatDateTime(e.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          )}

          {tab === "email" && (
            <div className="card divide-y divide-line-2">
              {emails.length === 0 && <p className="px-5 py-8 text-center text-ink-2">Belum ada email. Balasan dengan subjek yang sama atau kode {doc.code} masuk ke sini otomatis.</p>}
              {emails.map((e, k) => (
                <details key={e.id} open={k === 0}>
                  <summary className="flex cursor-pointer items-center gap-3 px-5 py-3.5 hover:bg-bg [&::-webkit-details-marker]:hidden">
                    <Avatar name={e.from_name || e.from_email} size={30} tone="mute" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.from_name || e.from_email}</div>
                      <div className="truncate text-[13px] text-ink-2">{e.subject}</div>
                    </div>
                    <span className="shrink-0 text-[12.5px] text-ink-3">{formatDateTime(e.received_at)}</span>
                  </summary>
                  <div className="px-5 pb-5">
                    <p className="mb-3 text-[12.5px] text-ink-3">{e.from_email}{e.to_list ? ` → ${e.to_list}` : ""}</p>
                    <div className="max-h-[420px] overflow-auto text-[14px] leading-relaxed whitespace-pre-wrap">{e.body_text}</div>
                  </div>
                </details>
              ))}
            </div>
          )}

          {tab === "file" && (
            <Card>
              <ul className="divide-y divide-line-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <Paperclip size={16} className="text-ink-3" />
                    <a href={`/api/attachments/${f.id}${f.content_type.includes("pdf") ? "?view=1" : ""}`} target="_blank" className="min-w-0 flex-1 truncate font-semibold hover:text-brand">{f.filename}</a>
                    <span className="text-[12.5px] text-ink-3">{fileSize(f.size)} · {formatShort(f.created_at)}</span>
                  </li>
                ))}
                {files.length === 0 && <li className="py-4 text-ink-2">Belum ada file.</li>}
              </ul>
              <ActionForm action={A.uploadAttachmentAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-2 pt-4" success="File diunggah" resetOnDone>
                <input type="hidden" name="id" value={doc.id} />
                <input type="file" name="files" multiple required className="min-w-0 flex-1 text-[14px] file:mr-3 file:h-9 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:font-semibold" />
                <Submit className="btn" pending="Mengunggah…">Unggah</Submit>
              </ActionForm>
              <p className="hint">Maksimal 4 MB per unggahan. File lebih besar kirim lewat email ke mailbox legal.</p>
            </Card>
          )}

          {tab === "detail" && (
            <Card>
              <ActionForm action={A.updateDetailsAction} className="grid gap-4 sm:grid-cols-2" success="Detail disimpan">
                <input type="hidden" name="id" value={doc.id} />
                <div className="sm:col-span-2"><label className="label" htmlFor="f-title">Judul dokumen</label><input id="f-title" name="title" defaultValue={doc.title} className="input" /></div>
                <div><label className="label" htmlFor="f-cp">Pihak lawan</label><input id="f-cp" name="counterparty" defaultValue={doc.counterparty ?? ""} className="input" /></div>
                <div><label className="label" htmlFor="f-type">Jenis dokumen</label>
                  <select id="f-type" name="doc_type" defaultValue={doc.doc_type} className="input">{wf.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                <div><label className="label" htmlFor="f-val">Nilai kontrak</label><input id="f-val" name="contract_value" inputMode="numeric" defaultValue={doc.contract_value === null ? "" : Number(doc.contract_value).toLocaleString("id-ID")} className="input tnum" /></div>
                <div><label className="label" htmlFor="f-cur">Mata uang</label><input id="f-cur" name="currency" defaultValue={doc.currency} className="input" /></div>
                <div><label className="label" htmlFor="f-dl">Deadline</label><input id="f-dl" type="date" name="deadline" defaultValue={j.ins.deadline ?? ""} className="input" /></div>
                <div><label className="label" htmlFor="f-pic">PIC (Staff Legal)</label>
                  <select id="f-pic" name="assignee_id" defaultValue={doc.assignee_id ?? ""} className="input"><option value="">Belum ada</option>{members.filter((m) => m.active && m.role !== "cpo").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                <div><label className="label" htmlFor="f-risk">Tingkat risiko</label>
                  <select id="f-risk" name="risk_level" defaultValue={doc.risk_level} className="input">{(["low", "medium", "high"] as const).map((k) => <option key={k} value={k}>{RISK_LABEL[k]}</option>)}</select></div>
                <div />
                <fieldset className="sm:col-span-2">
                  <legend className="label">Alur untuk dokumen ini</legend>
                  <p className="hint -mt-1 mb-2">Atur langkah yang dilalui dokumen ini saja. Alur default diatur di Pengaturan.</p>
                  <input type="hidden" name="steps_form" value="1" />
                  <ul className="divide-y divide-line-2 rounded-lg border border-line">
                    {typeDef(wf, doc.doc_type).stages.map((st) => {
                      const skip = doc.skip_stages ?? [];
                      const val = skip.includes(st.key) ? "skip" : skip.includes(`+${st.key}`) ? "force" : "auto";
                      const current = st.key === doc.stage;
                      const autoOn = conditionMet(st, { ...stageCtx(doc, settings), skip: [] });
                      return (
                        <li key={st.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[14px]">
                          <span>
                            <span className="font-semibold">{st.label}</span>
                            <span className="ml-1.5 text-[12.5px] text-ink-3">{ROLE_LABEL[st.role]}{st.approval ? " · persetujuan" : ""}</span>
                          </span>
                          {current ? (
                            <span className="text-[12.5px] font-semibold text-brand">Langkah saat ini</span>
                          ) : (
                            <select name={`step_${st.key}`} defaultValue={val} className="input h-8 w-auto text-[13px]">
                              {st.condition === "high_value"
                                ? <><option value="auto">Otomatis ({autoOn ? "dilalui" : "dilewati"})</option><option value="force">Wajib dilalui</option></>
                                : <option value="auto">Dilalui</option>}
                              <option value="skip">Lewati</option>
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <label className="flex items-center gap-2.5 text-[14px] font-semibold sm:col-span-2"><input type="checkbox" name="urgent" defaultChecked={doc.urgent} className="h-4 w-4 accent-[#c0272d]" /> Tandai urgent</label>
                <div className="sm:col-span-2"><Submit>Simpan perubahan</Submit></div>
              </ActionForm>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card title="Info penting">
            <dl className="space-y-3 text-[14px]">
              {[
                ["Deadline", j.ins.deadline ? `${formatDate(j.ins.deadline)}` : "Belum ditentukan"],
                ["Perkiraan selesai", j.ins.projectedFinish ? formatDate(j.ins.projectedFinish) : "—"],
                ["PIC", doc.assignee_name ?? "Belum ada"],
                ["Peminta", doc.requester_name ?? "—"],
                ["Risiko", RISK_LABEL[doc.risk_level]],
                ["Masuk", formatDate(doc.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className={cx("text-right font-semibold", k === "Perkiraan selesai" && j.ins.latePrediction && "text-warn")}>{v}</dd>
                </div>
              ))}
            </dl>
            {j.ins.latePrediction && <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">Dengan kecepatan sekarang, dokumen diperkirakan selesai setelah deadline.</p>}
          </Card>
          {!j.closed && (
            <Card title={`Kenapa ${PRIORITY[j.ins.level].label.toLowerCase()}?`}>
              <ul className="space-y-1.5 text-[13.5px]">
                {j.ins.factors.filter((f) => f.points >= 7).map((f) => <li key={f.label} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{f.label}</li>)}
                {j.ins.factors.every((f) => f.points < 7) && <li className="text-ink-2">Tidak ada faktor mendesak.</li>}
              </ul>
              <p className="mt-3 text-[12.5px] text-ink-3">{PRIORITY[j.ins.level].hint}. Dihitung otomatis dari deadline, nilai, jenis, risiko, dan keterlambatan.</p>
            </Card>
          )}
          {j.current?.approval && !mine && !j.closed && (
            <p className="px-1 text-[13px] text-ink-3">Persetujuan oleh {ROLE_LABEL[j.current.role]}. Anda masuk sebagai {ROLE_LABEL[me.role]}.</p>
          )}
        </aside>
      </div>

      <DocActions doc={doc} j={j} me={me} settings={settings} layout="bar" />
    </div>
  );
}
