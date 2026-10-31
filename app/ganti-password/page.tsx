import { redirect } from "next/navigation";
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
      </div>
    </div>
  );
}
