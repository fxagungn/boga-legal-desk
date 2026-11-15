import Link from "next/link";
import { ExternalLink, MessageSquarePlus, Plus, Sparkles } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { aiReady } from "@/lib/ai";
import { LIBRARY_KINDS, listLibrary, listLibraryUpdates, NCP_CHIP, NCP_STATUS, type LibraryRow } from "@/lib/ldms/history";
import { formatDate, formatDateTime } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog, ActionForm, Submit } from "@/components/actions";
import { DemoBadge, Drawer, Fact, SectionTitle } from "@/components/ldms/bits";
import { FilesSection } from "@/components/ldms/Files";
import { LibraryConsult } from "@/components/ldms/Advice";
import { addLibraryUpdateAction, saveLibraryAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

type SP = { kind?: string; q?: string; d?: string; ai?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { can } = await pageGuard("library");
  const sp = await searchParams;
  const [all, ready] = await Promise.all([listLibrary(), aiReady()]);
  const q = (sp.q ?? "").toLowerCase();
  const found = all.filter((l) => !q || [l.code, l.title, l.parties, l.requester, l.policy_ref, l.core, l.key_points, l.updates_text].filter(Boolean).join(" ").toLowerCase().includes(q));
  const rows = found.filter((l) => !sp.kind || l.kind === sp.kind);
  const sel = sp.d ? all.find((l) => l.code === sp.d) ?? null : null;
  const editable = can("library", "edit");
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind: sp.kind, q: sp.q, ...patch })) if (v) p.set(k, v);
    return `/repository${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-2 p-3.5">
        <nav className="flex flex-wrap gap-1.5" aria-label="Jenis dokumen">
          {["", ...LIBRARY_KINDS].map((k) => (
            <Link key={k || "all"} href={href({ kind: k || undefined, d: undefined })} scroll={false} aria-current={(sp.kind ?? "") === k ? "true" : undefined}
              className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold hover:no-underline", (sp.kind ?? "") === k ? "border-brand-line bg-brand-subtle text-brand-hover" : "border-line text-ink-2 hover:text-ink")}>
              {k || "Semua"} <span className="font-mono text-[11px] text-ink-3">{found.filter((l) => !k || l.kind === k).length}</span>
            </Link>
          ))}
        </nav>
        <form method="get" className="flex min-w-[180px] flex-1 gap-2">
          {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
          <label className="sr-only" htmlFor="lq">Cari</label>
          <input id="lq" name="q" defaultValue={sp.q} placeholder="Cari dokumen…" className="input h-9 flex-1" />
        </form>
        <Link href={href({ ai: sp.ai ? undefined : "1", d: undefined })} scroll={false} className={cx("btn", sp.ai && "border-brand-line bg-brand-subtle text-brand")}><Sparkles size={15} /> Konsultasi AI</Link>
        {editable && (
          <>
            <ActionDialog action={saveLibraryAction} id={0} wide trigger={<><Plus size={16} /> NCP</>} triggerClass="btn" title="Tambah NCP" desc="Non Conformity Policy: penyimpangan kebijakan untuk periode tertentu." submit="Simpan">
              <input type="hidden" name="kind" value="NCP" />
              <DocFields kind="NCP" />
            </ActionDialog>
            <ActionDialog action={saveLibraryAction} id={0} wide trigger={<><Plus size={16} /> Legal Opinion</>} triggerClass="btn btn-primary" title="Tambah dokumen" submit="Simpan">
              <div className="mb-3"><label className="label" htmlFor="lb-k">Jenis</label><select id="lb-k" name="kind" className="input">{LIBRARY_KINDS.filter((k) => k !== "NCP").map((k) => <option key={k}>{k}</option>)}</select></div>
              <DocFields kind="Legal Opinion" />
            </ActionDialog>
          </>
        )}
      </section>

      {sp.ai && (
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-extrabold">Konsultasi AI</h2>
          <LibraryConsult ai={ready.ok ? null : ready.reason} />
        </section>
      )}

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13px] text-ink-2">Belum ada dokumen.</p> : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((l) => (
            <li key={l.id}>
              <Link href={href({ d: l.code })} scroll={false} className={cx("flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfc] hover:no-underline", sel?.id === l.id && "bg-brand-subtle")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{l.title}</div>
                  <div className="truncate text-[12px] text-ink-3">
                    {l.kind} · diperbarui {formatDate(l.last_at)}{l.last_by ? ` oleh ${l.last_by}` : ""}{l.update_count ? ` · ${l.update_count} pembaruan` : ""}
                  </div>
                </div>
                {l.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                {l.kind === "NCP" && l.status && <span className={cx("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", NCP_CHIP[l.status])}>{l.status}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sel && <DocDrawer l={sel} closeHref={href({ d: undefined })} editable={editable} />}
    </div>
  );
}

function DocFields({ kind, l }: { kind: string; l?: LibraryRow }) {
  const ncp = kind === "NCP";
  const k = l?.id ?? (ncp ? "n" : "o");
  return (
    <div className="grid gap-3">
      <div><label className="label" htmlFor={`lb-t${k}`}>Judul</label><input id={`lb-t${k}`} name="title" required defaultValue={l?.title} className="input" /></div>
      {ncp ? (
        <>
          <div><label className="label" htmlFor={`lb-pr${k}`}>Kebijakan / aturan yang disimpangi</label><input id={`lb-pr${k}`} name="policy_ref" defaultValue={l?.policy_ref ?? ""} className="input" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor={`lb-rq${k}`}>Unit / departemen pemohon</label><input id={`lb-rq${k}`} name="requester" defaultValue={l?.requester ?? ""} className="input" /></div>
            <div><label className="label" htmlFor={`lb-st${k}`}>Status</label><select id={`lb-st${k}`} name="status" defaultValue={l?.status ?? "Diajukan"} className="input">{NCP_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div><label className="label" htmlFor={`lb-c${k}`}>Alasan penyimpangan</label><textarea id={`lb-c${k}`} name="core" rows={2} defaultValue={l?.core ?? ""} className="input" /></div>
          <div><label className="label" htmlFor={`lb-kp${k}`}>Risiko & mitigasi</label><textarea id={`lb-kp${k}`} name="key_points" rows={2} defaultValue={l?.key_points ?? ""} className="input" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor={`lb-d${k}`}>Tanggal NCP</label><input id={`lb-d${k}`} name="doc_date" type="date" defaultValue={l?.doc_date ?? ""} className="input" /></div>
            <div><label className="label" htmlFor={`lb-vf${k}`}>Berlaku mulai</label><input id={`lb-vf${k}`} name="valid_from" type="date" defaultValue={l?.valid_from ?? ""} className="input" /></div>
            <div><label className="label" htmlFor={`lb-vt${k}`}>Berlaku sampai</label><input id={`lb-vt${k}`} name="valid_to" type="date" defaultValue={l?.valid_to ?? ""} className="input" /></div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor={`lb-p${k}`}>Diminta oleh / pihak</label><input id={`lb-p${k}`} name="parties" defaultValue={l?.parties ?? ""} className="input" /></div>
            <div><label className="label" htmlFor={`lb-d${k}`}>Tanggal</label><input id={`lb-d${k}`} name="doc_date" type="date" defaultValue={l?.doc_date ?? ""} className="input" /></div>
          </div>
          <div><label className="label" htmlFor={`lb-c${k}`}>Pendapat inti</label><textarea id={`lb-c${k}`} name="core" rows={2} defaultValue={l?.core ?? ""} className="input" /></div>
          <div><label className="label" htmlFor={`lb-kp${k}`}>Rekomendasi</label><textarea id={`lb-kp${k}`} name="key_points" rows={3} defaultValue={l?.key_points ?? ""} className="input" /></div>
        </>
      )}
      <div><label className="label" htmlFor={`lb-f${k}`}>Link file (Google Drive, opsional)</label><input id={`lb-f${k}`} name="file_url" type="url" defaultValue={l?.file_url ?? ""} className="input" /></div>
    </div>
  );
}

async function DocDrawer({ l, closeHref, editable }: { l: LibraryRow; closeHref: string; editable: boolean }) {
  const updates = await listLibraryUpdates(l.id);
  const ncp = l.kind === "NCP";
  return (
    <Drawer closeHref={closeHref} label={`Detail ${l.code}`} header={
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-ink-3">{l.code} · {l.kind}</span>
          {ncp && l.status && <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", NCP_CHIP[l.status])}>{l.status}</span>}
          {l.is_demo && <DemoBadge />}
        </div>
        <h2 className="mt-1 text-[19px] leading-snug font-bold">{l.title}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
          Dibuat oleh <b className="text-ink">{l.created_by ?? "—"}</b> · {formatDateTime(l.created_at)}<br />
          Terakhir diperbarui oleh <b className="text-ink">{l.last_by ?? "—"}</b> · {formatDateTime(l.last_at)}
        </p>
      </>
    }>
      {ncp ? (
        <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4">
          <Fact label="Kebijakan yang disimpangi" wide>{l.policy_ref}</Fact>
          <Fact label="Pemohon">{l.requester}</Fact>
          <Fact label="Masa berlaku">{l.valid_from || l.valid_to ? `${l.valid_from ? formatDate(l.valid_from) : "?"} – ${l.valid_to ? formatDate(l.valid_to) : "?"}` : null}</Fact>
        </section>
      ) : (l.parties || l.doc_date) && (
        <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4">
          <Fact label="Diminta oleh / pihak">{l.parties}</Fact>
          <Fact label="Tanggal">{l.doc_date ? formatDate(l.doc_date) : null}</Fact>
        </section>
      )}
      {l.core && <section><SectionTitle>{ncp ? "Alasan penyimpangan" : "Pendapat inti"}</SectionTitle><p className="text-[13.5px] leading-relaxed whitespace-pre-line">{l.core}</p></section>}
      {l.key_points && <section><SectionTitle>{ncp ? "Risiko & mitigasi" : "Rekomendasi"}</SectionTitle><p className="text-[13.5px] leading-relaxed whitespace-pre-line">{l.key_points}</p></section>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {l.file_url && <a href={l.file_url} target="_blank" rel="noreferrer" className="btn btn-sm mr-auto">Buka file <ExternalLink size={13} /></a>}
        {editable && (
          <ActionDialog action={saveLibraryAction} id={l.id} wide trigger="Ubah isi awal" triggerClass="btn btn-sm" title={`Ubah ${l.code}`} desc="Untuk perkembangan baru, pakai Pembaruan di bawah." submit="Simpan">
            <DocFields kind={l.kind} l={l} />
          </ActionDialog>
        )}
      </div>

      <section>
        <SectionTitle>Pembaruan {updates.length ? <span className="ml-1 rounded-full bg-mute-bg px-1.5 py-0.5 text-[11px] text-ink-2">{updates.length}</span> : null}</SectionTitle>
        {editable && (
          <ActionForm action={addLibraryUpdateAction} resetOnDone success="Pembaruan ditambahkan" className="mb-4 grid gap-2 rounded-xl bg-bg p-3">
            <input type="hidden" name="id" value={l.id} />
            <div className={cx("grid gap-2", ncp ? "sm:grid-cols-3" : "sm:grid-cols-[180px_1fr]")}>
              <input name="period" placeholder="Periode, mis. Q1 2027" aria-label="Periode" className="input h-9" />
              {ncp && (
                <>
                  <select name="new_status" defaultValue="" aria-label="Ubah status" className="input h-9"><option value="">Status tetap</option>{NCP_STATUS.filter((s) => s !== l.status).map((s) => <option key={s} value={s}>Status → {s}</option>)}</select>
                  <input name="valid_to" type="date" aria-label="Berlaku sampai (baru)" title="Berlaku sampai (isi bila diperpanjang)" className="input h-9" />
                </>
              )}
            </div>
            <label className="sr-only" htmlFor={`up-${l.id}`}>Isi pembaruan</label>
            <textarea id={`up-${l.id}`} name="body" rows={3} required placeholder="Perkembangan terbaru…" className="input" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-ink-3">Nama dan waktu tercatat otomatis. Pembaruan tidak bisa diubah.</span>
              <Submit className="btn btn-sm"><MessageSquarePlus size={14} /> Tambah pembaruan</Submit>
            </div>
          </ActionForm>
        )}
        {updates.length === 0 ? <p className="text-[13px] text-ink-3">Belum ada pembaruan.</p> : (
          <ol className="relative space-y-4 border-l-2 border-line-2 pl-4">
            {updates.map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                  <b className="text-[13px] text-ink">{u.by_name}</b>
                  <span>{formatDateTime(u.created_at)}</span>
                  {u.period && <span className="rounded-[5px] bg-mute-bg px-1.5 py-px font-semibold text-ink-2">{u.period}</span>}
                  {u.new_status && <span className={cx("rounded-[5px] px-1.5 py-px font-bold", NCP_CHIP[u.new_status])}>Status → {u.new_status}</span>}
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line">{u.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <FilesSection entity="library" id={l.id} editable={editable} />
    </Drawer>
  );
}
