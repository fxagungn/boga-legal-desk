/** Boga Group mark used on the portal, login and sidebar. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center bg-gradient-to-br from-navy to-brand-deep font-extrabold tracking-[-0.5px] text-white shadow-[0_6px_16px_-8px_rgb(11_31_75/0.7)]"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), fontSize: Math.round(size * 0.38) }}
    >
      BG
    </span>
  );
}
