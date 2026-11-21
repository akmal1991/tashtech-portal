import "server-only";
import ExcelJS from "exceljs";

export type SheetData = { headers: string[]; rows: { rowNumber: number; values: Record<string, string> }[] };

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

export async function readSheet(buf: ArrayBuffer): Promise<SheetData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { headers[col - 1] = cellText(c.value); });
  const rows: SheetData["rows"] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const t = cellText(row.getCell(i + 1).value);
      if (t !== "") any = true;
      values[h] = t;
    });
    if (any) rows.push({ rowNumber, values });
  });
  return { headers: headers.filter(Boolean), rows };
}

export type Column = { header: string; key: string; width?: number; numFmt?: string };

export async function buildWorkbook(sheets: { name: string; columns: Column[]; rows: Record<string, unknown>[]; title?: string }[], brandColor = "0B4F8A") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tashkent Tech Academic Records Portal";
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    ws.columns = sh.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(10, Math.min(40, c.header.length + 4)), style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    ws.addRows(sh.rows);
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + brandColor.replace("#", "") } };
    head.alignment = { vertical: "middle" };
    head.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
    ws.eachRow((r, i) => { if (i > 1 && i % 2 === 0) r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } }; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
