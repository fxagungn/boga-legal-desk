/** Shown at once when a menu is clicked, while the page's data loads. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Memuat">
      <div className="h-[62px] rounded-[14px] border border-line bg-surface" />
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line-2 px-5 py-3.5 last:border-0">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded bg-mute-bg" />
              <div className="h-3 w-1/4 rounded bg-mute-bg" />
            </div>
            <div className="h-5 w-20 rounded-md bg-mute-bg" />
          </div>
        ))}
      </div>
    </div>
  );
}
