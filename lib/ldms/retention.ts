// Attachments are kept 3 years from upload. Older files are deleted; the records the Legal team typed in
// (permit, agreement, inspection data, notes, history) stay.
import { query } from "../db";

export const FILE_RETENTION_YEARS = 3;

export async function purgeOldFiles(actor = "Sistem") {
  const rows = await query<{ entity: string; entity_id: number; filename: string }>(
    `delete from files where created_at < now() - interval '${FILE_RETENTION_YEARS} years' returning entity, entity_id, filename`,
  );
  for (const r of rows) {
    await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'hapus file > ${FILE_RETENTION_YEARS} tahun',$2,$3,$4)`,
      [actor, r.entity, String(r.entity_id), r.filename]);
  }
  return { deleted: rows.length };
}
