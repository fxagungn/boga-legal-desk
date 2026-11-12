import { Pencil, Plus } from "lucide-react";
import type { Member } from "@/lib/repo";
import type { AgreementRow, AgrKind } from "@/lib/ldms/agreements";
import type { UnitRow } from "@/lib/ldms/permits";
import { ActionDialog } from "@/components/actions";
import { saveAgreementAction } from "@/app/ldms-actions";

const F = ({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) => (
  <div><label className="label" htmlFor={id}>{label}</label>{children}{hint && <p className="hint">{hint}</p>}</div>
);

/** Add (kind given, no `a`) or edit an agreement. Fields follow blueprint §6.2 per kind. */
export function AgreementForm({ kind, a, members, me, brands, units, mlas }: {
  kind: AgrKind; a?: AgreementRow; members: Member[]; me: Member; brands: { id: number; name: string; has_principal: boolean }[]; units: UnitRow[]; mlas: AgreementRow[];
}) {
  const k = a?.kind ?? kind;
  const v = (x: string | null | undefined) => x ?? "";
  const n = (x: string | null | undefined) => (x ? Number(x).toLocaleString("id-ID") : "");
  return (
    <ActionDialog action={saveAgreementAction} id={a?.id ?? 0}
      trigger={a ? <><Pencil size={14} /> Ubah</> : <><Plus size={16} /> Tambah {k}</>} triggerClass={a ? "btn btn-sm" : "btn btn-primary"}
      title={a ? `Ubah ${a.code}` : `Tambah ${k}`} desc={a ? a.title : undefined} submit="Simpan">
      <input type="hidden" name="kind" value={k} />
      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
        <F id="ag-title" label="Judul"><input id="ag-title" name="title" required defaultValue={v(a?.title)} className="input" /></F>
        {k === "MLA" && (
          <>
            <F id="ag-brand" label="Brand berprincipal">
              <select id="ag-brand" name="brand_id" required defaultValue={a?.brand_id ?? ""} className="input">
                <option value="" disabled>Pilih brand…</option>
                {brands.filter((b) => b.has_principal).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </F>
            <F id="ag-pr" label="Principal"><input id="ag-pr" name="principal" defaultValue={v(a?.principal)} className="input" /></F>
            <F id="ag-ter" label="Territory"><input id="ag-ter" name="territory" defaultValue={v(a?.territory) || "Republik Indonesia — eksklusif"} className="input" /></F>
          </>
        )}
        {k === "ULA" && (
          <>
            <F id="ag-mla" label="MLA induk">
              <select id="ag-mla" name="parent_id" required defaultValue={a?.parent_id ?? ""} className="input">
                <option value="" disabled>Pilih MLA…</option>
                {mlas.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.brand}</option>)}
              </select>
            </F>
            <F id="ag-unit" label="Outlet">
              <select id="ag-unit" name="unit_id" required defaultValue={a?.unit_id ?? ""} className="input">
                <option value="" disabled>Pilih outlet…</option>
                {units.filter((u) => u.scope === "outlet" && brands.find((b) => b.name === u.brand)?.has_principal).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F id="ag-loc" label="Lokasi (mal)"><input id="ag-loc" name="location" defaultValue={v(a?.location)} className="input" /></F>
              <F id="ag-city" label="Kota"><input id="ag-city" name="city" defaultValue={v(a?.city)} className="input" /></F>
            </div>
            <F id="ag-fx" label="Kurs acuan"><input id="ag-fx" name="fx_ref" defaultValue={v(a?.fx_ref) || "Kurs tengah BI tanggal invoice"} className="input" /></F>
          </>
        )}
        {(k === "PKS" || k === "PSM") && (
          <F id="ag-cp" label={k === "PSM" ? "Lessor (pengelola mal)" : "Counterparty"}><input id="ag-cp" name="counterparty" defaultValue={v(a?.counterparty)} className="input" /></F>
        )}
        {k === "PSM" && (
          <>
            <F id="ag-unit2" label="Outlet">
              <select id="ag-unit2" name="unit_id" defaultValue={a?.unit_id ?? ""} className="input">
                <option value="">—</option>
                {units.filter((u) => u.scope === "outlet").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </F>
            <F id="ag-sch" label="Skema sewa"><input id="ag-sch" name="scheme" defaultValue={v(a?.scheme)} className="input" placeholder="Fixed rent + service charge / fixed vs revenue sharing %" /></F>
            <F id="ag-ren" label="Opsi perpanjangan"><input id="ag-ren" name="renewal_option" defaultValue={v(a?.renewal_option)} className="input" /></F>
          </>
        )}
        {k === "PKS" && <F id="ag-nat" label="Sifat"><input id="ag-nat" name="nature" defaultValue={v(a?.nature)} className="input" placeholder="Jasa / Supply · tenor" /></F>}
        <div className="grid grid-cols-2 gap-3">
          <F id="ag-start" label="Mulai"><input id="ag-start" name="start_date" type="date" defaultValue={v(a?.start_date)} className="input" /></F>
          <F id="ag-end" label="Berakhir"><input id="ag-end" name="end_date" type="date" required defaultValue={v(a?.end_date)} className="input" /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F id="ag-notice" label="Notice (hari sebelum berakhir)"><input id="ag-notice" name="notice_days" inputMode="numeric" defaultValue={a?.notice_days ?? ""} className="input" /></F>
          <F id="ag-tenor" label="Tenor"><input id="ag-tenor" name="tenor" defaultValue={v(a?.tenor)} className="input" /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F id="ag-ccy" label="Mata uang">
            <select id="ag-ccy" name="currency" defaultValue={a?.currency ?? (k === "MLA" || k === "ULA" ? "USD" : "IDR")} className="input">
              {["IDR", "USD", "SGD", "JPY"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </F>
          {k === "ULA"
            ? <F id="ag-fee" label="Unit fee"><input id="ag-fee" name="unit_fee" inputMode="numeric" defaultValue={n(a?.unit_fee)} className="input tnum" /></F>
            : <F id="ag-val" label={k === "PSM" ? "Sewa per tahun" : k === "PKS" ? "Nilai komitmen" : "Nilai"}><input id="ag-val" name="value" inputMode="numeric" defaultValue={n(a?.value)} className="input tnum" /></F>}
        </div>
        {(k === "MLA" || k === "ULA") && <F id="ag-roy" label="Royalty (% net sales)"><input id="ag-roy" name="royalty_pct" inputMode="decimal" defaultValue={v(a?.royalty_pct)} className="input" /></F>}
        {k === "PKS" && <F id="ag-term" label="Termination clause"><input id="ag-term" name="termination_clause" defaultValue={v(a?.termination_clause)} className="input" /></F>}
        {k !== "MLA" && <F id="ag-file" label="Link file (Google Drive)"><input id="ag-file" name="file_url" type="url" defaultValue={v(a?.file_url)} className="input" placeholder="https://drive.google.com/…" /></F>}
        <div className="grid grid-cols-2 gap-3">
          <F id="ag-pic" label="PIC Legal">
            <select id="ag-pic" name="pic_id" defaultValue={a?.pic_id ?? me.id} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </F>
          <F id="ag-st" label="Status">
            <select id="ag-st" name="status" defaultValue={a?.status ?? "aktif"} className="input"><option value="aktif">Aktif</option><option value="berakhir">Berakhir</option></select>
          </F>
        </div>
      </div>
    </ActionDialog>
  );
}
