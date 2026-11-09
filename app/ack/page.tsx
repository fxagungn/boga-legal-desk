// Acknowledge a somasi from the reminder email (blueprint §14.5). Signed link: permit + member + HMAC.
import { query } from "@/lib/db";
import { getPermit, audit } from "@/lib/ldms/permits";
import { getMember } from "@/lib/repo";
import { verifyAck } from "@/lib/ldms/reminders";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; m?: string; t?: string; ok?: string }> }) {
  const sp = await searchParams;
  const pid = Number(sp.p), mid = Number(sp.m);
  let msg = "Link tidak valid.";
  let ok = false;
  if (pid && mid && sp.t && verifyAck(pid, mid, sp.t)) {
    const [p, m] = await Promise.all([getPermit(pid), getMember(mid)]);
    if (!p || !m) msg = "Dokumen atau akun tidak ditemukan.";
    else if (!p.requires_ack) msg = `${p.code} tidak sedang bersomasi.`;
    else if (p.ack_at) { ok = true; msg = `${p.code} sudah di-acknowledge oleh ${p.ack_by}.`; }
    else {
      await query(`update permits set ack_by = $2, ack_at = now(), ack_via = 'email' where id = $1 and ack_at is null`, [p.id, m.name]);
      await audit(m, "acknowledge somasi", "permit", p.id, "via email");
      ok = true;
      msg = `Terima kasih, ${m.name}. Somasi ${p.code} (${p.type_name} — ${p.unit_name}) tercatat sudah Anda terima dan akan ditindaklanjuti.`;
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[460px] rounded-[14px] border border-line bg-surface p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-[11px] bg-brand text-[16px] font-extrabold text-white" aria-hidden="true">BG</span>
        <h1 className="mt-4 text-[17px] font-extrabold">{ok ? "Acknowledge tercatat" : "Tidak bisa diproses"}</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">{msg}</p>
        <a href="/" className="btn btn-primary mt-5">Buka LDMS</a>
      </div>
    </div>
  );
}
