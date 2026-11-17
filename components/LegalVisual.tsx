/**
 * Decorative, slowly moving legal motif: seal rings that turn, document sheets that float,
 * a balance scale that sways, and dashed lines flowing between them. Pure SVG + CSS (globals.css `lv-*`);
 * static when the user prefers reduced motion.
 */
export function LegalVisual({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  const line = dark ? "rgb(255 255 255 / 0.22)" : "rgb(29 78 216 / 0.16)";
  const lineStrong = dark ? "rgb(255 255 255 / 0.4)" : "rgb(29 78 216 / 0.32)";
  const sheet = dark ? "rgb(255 255 255 / 0.07)" : "#ffffff";
  const sheetStroke = dark ? "rgb(255 255 255 / 0.22)" : "rgb(29 78 216 / 0.18)";
  const text = dark ? "rgb(255 255 255 / 0.28)" : "rgb(29 78 216 / 0.16)";
  const accent = dark ? "#93c5fd" : "#1d4ed8";

  const Doc = ({ x, y, w = 120, h = 156, cls, seal = false }: { x: number; y: number; w?: number; h?: number; cls: string; seal?: boolean }) => (
    <g className={cls}>
      <g transform={`translate(${x} ${y})`}>
        <rect width={w} height={h} rx="12" fill={sheet} stroke={sheetStroke} />
        <rect x="16" y="20" width={w * 0.45} height="7" rx="3.5" fill={accent} opacity={dark ? 0.55 : 0.35} />
        {[40, 54, 68, 82, 96].map((ly, i) => <rect key={ly} x="16" y={ly} width={w - 32 - (i % 2) * 22} height="5" rx="2.5" fill={text} />)}
        {seal ? (
          <g transform={`translate(${w - 34} ${h - 34})`}>
            <circle r="15" fill="none" stroke={accent} strokeOpacity=".5" strokeWidth="1.5" />
            <circle r="10" fill="none" stroke={accent} strokeOpacity=".35" strokeDasharray="2 2" />
            <path d="M-5 0l3.5 3.5L5.5-4" fill="none" stroke={accent} strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : (
          <rect x="16" y={h - 30} width="42" height="6" rx="3" fill={text} />
        )}
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={`lv pointer-events-none ${className}`}>
      <defs>
        <radialGradient id={`lv-glow-${tone}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={dark ? "#3b82f6" : "#60a5fa"} stopOpacity={dark ? 0.35 : 0.18} />
          <stop offset="1" stopColor={dark ? "#3b82f6" : "#60a5fa"} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="lv-pulse" cx="600" cy="300" r="300" fill={`url(#lv-glow-${tone})`} />

      {/* seal rings around the centre */}
      <g className="lv-spin" style={{ transformOrigin: "600px 300px" }}>
        <circle cx="600" cy="300" r="230" fill="none" stroke={line} strokeDasharray="2 10" strokeLinecap="round" strokeWidth="2" />
        <circle cx="830" cy="300" r="5" fill={accent} opacity=".55" />
        <circle cx="370" cy="300" r="3.5" fill={accent} opacity=".4" />
      </g>
      <g className="lv-spin-rev" style={{ transformOrigin: "600px 300px" }}>
        <circle cx="600" cy="300" r="300" fill="none" stroke={line} />
        <circle cx="600" cy="0" r="4" fill={accent} opacity=".5" />
        <circle cx="600" cy="600" r="3" fill={accent} opacity=".35" />
      </g>
      <circle cx="600" cy="300" r="370" fill="none" stroke={line} strokeDasharray="1 14" strokeLinecap="round" strokeWidth="2" />

      {/* flowing connections between documents */}
      <path className="lv-flow" d="M250 250 C 380 180, 470 210, 600 300" fill="none" stroke={lineStrong} strokeWidth="1.5" strokeDasharray="6 10" />
      <path className="lv-flow lv-flow-2" d="M950 360 C 830 420, 720 390, 600 300" fill="none" stroke={lineStrong} strokeWidth="1.5" strokeDasharray="6 10" />
      <path className="lv-flow lv-flow-3" d="M240 470 C 360 470, 470 400, 600 300" fill="none" stroke={line} strokeWidth="1.5" strokeDasharray="4 12" />

      {/* documents */}
      <Doc x={120} y={150} cls="lv-float" seal />
      <Doc x={185} y={380} w={104} h={132} cls="lv-float lv-float-2" />
      <Doc x={940} y={110} w={108} h={140} cls="lv-float lv-float-3" />
      <Doc x={960} y={340} cls="lv-float lv-float-2" seal />

      {/* balance scale, top right */}
      <g transform="translate(1080 470)" opacity={dark ? 0.75 : 0.6}>
        <path d="M0 -56v80M-24 26h48" stroke={lineStrong} strokeWidth="3" strokeLinecap="round" />
        <circle cy="-60" r="5" fill={accent} opacity=".7" />
        <g className="lv-sway">
          <path d="M-52 -40h104" stroke={lineStrong} strokeWidth="3" strokeLinecap="round" />
          <path d="M-46 -38l-14 34h28zM46 -38l-14 34h28z" fill="none" stroke={lineStrong} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M-62 -4a16 16 0 0 0 32 0zM30 -4a16 16 0 0 0 32 0z" fill={accent} opacity=".3" />
        </g>
      </g>
    </svg>
  );
}
