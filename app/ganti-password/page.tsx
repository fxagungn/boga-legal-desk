import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { currentMember } from "@/lib/repo";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await currentMember();
  if (!me) redirect("/login");
  const { next = "/" } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="card w-full max-w-sm p-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="mb-5 h-10 w-10" />
        <h1 className="text-2xl font-bold tracking-tight">{me.must_change_password ? "Buat password baru" : "Ganti password"}</h1>
        <p className="mt-1 mb-6 text-ink-2">
          {me.must_change_password ? <>Halo {me.name.split(" ")[0]}, demi keamanan ganti password awal (tanggal lahir) sebelum mulai.</> : "Masukkan password lama dan password baru Anda."}
        </p>
        <ChangePasswordForm next={next} />
        <div className="mt-6 border-t border-line pt-4 text-center text-[13.5px] text-ink-2">
          {me.must_change_password ? (
            <form action={logout}>
              Bukan {me.name.split(" ")[0]}?{" "}
              <button className="font-semibold text-brand hover:underline">Keluar &amp; masuk dengan akun lain</button>
            </form>
          ) : (
            <Link href="/" className="font-semibold text-brand hover:underline">← Kembali ke beranda</Link>
          )}
        </div>
      </div>
    </div>
  );
}
