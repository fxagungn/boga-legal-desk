/**
 * Legal Department mark: a balance scale inside a rounded seal.
 * `tone="glass"` is for dark backgrounds (login aside). `animated` lets the beam sway and the ring turn (portal only).
 */
export function BrandMark({ size = 36, tone = "solid", animated = false }: { size?: number; tone?: "solid" | "glass"; animated?: boolean }) {
  const glass = tone === "glass";
  const gid = `bm-${tone}`;
  return (
    <span
      aria-hidden="true"
      className={`brand-mark grid shrink-0 place-items-center overflow-hidden ${glass ? "bg-white/12 ring-1 ring-white/25 backdrop-blur" : "shadow-[0_6px_16px_-8px_rgb(11_31_75/0.7)]"} ${animated ? "brand-mark-anim" : ""}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} role="presentation">
        {!glass && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0b1f4b" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
        )}
        {!glass && <rect width="40" height="40" fill={`url(#${gid})`} />}
        {/* seal ring */}
        <circle className="bm-ring" cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1" strokeDasharray="2.2 2.2" />
        {/* pillar and base */}
        <path d="M20 11.2v15.6M15.2 28.6h9.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="10.6" r="1.5" fill="#fff" />
        {/* beam with pans */}
        <g className="bm-beam">
          <path d="M11.4 14.2h17.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12.6 14.4l-2.6 6.2h5.2zM27.4 14.4l-2.6 6.2h5.2z" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M9.6 20.6a3 3 0 0 0 6 0zM24.4 20.6a3 3 0 0 0 6 0z" fill="#93c5fd" />
        </g>
      </svg>
    </span>
  );
}
