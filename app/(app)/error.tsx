"use client";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-16 max-w-md p-6 text-center">
      <h2 className="text-lg font-bold">Halaman ini gagal dimuat</h2>
      <p className="mt-2 text-ink-2">Coba muat ulang. Jika terus terjadi, beri tahu admin LDMS.</p>
      <button className="btn btn-primary mt-5" onClick={reset}>Muat ulang</button>
    </div>
  );
}
