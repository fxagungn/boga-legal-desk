import { FileText, Paperclip } from "lucide-react";
import { listFiles } from "@/lib/ldms/permits";
import { FILE_RETENTION_YEARS } from "@/lib/ldms/retention";
import { fileSize } from "@/lib/format";
import { timeAgo } from "@/lib/time";
import { ActionForm, Submit } from "@/components/actions";
import { SectionTitle } from "@/components/ldms/bits";
import { uploadRecordFileAction } from "@/app/permit-actions";

/** Attachments of an agreement or inspection. Files older than the retention period are removed by the daily job. */
export async function FilesSection({ entity, id, editable }: { entity: "agreement" | "inspection"; id: number; editable: boolean }) {
  const files = await listFiles(entity, id);
  return (
    <section>
      <SectionTitle>File {files.length ? <span className="ml-1 rounded-full bg-mute-bg px-1.5 py-0.5 text-[11px] text-ink-2">{files.length}</span> : null}</SectionTitle>
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
        <ActionForm action={uploadRecordFileAction} resetOnDone className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="entity" value={entity} />
          <input name="file" type="file" required accept=".pdf,image/*,.doc,.docx" className="input h-auto min-w-0 flex-1 py-1.5 text-[13px]" aria-label="Pilih file" />
          <Submit className="btn btn-sm" pending="Mengunggah…"><Paperclip size={14} /> Unggah</Submit>
        </ActionForm>
      ) : files.length === 0 && <p className="text-[13.5px] text-ink-3">Belum ada file.</p>}
      <p className="mt-1.5 text-[11.5px] text-ink-3">Maks. 4 MB. File berumur lebih dari {FILE_RETENTION_YEARS} tahun dihapus otomatis; data rekapan tetap tersimpan.</p>
    </section>
  );
}
