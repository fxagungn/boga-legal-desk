import { Pencil, Plus } from "lucide-react";
import type { Member } from "@/lib/repo";
import { SCOPE_LABEL, type PermitRow, type PermitTypeRow, type Scope, type UnitRow } from "@/lib/ldms/permits";
import { ActionDialog } from "@/components/actions";
import { savePermitAction } from "@/app/permit-actions";

/** Add a permit (no `p`) or edit the core fields of one. */
export function PermitForm({ units, types, members, me, p }: { units: UnitRow[]; types: PermitTypeRow[]; members: Member[]; me: Member; p?: PermitRow }) {
  const scopes = Object.keys(SCOPE_LABEL) as Scope[];
  const editing = Boolean(p);
  return (
    <ActionDialog
      action={savePermitAction}
      id={p?.id ?? 0}
      trigger={editing ? <><Pencil size={14} /> Ubah data</> : <><Plus size={17} /> Tambah izin</>}
      triggerClass={editing ? "btn btn-sm" : "btn btn-primary"}
      title={editing ? `Ubah ${p!.code}` : "Tambah dokumen izin"}
      desc={editing ? `${p!.type_name} · ${p!.unit_name}` : "Reminder otomatis mengikuti ambang renewal jenis izin."}
      submit={editing ? "Simpan" : "Tambah izin"}
      success={editing ? "Data izin disimpan" : undefined}
    >
      <div className="grid gap-3">
        {!editing && (
          <>
            <div>
              <label className="label" htmlFor="pf-unit">Unit</label>
              <select id="pf-unit" name="unit_id" required className="input" defaultValue="">
                <option value="" disabled>Pilih unit…</option>
                {scopes.map((s) => (
                  <optgroup key={s} label={SCOPE_LABEL[s]}>
                    {units.filter((u) => u.scope === s).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pf-type">Jenis izin</label>
              <select id="pf-type" name="permit_type_id" required className="input" defaultValue="">
                <option value="" disabled>Pilih jenis izin…</option>
                {scopes.map((s) => (
                  <optgroup key={s} label={SCOPE_LABEL[s]}>
                    {types.filter((t) => t.scope === s).map((t) => <option key={t.id} value={t.id}>{t.name} (H-{t.lead_days})</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="pf-num">Nomor izin</label>
          <input id="pf-num" name="number" defaultValue={p?.number ?? ""} className="input font-mono" placeholder="mis. 503/1234/DPMPTSP/2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="pf-issue">Tanggal terbit</label><input id="pf-issue" name="issue_date" type="date" defaultValue={p?.issue_date ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="pf-exp">Jatuh tempo</label><input id="pf-exp" name="expiry_date" type="date" defaultValue={p?.expiry_date ?? ""} required={!editing} className="input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pf-pic">PIC Legal</label>
            <select id="pf-pic" name="pic_id" defaultValue={p?.pic_id ?? me.id} className="input" disabled={editing && me.role === "staff"}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {editing && me.role === "staff" && <input type="hidden" name="pic_id" value={p?.pic_id ?? ""} />}
          </div>
          <div><label className="label" htmlFor="pf-cost">Biaya aktual (Rp)</label><input id="pf-cost" name="cost_actual" inputMode="numeric" defaultValue={p?.cost_actual ? Number(p.cost_actual).toLocaleString("id-ID") : ""} className="input tnum" /></div>
        </div>
        {!editing && (
          <div><label className="label" htmlFor="pf-file">Scan dokumen (opsional)</label><input id="pf-file" name="file" type="file" accept=".pdf,image/*" className="input h-auto py-2" /><p className="hint">PDF/JPG maks. 4 MB.</p></div>
        )}
      </div>
    </ActionDialog>
  );
}
