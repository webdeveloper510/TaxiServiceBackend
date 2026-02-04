const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

async function exportXlsx({ res, fileName, sheetName = "Sheet1", columns, cursor, rowMapper }) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: true,
  });

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Excel columns
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }));

  // Column formats (date/time, currency etc.)
  for (const c of columns) {
    if (c.numFmt) sheet.getColumn(c.key).numFmt = c.numFmt;
  }

  // Header bold
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  let aborted = false;
  res.on("close", async () => {
    aborted = true;
    try { if (cursor?.close) await cursor.close(); } catch (_) {}
  });

  for await (const doc of cursor) {
    if (aborted) break;

    const row = rowMapper(doc); // must return object with keys matching columns
    sheet.addRow(row).commit();
  }

  sheet.commit();
  await workbook.commit();
}

async function exportPdf({ res, fileName, title = "Report", cursor, columns, rowMapper }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");

  const pdf = new PDFDocument({ size: "A4", margin: 40 });
  pdf.pipe(res);

  pdf.fontSize(18).text(title, { align: "center" }).moveDown(0.5);
  pdf.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`).moveDown();

  pdf.moveTo(40, pdf.y).lineTo(555, pdf.y).stroke();
  pdf.moveDown(0.7);

  let aborted = false;
  res.on("close", async () => {
    aborted = true;
    try { if (cursor?.close) await cursor.close(); } catch (_) {}
  });

  for await (const doc of cursor) {
    if (aborted) break;

    const row = rowMapper(doc);

    // Print using same columns list (dynamic)
    pdf.fontSize(11);
    for (const c of columns) {
      const label = c.header;
      const value = row[c.key];

      // make value printable
      const printable =
        value instanceof Date
          ? value.toLocaleString()
          : value === null || value === undefined
            ? ""
            : String(value);

      pdf.text(`${label}: ${printable}`);
    }

    pdf.moveDown(0.5);
    pdf.moveTo(40, pdf.y).lineTo(555, pdf.y).stroke();
    pdf.moveDown(0.7);

    if (pdf.y > 760) pdf.addPage();
  }

  pdf.end();
}

module.exports = { exportXlsx, exportPdf };
