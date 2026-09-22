import type { PDFPage } from "pdf-lib";
import type { SchoolAdminClassRow } from "@/lib/school/loadSchoolAdminFastTabs";

export async function generateClassesReportPdf(rowsToExport: SchoolAdminClassRow[]) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 40;
  const topMargin = 44;
  const bottomMargin = 40;
  const titleSize = 18;
  const metaSize = 10;
  const headerSize = 10;
  const cellSize = 10;
  const rowHeight = 22;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const columns = [
    { header: "CLASS NAME", width: 220, key: "name" as const },
    { header: "SECTION", width: 120, key: "section" as const },
    { header: "STUDENTS", width: 90, key: "students" as const },
    { header: "CLASS TEACHER", width: 190, key: "teacher" as const },
    { header: "EMAIL", width: 170, key: "subject" as const },
  ];

  const truncateText = (value: string, maxWidth: number, useBold = false) => {
    const currentFont = useBold ? boldFont : font;
    let text = value ?? "";
    while (
      text.length > 0 &&
      currentFont.widthOfTextAtSize(text, cellSize) > maxWidth
    ) {
      text = `${text.slice(0, -1)}`;
    }
    if (text !== value) {
      const dots = "...";
      while (
        text.length > 0 &&
        currentFont.widthOfTextAtSize(`${text}${dots}`, cellSize) > maxWidth
      ) {
        text = `${text.slice(0, -1)}`;
      }
      return `${text}${dots}`;
    }
    return text;
  };

  const drawHeaderRow = (page: PDFPage, y: number) => {
    let x = marginX;
    page.drawLine({
      start: { x: marginX, y: y + 5 },
      end: { x: pageWidth - marginX, y: y + 5 },
      thickness: 1,
      color: rgb(0.82, 0.82, 0.82),
    });
    columns.forEach((column) => {
      page.drawText(column.header, {
        x: x + 2,
        y,
        size: headerSize,
        font: boldFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      x += column.width;
    });
    page.drawLine({
      start: { x: marginX, y: y - 6 },
      end: { x: pageWidth - marginX, y: y - 6 },
      thickness: 1,
      color: rgb(0.82, 0.82, 0.82),
    });
  };

  const makePage = () => {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawText("Classes Report", {
      x: marginX,
      y: pageHeight - topMargin,
      size: titleSize,
      font: boldFont,
      color: rgb(0.05, 0.05, 0.05),
    });
    page.drawText(
      `Generated on ${new Date().toLocaleString()} | Total Classes: ${rowsToExport.length}`,
      {
        x: marginX,
        y: pageHeight - topMargin - 16,
        size: metaSize,
        font,
        color: rgb(0.35, 0.35, 0.35),
      }
    );
    const startY = pageHeight - topMargin - 40;
    drawHeaderRow(page, startY);
    return { page, y: startY - 18 };
  };

  let { page, y } = makePage();

  rowsToExport.forEach((row) => {
    if (y < bottomMargin + rowHeight) {
      const next = makePage();
      page = next.page;
      y = next.y;
    }

    let x = marginX;
    const values = [
      row.name,
      row.section,
      String(row.students),
      row.teacher,
      row.subject || "-",
    ];

    values.forEach((value, idx) => {
      page.drawText(truncateText(String(value ?? ""), columns[idx].width - 6), {
        x: x + 2,
        y,
        size: cellSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      x += columns[idx].width;
    });

    page.drawLine({
      start: { x: marginX, y: y - 6 },
      end: { x: pageWidth - marginX, y: y - 6 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
    y -= rowHeight;
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([Uint8Array.from(pdfBytes)], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `classes-report-${date}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
