import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarClock, FileText, History, Info, Paperclip, ShieldAlert, X } from "lucide-react";
import { listMembers, type Member } from "@/lib/repo";
import {
  canEditPermit, canManageSomasi, daysText, getPermitByCode, inWindow, listAudit, listFiles, listNotes, listPeriods,
  listPermitTypes, listReminders, listUnits, needsAck, RENEWAL_LABEL, RENEWAL_STEPS, SCOPE_LABEL, shortName, stagesFor, TIME_CHIP, timeStatus,
} from "@/lib/ldms/permits";
import { money, fileSize } from "@/lib/format";
import { formatDate, formatDateTime, timeAgo } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog, ActionForm, Submit } from "@/components/actions";
import * as P from "@/app/permit-actions";
import { PermitForm } from "./PermitForm";

export async function PermitDrawer({ code, me, closeHref }: { code: string; me: Member; closeHref: string }) {
  const p = await getPermitByCode(code);
  if (!p) return null;
  const [notes, files, log, reminders, periods, units, types, members] = await Promise.all([
    listNotes("permit", p.id), listFiles("permit", p.id), listAudit("permit", p.id), listReminders("permit", p.id),
    listPeriods(p.id), listUnits(), listPermitTypes(), listMembers(true),
  ]);
  const editable = canEditPermit(me, p);
  const ts = timeStatus(p.days);
  const windowOpen = inWindow(p);
  const ladder = stagesFor(p.lead_days);

  return (
    <div className="fixed inset-0 z-50">
      <Link href={closeHref} scroll={false} aria-label="Tutup detail" className="absolute inset-0 bg-ink/25" />
      <aside className="drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-surface shadow-[var(--shadow-drawer)]" aria-label={`Detail ${p.code}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[12px] font-semibold text-ink-3">{p.code} · {p.type_code} · {SCOPE_LABEL[p.scope]}</div>
            <h2 className="mt-1 text-[19px] leading-snug font-bold tracking-tight">{p.type_name}</h2>
            <p className="text-[14px] text-ink-2">{p.unit_name}{p.brand ? ` · ${p.brand}` : ""}{p.city ? ` · ${p.city}` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={cx("chip font-mono", TIME_CHIP[ts])}>{daysText(p.days)}</span>
              <span className="text-[13px] text-ink-2">Jatuh tempo <b className="text-ink">{p.expiry_date ? formatDate(p.expiry_date) : "—"}</b></span>
            </div>
          </div>
          <Link href={closeHref} scroll={false} className="btn btn-ghost btn-sm -mr-2 px-2" aria-label="Tutup"><X size={20} /></Link>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* banners */}
          {(ts === "overdue" || ts === "today") && (
            <Banner tone="bad" icon={AlertTriangle}>
              {ts === "overdue" ? <>Izin ini <b>sudah kedaluwarsa {-p.days!} hari</b>. Masuk antrean reminder harian ke PIC, Supervisor, Head, dan Director Legal (lihat Reminder Engine).</> : <>Izin ini <b>jatuh tempo hari ini</b>. Besok masuk status kedaluwarsa.</>}
            </Banner>
          )}
          {windowOpen && p.blocker_note && p.renewal_status !== "submitted" && <Banner tone="warn" icon={Info}>Blocker umum: {p.blocker_note}</Banner>}

          {/* renewal */}
          <section>
            <SectionTitle>Status renewal</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-bg p-1">
              {RENEWAL_STEPS.map((s) => {
                const on = p.renewal_status === s;
                const cls = cx("h-10 rounded-lg px-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed", on ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-2 hover:text-ink");
                if (!editable) return <span key={s} className={cx(cls, "grid place-items-center hover:text-ink-2")}>{RENEWAL_LABEL[s]}</span>;
                return (
                  <ActionForm key={s} action={P.setRenewalAction} className="contents">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value={s} />
                    <Submit pending="…" className={cls}>
                      {RENEWAL_LABEL[s]}
                    </Submit>
                  </ActionForm>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {editable && (
                <ActionDialog action={P.issuePermitAction} id={p.id} triggerClass="btn btn-ok btn-sm" trigger={<><BadgeCheck size={15} /> Tandai terbit</>}
                  title="Izin sudah terbit" desc="Periode lama diarsipkan; reminder berikutnya dihitung dari tanggal berlaku baru." submit="Simpan periode baru" submitClass="btn btn-ok">
                  <div className="grid gap-3">
                    <div><label className="label" htmlFor="is-num">Nomor izin baru</label><input id="is-num" name="number" defaultValue={p.number ?? ""} className="input font-mono" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label" htmlFor="is-issue">Tanggal terbit</label><input id="is-issue" name="issue_date" type="date" className="input" /></div>
                      <div><label className="label" htmlFor="is-exp">Berlaku sampai</label><input id="is-exp" name="expiry_date" type="date" required className="input" /></div>
                    </div>
                    <div><label className="label" htmlFor="is-cost">Biaya aktual (Rp)</label><input id="is-cost" name="cost_actual" inputMode="numeric" className="input tnum" placeholder={p.est_cost ? `Estimasi ${money(Number(p.est_cost))}` : ""} /></div>
                    <div><label className="label" htmlFor="is-file">Scan izin baru</label><input id="is-file" name="file" type="file" accept=".pdf,image/*" className="input h-auto py-2" /></div>
                  </div>
                </ActionDialog>
              )}
              {editable && <PermitForm p={p} units={units} types={types} members={members} me={me} />}
              {!editable && <p className="text-[13px] text-ink-3">Hanya PIC ({p.pic_name ?? "—"}) atau Supervisor ke atas yang bisa mengubah dokumen ini.</p>}
            </div>
          </section>

          {/* facts */}
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4 text-[13.5px]">
            <Fact label="Nomor"><span className="font-mono">{p.number ?? "—"}</span></Fact>
            <Fact label="PIC Legal">{p.pic_name ?? "—"}</Fact>
            <Fact label="Tanggal terbit">{p.issue_date ? formatDate(p.issue_date) : "—"}</Fact>
            <Fact label="Masa berlaku">{p.validity_years ? `${Number(p.validity_years)} tahun` : "—"}</Fact>
            <Fact label="Instansi" wide>{p.agency ?? "—"}</Fact>
            <Fact label="Estimasi biaya">{p.est_cost ? money(Number(p.est_cost)) : "—"}</Fact>
            <Fact label="Biaya aktual">{p.cost_actual ? money(Number(p.cost_actual)) : "—"}</Fact>
            <Fact label="Tangga reminder" wide>
              <span className="flex flex-wrap gap-1">
                {ladder.map((d) => <span key={d} className={cx("chip h-6 font-mono", p.days !== null && p.days <= d ? "bg-ink text-white" : "bg-mute-bg text-ink-2")}>H-{d}</span>)}
                <span className="chip h-6 bg-mute-bg font-mono text-ink-2">H-0</span>
                <span className="chip h-6 bg-mute-bg font-mono text-ink-2">Overdue harian</span>
              </span>
            </Fact>
          </section>

          {/* somasi */}
          <section>
            <SectionTitle>Somasi & acknowledge</SectionTitle>
            {p.requires_ack ? (
              <div className="rounded-xl border border-brand-line bg-brand-subtle p-4">
                <div className="flex items-center gap-2 text-[12px] font-bold tracking-wider text-brand uppercase"><ShieldAlert size={15} /> Bersomasi</div>
                <p className="mt-2 text-[14px] text-ink">{p.somasi_text}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">Ditandai {p.somasi_by ?? "—"}{p.somasi_at ? ` · ${formatDateTime(p.somasi_at)}` : ""}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-line pt-3">
                  {needsAck(p) ? (
                    editable ? (
                      <ActionForm action={P.ackSomasiAction} className="contents">
                        <input type="hidden" name="id" value={p.id} />
                        <Submit className="btn btn-primary btn-sm">Acknowledge — saya terima & tindak lanjuti</Submit>
                      </ActionForm>
                    ) : <span className="text-[13px] font-semibold text-brand">Menunggu acknowledge dari PIC. Masuk antrean reminder somasi harian.</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ok"><BadgeCheck size={15} /> Di-acknowledge {p.ack_by} · {formatDateTime(p.ack_at!)} via {p.ack_via}</span>
                  )}
                  {canManageSomasi(me) && (
                    <ActionDialog action={P.clearSomasiAction} id={p.id} triggerClass="btn btn-ghost btn-sm ml-auto" trigger="Cabut status somasi"
                      title="Cabut status somasi?" desc="Reminder somasi berhenti dan acknowledge direset. Tercatat di riwayat." submit="Cabut somasi" submitClass="btn btn-danger">
                      <label className="label" htmlFor="cs-reason">Alasan (opsional)</label>
                      <input id="cs-reason" name="reason" className="input" placeholder="mis. signage sudah diturunkan, izin terbit" />
                    </ActionDialog>
                  )}
                </div>
              </div>
            ) : canManageSomasi(me) ? (
              <ActionDialog action={P.markSomasiAction} id={p.id} triggerClass="btn btn-sm" trigger={<><ShieldAlert size={15} /> Tandai bersomasi & wajibkan acknowledge</>}
                title="Tandai bersomasi" desc="PIC wajib acknowledge. Sampai di-acknowledge, dokumen ini masuk antrean reminder somasi harian ke PIC dan Supervisor." submit="Tandai bersomasi">
                <label className="label" htmlFor="ms-text">Nomor / perihal somasi</label>
                <textarea id="ms-text" name="somasi_text" rows={3} required minLength={10} className="input" placeholder="mis. Somasi I — pengelola mal: signage tanpa izin berlaku, diminta diturunkan dalam 7 hari." />
              </ActionDialog>
            ) : <p className="text-[13.5px] text-ink-3">Tidak bersomasi.</p>}
          </section>

          {/* notes */}
          <section>
            <SectionTitle>Catatan tambahan <Count n={notes.length} /></SectionTitle>
            <ActionForm action={P.addNoteAction} resetOnDone className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="entity" value="permit" />
              <textarea name="body" rows={2} required className="input" placeholder="Progres, kendala, hasil koordinasi dengan instansi/mal…" />
              <div className="flex justify-end"><Submit className="btn btn-sm">Tambah catatan</Submit></div>
            </ActionForm>
            {notes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-bg px-3.5 py-2.5">
                    <p className="text-[14px] whitespace-pre-line">{n.body}</p>
                    <p className="mt-1 text-[12px] text-ink-3">{n.by_name} · {formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* files */}
          <section>
            <SectionTitle>File dokumen <Count n={files.length} /></SectionTitle>
            {files.length > 0 && (
              <ul className="mb-3 divide-y divide-line-2 rounded-xl border border-line">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13.5px]">
                    <FileText size={17} className="shrink-0 text-ink-3" />
                    <a href={`/api/files/${f.id}?view=1`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold hover:text-brand">{f.filename}</a>
                    <span className="shrink-0 text-[12px] text-ink-3">{fileSize(f.size)} · {timeAgo(f.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {editable ? (
              <ActionForm action={P.uploadFileAction} resetOnDone className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="file" type="file" required accept=".pdf,image/*,.doc,.docx" className="input h-auto min-w-0 flex-1 py-1.5 text-[13px]" aria-label="Pilih file" />
                <Submit className="btn btn-sm" pending="Mengunggah…"><Paperclip size={14} /> Unggah</Submit>
              </ActionForm>
            ) : files.length === 0 && <p className="text-[13.5px] text-ink-3">Belum ada file.</p>}
          </section>

          {/* history */}
          <section>
            <SectionTitle><History size={14} className="inline" /> Riwayat</SectionTitle>
            <ul className="space-y-2.5 border-l border-line pl-4 text-[13.5px]">
              {reminders.map((r) => (
                <li key={`r${r.id}`} className="relative before:absolute before:top-1.5 before:-left-[21px] before:h-2 before:w-2 before:rounded-full before:bg-brand">
                  <b>Reminder {r.stage}</b> ke {r.to_list}{r.cc_list ? ` (cc ${r.cc_list})` : ""}<div className="text-[12px] text-ink-3">{formatDateTime(r.sent_at)}{r.status !== "sent" ? ` · ${r.status}` : ""}</div>
                </li>
              ))}
              {log.map((a) => (
                <li key={`a${a.id}`} className="relative before:absolute before:top-1.5 before:-left-[21px] before:h-2 before:w-2 before:rounded-full before:bg-ink-3">
                  <b>{shortName(a.actor)}</b> {a.action}{a.detail ? <span className="text-ink-2"> — {a.detail}</span> : null}
                  <div className="text-[12px] text-ink-3">{formatDateTime(a.at)}</div>
                </li>
              ))}
              {periods.map((x) => (
                <li key={`p${x.id}`} className="relative before:absolute before:top-1.5 before:-left-[21px] before:h-2 before:w-2 before:rounded-full before:bg-ok">
                  <b>Periode lama</b> <span className="font-mono">{x.number ?? "—"}</span> · {x.issue_date ? formatDate(x.issue_date) : "?"} – {x.expiry_date ? formatDate(x.expiry_date) : "?"}
                  <div className="text-[12px] text-ink-3">Diarsipkan {x.closed_by ?? ""} · {formatDateTime(x.closed_at)}</div>
                </li>
              ))}
              <li className="relative text-ink-3 before:absolute before:top-1.5 before:-left-[21px] before:h-2 before:w-2 before:rounded-full before:bg-line">
                <CalendarClock size={13} className="inline" /> Terakhir diubah {p.updated_by ?? "—"} · {formatDateTime(p.updated_at)}
              </li>
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-[12px] font-bold tracking-wider text-ink-3 uppercase">{children}</h3>;
}

function Count({ n }: { n: number }) {
  return n ? <span className="ml-1 rounded-full bg-mute-bg px-1.5 py-0.5 text-[11px] text-ink-2">{n}</span> : null;
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-[12px] font-semibold text-ink-3">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: "bad" | "warn"; icon: typeof Info; children: React.ReactNode }) {
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-4 py-3 text-[13.5px]", tone === "bad" ? "border-brand-line bg-brand-subtle text-brand-deep" : "border-warn/20 bg-warn-bg text-warn")}>
      <Icon size={17} className="mt-0.5 shrink-0" /><div>{children}</div>
    </div>
  );
}
