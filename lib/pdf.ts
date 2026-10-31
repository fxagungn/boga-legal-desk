// Tiny PDF writer (Helvetica, A4, wrapped text). Used for demo contract drafts.
const W = 595, H = 842, M = 64;

function esc(s: string) {
  return s.replace(/[^\x20-\x7e]/g, "-").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, size: number, width: number): string[] {
  const max = Math.floor(width / (size * 0.5));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      if ((line + " " + w).trim().length > max) { out.push(line.trim()); line = w; } else line += " " + w;
    }
    out.push(line.trim());
  }
  return out;
}

export function makePdf(blocks: { text: string; size?: number; bold?: boolean; gap?: number }[]): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = H - M;
  for (const b of blocks) {
    const size = b.size ?? 10.5;
    const lead = size * 1.45;
    y -= b.gap ?? 0;
    for (const l of wrap(b.text, size, W - 2 * M)) {
      if (y < M) { pages.push(ops.join("\n")); ops = []; y = H - M; }
      ops.push(`BT /${b.bold ? "F2" : "F1"} ${size} Tf ${M} ${y.toFixed(1)} Td (${esc(l)}) Tj ET`);
      y -= lead;
    }
  }
  pages.push(ops.join("\n"));

  const objs: string[] = [];
  const add = (s: string) => (objs.push(s), objs.length);
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const kids: number[] = [];
  for (const content of pages) {
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

export function demoContract(d: { code: string; title: string; counterparty: string | null; summary: string | null; points: string[] }) {
  const clauses = [
    ["Pasal 1 - Ruang Lingkup", d.summary ?? "Ruang lingkup kerja sama sebagaimana disepakati para pihak."],
    ["Pasal 2 - Jangka Waktu", "Perjanjian ini berlaku selama 12 (dua belas) bulan sejak tanggal penandatanganan dan dapat diperpanjang atas kesepakatan tertulis para pihak."],
    ["Pasal 3 - Harga dan Pembayaran", "Pembayaran dilakukan paling lambat 30 (tiga puluh) hari kalender setelah invoice lengkap diterima oleh Pihak Pertama."],
    ["Pasal 4 - Kerahasiaan", "Para pihak wajib menjaga kerahasiaan seluruh informasi yang diperoleh selama pelaksanaan perjanjian, termasuk setelah perjanjian berakhir."],
    ["Pasal 5 - Pengakhiran", "Masing-masing pihak dapat mengakhiri perjanjian dengan pemberitahuan tertulis 30 (tiga puluh) hari sebelumnya apabila pihak lain melakukan wanprestasi."],
    ["Pasal 6 - Penyelesaian Sengketa", "Sengketa diselesaikan secara musyawarah; apabila tidak tercapai, melalui Pengadilan Negeri Jakarta Selatan."],
  ];
  return makePdf([
    { text: "DRAFT - UNTUK REVIEW TIM LEGAL", size: 9, bold: true },
    { text: d.title.toUpperCase(), size: 15, bold: true, gap: 14 },
    { text: `Nomor referensi: ${d.code}`, size: 9.5, gap: 2 },
    { text: `Antara PT Boga Group ("Pihak Pertama") dan ${d.counterparty ?? "Pihak Kedua"} ("Pihak Kedua").`, gap: 16 },
    ...clauses.flatMap(([h, t]) => [{ text: h, bold: true, size: 11, gap: 12 }, { text: t, gap: 2 }]),
    ...(d.points.length ? [{ text: "Catatan untuk reviewer", bold: true, size: 11, gap: 16 }, ...d.points.map((p) => ({ text: `- ${p}`, gap: 2 }))] : []),
  ]);
}
