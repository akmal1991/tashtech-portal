import "server-only";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { getSetting } from "./settings";

const FONT_CANDIDATES = [
  process.env.PDF_FONT, process.env.PDF_FONT_BOLD ? undefined : undefined,
  "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/Library/Fonts/Arial.ttf",
].filter(Boolean) as string[];
const BOLD_CANDIDATES = [process.env.PDF_FONT_BOLD, "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"].filter(Boolean) as string[];

export type Doc = PDFKit.PDFDocument & { _tt: { regular: string; bold: string; unicode: boolean; brand: string; accent: string } };

/** Replace characters the built-in Helvetica cannot render when no Unicode TTF font is available. */
export function t(doc: Doc, s: unknown): string {
  const str = s == null ? "" : String(s);
  if (doc._tt.unicode) return str;
  return str.replace(/[ʻʼ‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[^\x00-\xFF—–•…]/g, "?");
}

export async function createDoc(opts: { title: string; subtitle?: string; landscape?: boolean }) {
  const branding = await getSetting("branding");
  const doc = new PDFDocument({ size: "A4", layout: opts.landscape ? "landscape" : "portrait", margins: { top: 50, bottom: 55, left: 45, right: 45 }, bufferPages: true, info: { Title: opts.title, Author: branding.name } }) as Doc;
  const regular = FONT_CANDIDATES.find((f) => existsSync(f));
  const bold = BOLD_CANDIDATES.find((f) => existsSync(f));
  if (regular) doc.registerFont("R", regular);
  if (regular && bold) doc.registerFont("B", bold);
  doc._tt = { regular: regular ? "R" : "Helvetica", bold: regular && bold ? "B" : regular ? "R" : "Helvetica-Bold", unicode: !!regular, brand: branding.primaryColor, accent: branding.accentColor };

  // Header
  const top = doc.page.margins.top - 20;
  let x = doc.page.margins.left;
  const logo = branding.logoDataUrl?.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (logo) { try { doc.image(Buffer.from(logo[2], "base64"), x, top, { fit: [42, 42] }); x += 52; } catch { /* ignore bad logo */ } }
  else {
    doc.save().roundedRect(x, top, 40, 40, 6).fill(branding.primaryColor);
    doc.fillColor("#fff").font(doc._tt.bold).fontSize(14).text(t(doc, branding.shortName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()), x, top + 13, { width: 40, align: "center" });
    doc.restore(); x += 52;
  }
  doc.fillColor(branding.primaryColor).font(doc._tt.bold).fontSize(13).text(t(doc, branding.name), x, top + 2);
  doc.fillColor("#555").font(doc._tt.regular).fontSize(9).text(t(doc, branding.tagline), x, top + 20);
  const right = doc.page.width - doc.page.margins.right;
  doc.moveTo(doc.page.margins.left, top + 50).lineTo(right, top + 50).lineWidth(1.5).strokeColor(branding.accentColor).stroke();
  doc.y = top + 62;
  doc.x = doc.page.margins.left;
  doc.fillColor("#111").font(doc._tt.bold).fontSize(16).text(t(doc, opts.title), { align: "left" });
  if (opts.subtitle) doc.fillColor("#555").font(doc._tt.regular).fontSize(10).text(t(doc, opts.subtitle));
  doc.moveDown(0.6);
  return doc;
}

export function keyValues(doc: Doc, pairs: [string, unknown][], cols = 2) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const colW = width / cols;
  const startY = doc.y;
  let maxY = startY;
  pairs.forEach(([k, v], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const y = startY + row * 28;
    doc.fillColor("#777").font(doc._tt.regular).fontSize(7.5).text(t(doc, k.toUpperCase()), left + col * colW, y, { width: colW - 10 });
    doc.fillColor("#111").font(doc._tt.bold).fontSize(10).text(t(doc, v ?? "—") || "—", left + col * colW, y + 10, { width: colW - 10, ellipsis: true, lineBreak: false });
    maxY = Math.max(maxY, y + 26);
  });
  doc.x = left; doc.y = maxY + 6;
}

export function heading(doc: Doc, text: string) {
  ensureSpace(doc, 50);
  doc.moveDown(0.4);
  doc.x = doc.page.margins.left;
  doc.fillColor(doc._tt.brand).font(doc._tt.bold).fontSize(11.5).text(t(doc, text));
  doc.moveDown(0.25);
}

export function ensureSpace(doc: Doc, h: number) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

export type TCol = { header: string; width: number; align?: "left" | "right" | "center" };

export function table(doc: Doc, cols: TCol[], rows: (string | number | null | undefined)[][], opts: { fontSize?: number; highlight?: (row: number) => string | null } = {}) {
  const fs = opts.fontSize ?? 8.5;
  const left = doc.page.margins.left;
  const total = cols.reduce((s, c) => s + c.width, 0);
  const avail = doc.page.width - left - doc.page.margins.right;
  const scale = avail / total;
  const widths = cols.map((c) => c.width * scale);
  const rowH = fs + 8;
  const drawHeader = () => {
    let x = left;
    const y = doc.y;
    doc.save().rect(left, y, avail, rowH + 2).fill(doc._tt.brand).restore();
    doc.fillColor("#fff").font(doc._tt.bold).fontSize(fs);
    cols.forEach((c, i) => { doc.text(t(doc, c.header), x + 4, y + 5, { width: widths[i] - 8, align: c.align ?? "left", lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.y = y + rowH + 2;
  };
  drawHeader();
  rows.forEach((r, ri) => {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); drawHeader(); }
    const hl = opts.highlight?.(ri);
    if (hl || ri % 2 === 1) doc.save().rect(left, doc.y, avail, rowH).fill(hl ?? "#f3f6fa").restore();
    let x = left;
    doc.fillColor("#111").font(doc._tt.regular).fontSize(fs);
    const y = doc.y;
    r.forEach((v, i) => { doc.text(t(doc, v ?? "—"), x + 4, y + 4, { width: widths[i] - 8, align: cols[i].align ?? "left", lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.y = y + rowH;
  });
  doc.x = left;
  doc.moveDown(0.5);
}

export function signatures(doc: Doc, labels: string[]) {
  ensureSpace(doc, 80);
  doc.moveDown(2);
  const left = doc.page.margins.left;
  const avail = doc.page.width - left - doc.page.margins.right;
  const w = avail / labels.length;
  const y = doc.y + 20;
  labels.forEach((l, i) => {
    doc.moveTo(left + i * w + 10, y).lineTo(left + (i + 1) * w - 20, y).lineWidth(0.6).strokeColor("#888").stroke();
    doc.fillColor("#555").font(doc._tt.regular).fontSize(8.5).text(t(doc, l), left + i * w + 10, y + 4, { width: w - 30 });
  });
  doc.y = y + 30; doc.x = left;
}

export function finish(doc: Doc, footerNote: string): Promise<Buffer> {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 38;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor("#888").font(doc._tt.regular).fontSize(7.5)
      .text(t(doc, `${footerNote} · Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Tashkent" })} (Tashkent)`), doc.page.margins.left, y, { lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.margins.left, y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "right" });
    doc.page.margins.bottom = bottom;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function pdfResponse(buf: Buffer, filename: string, inline = true) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"` },
  });
}
