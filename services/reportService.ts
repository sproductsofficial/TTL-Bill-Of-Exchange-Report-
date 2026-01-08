
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { ReportHeader, LineItem, Totals } from '../types';
import { getFilenameDate, numberToWords } from '../utils';
import { registerPDFFonts, getActiveFontName } from '../fonts';

// Helper to format date for report (DD-Mon-YYYY)
const formatDateForReport = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length === 3) return dateStr.replace(/\//g, '-');
  return dateStr;
};

// Helper to calculate totals
export const calculateTotals = (items: LineItem[]): Totals => {
  return items.reduce(
    (acc, item) => ({
      totalInvoiceQty: acc.totalInvoiceQty + (Number(item.invoiceQty) || 0),
      totalRcvdQty: acc.totalRcvdQty + (Number(item.rcvdQty) || 0),
      totalValue: acc.totalValue + ((Number(item.invoiceQty) || 0) * (Number(item.unitPrice) || 0)),
    }),
    { totalInvoiceQty: 0, totalRcvdQty: 0, totalValue: 0 }
  );
};

export const generateReports = async (header: ReportHeader, items: LineItem[]) => {
  const totals = calculateTotals(items);
  const totalValueStr = totals.totalValue.toFixed(2); 
  
  const filenameDate = getFilenameDate(header.billingDate);
  const baseFilename = `Bill of Buyer ${header.buyerName} $${totalValueStr} DATE-${filenameDate}`;

  // Generate PDF
  try {
    console.log("Generating PDF...");
    await generatePDF(header, items, totals, baseFilename);
  } catch (e) {
    console.error("PDF Generation failed", e);
    alert("PDF Generation Error: Check console for details.");
  }
  
  // Delay to ensure the browser processes the first download before the second
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Generate Excel
  try {
    console.log("Generating Excel...");
    await generateExcel(header, items, totals, baseFilename);
  } catch (e) {
    console.error("Excel Generation failed", e);
    alert("Excel Generation Error: " + (e instanceof Error ? e.message : "Unknown error"));
  }
};

const generatePDF = async (header: ReportHeader, items: LineItem[], totals: Totals, filename: string) => {
  // A4 Landscape is 297mm x 210mm
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  await registerPDFFonts(doc);
  const fontName = getActiveFontName();

  doc.setTextColor(0, 0, 0);

  // --- Layout Constants ---
  const marginX = 10;
  const topMargin = 8;
  const headerSectionHeight = 42; 
  const tableStartY = topMargin + headerSectionHeight;
  
  // Footer area constants
  const bottomMargin = 8;
  const signatureLineHeight = 12; // Height of the signature block
  const wordsSectionHeight = 8; // Max height for "In Words"
  const footerFixedReserve = signatureLineHeight + wordsSectionHeight + 10; // Reserve at bottom (30mm)
  
  // Calculate available space for the table to ensure it stays on one page
  const tableMaxHeight = pageHeight - tableStartY - footerFixedReserve;
  
  // Total rows including Header and Footer (Total) row
  const rowCount = items.length + 1; 
  
  // Dynamic scaling based on row count
  // We want to reduce row height and font size as count increases
  let dynamicRowHeight = tableMaxHeight / rowCount;
  
  // Clamping values for readability
  // Minimum row height allowed: 3.5mm (very tight)
  // Maximum row height allowed: 8mm (standard)
  const finalRowHeight = Math.max(3.5, Math.min(8, dynamicRowHeight));
  
  // Scale font size based on row height (roughly 1.8 ratio of mm to pt is common for jsPDF)
  // 3.5mm height -> ~6pt font
  // 8mm height -> ~10pt font
  const fontSize = Math.max(5.5, Math.min(9.5, (finalRowHeight * 1.8)));

  // --- Header Text ---
  doc.setFont(fontName, 'bold');
  doc.setFontSize(18);
  doc.text("Tusuka Trousers Ltd.", pageWidth / 2, topMargin, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont(fontName, 'normal');
  doc.text("Neelngar, Konabari, Gazipur", pageWidth / 2, topMargin + 6, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont(fontName, 'bold');
  doc.text("Bill Of Exchange Report", pageWidth / 2, topMargin + 13, { align: 'center' });

  const infoY = topMargin + 20;
  const infoLineStep = 5;
  doc.setFontSize(8.5);
  
  const drawInfo = (label: string, value: string, x: number, y: number) => {
    doc.setFont(fontName, 'bold'); 
    doc.text(label, x, y);
    doc.setFont(fontName, 'normal'); 
    doc.text(value || '', x + 28, y);
  };

  drawInfo("Buyer Name :", header.buyerName, marginX, infoY);
  drawInfo("Supplier Name:", header.supplierName, marginX, infoY + infoLineStep);
  drawInfo("File No :", header.fileNo, marginX, infoY + infoLineStep * 2);
  drawInfo("Invoice No :", header.invoiceNo, marginX, infoY + infoLineStep * 3);
  drawInfo("L/C Number :", header.lcNumber, marginX, infoY + infoLineStep * 4);

  const rightColX = pageWidth - 80;
  drawInfo("Invoice Date:", formatDateForReport(header.invoiceDate), rightColX, infoY);
  drawInfo("Billing Date:", formatDateForReport(header.billingDate), rightColX, infoY + infoLineStep);

  // --- Table Data ---
  const tableColumn = [
    "Fabric Code", "Item Description", "Received Date", "Challan No", 
    "Pi Number", "Unit", "Invoice Qty", "Received Qty", "Unit Price ($)", "Total Value ($)", "Appstreme No"
  ];

  const tableRows = items.map(item => [
    item.fabricCode,
    item.itemDescription + (item.color ? ` (${item.color})` : ""),
    formatDateForReport(item.rcvdDate),
    item.challanNo,
    item.piNumber,
    item.unit,
    `${Math.round(item.invoiceQty).toLocaleString()}`,
    `${Math.round(item.rcvdQty).toLocaleString()}`,
    `$ ${Number(item.unitPrice).toFixed(2)}`,
    `$ ${(Number(item.invoiceQty) * Number(item.unitPrice)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    item.appstremeNo
  ]);

  // Total row
  tableRows.push(["", "", "", "", "", "TOTAL", `${Math.round(totals.totalInvoiceQty).toLocaleString()}`, `${Math.round(totals.totalRcvdQty).toLocaleString()}`, "", `$ ${totals.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]);

  // --- Render Table ---
  autoTable(doc, {
    startY: tableStartY,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    pageBreak: 'avoid', // STICK TO ONE PAGE
    styles: {
      font: fontName,
      fontSize: fontSize,
      textColor: [0, 0, 0], 
      cellPadding: 0.5,
      minCellHeight: finalRowHeight,
      valign: 'middle',
      halign: 'center',
      lineColor: [0, 0, 0], 
      lineWidth: 0.05,
      overflow: 'ellipsize', 
    },
    headStyles: { 
      fillColor: [245, 245, 245], 
      textColor: [0, 0, 0], 
      fontStyle: 'bold' 
    },
    columnStyles: {
      0: { cellWidth: 28 }, 
      1: { cellWidth: 'auto', halign: 'left' }, 
      2: { cellWidth: 22 }, 
      3: { cellWidth: 20 }, 
      4: { cellWidth: 24 }, 
      5: { cellWidth: 12 }, 
      6: { cellWidth: 18 }, 
      7: { cellWidth: 18 }, 
      8: { cellWidth: 20 }, 
      9: { fontStyle: 'bold', cellWidth: 26 }, 
      10: { cellWidth: 22 } 
    },
    didParseCell: (data) => {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: marginX, right: marginX },
  });

  // --- Dynamic Footer Placement ---
  const lastTableY = (doc as any).lastAutoTable.finalY;
  
  // Anchor "In Words" slightly after the table
  const wordsY = lastTableY + 5;
  const wordsText = `In Words: ${numberToWords(totals.totalValue)}`;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(Math.max(7, fontSize - 1));
  
  // Determine wrap width for words
  const unitColX = (doc as any).lastAutoTable.columns[5].x;
  const tableWidth = pageWidth - (marginX * 2);
  const wrapWidth = pageWidth - marginX - unitColX;
  
  doc.text(wordsText, unitColX, wordsY, {
    maxWidth: Math.max(wrapWidth, 100),
    align: 'left'
  });

  // --- Signatures Anchored to Bottom ---
  // Ensuring signatures are pushed down to the very bottom of the single page
  const signatureLineY = pageHeight - bottomMargin - signatureLineHeight;
  doc.setLineWidth(0.2);
  doc.setFontSize(9);
  doc.setFont(fontName, 'normal');

  // Left Signature
  doc.line(marginX + 5, signatureLineY, marginX + 65, signatureLineY);
  doc.text("Prepared By", marginX + 20, signatureLineY + 5);

  // Right Signature
  doc.line(pageWidth - marginX - 65, signatureLineY, pageWidth - marginX - 5, signatureLineY);
  doc.text("Store In-Charge", pageWidth - marginX - 52, signatureLineY + 5);

  // Save the PDF
  doc.save(`${filename}.pdf`);
};

const generateExcel = async (header: ReportHeader, items: LineItem[], totals: Totals, filename: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bill Of Exchange Report');

  // Prepare Data
  const data: any[] = [
    ["Tusuka Trousers Ltd."],
    ["Neelngar, Konabari, Gazipur"],
    ["Bill Of Exchange Report"],
    [],
    ["Buyer Name :", header.buyerName, "", "", "", "", "", "", "", "Invoice Date :", formatDateForReport(header.invoiceDate)],
    ["Supplier Name:", header.supplierName, "", "", "", "", "", "", "", "Billing Date :", formatDateForReport(header.billingDate)],
    ["File No :", header.fileNo],
    ["Invoice No :", header.invoiceNo],
    ["L/C Number :", header.lcNumber],
    [],
    [
      "Fabric Code", "Item Description", "Received Date", "Challan No", "Pi Number", 
      "Unit", "Invoice Qty", "Received Qty", "Unit Price $", "Total Value", "Appstreme No.\n(Receipt no)"
    ]
  ];

  items.forEach(item => {
    const invoiceQty = Number(item.invoiceQty) || 0;
    const rcvdQty = Number(item.rcvdQty) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const totalVal = invoiceQty * unitPrice;

    let description = item.itemDescription || '';
    if (item.color) description += ` (${item.color})`;
    if (item.hsCode) description += ` (HS: ${item.hsCode})`;

    data.push([
      item.fabricCode,
      description,
      formatDateForReport(item.rcvdDate),
      item.challanNo,
      item.piNumber,
      item.unit,
      Math.round(invoiceQty),
      Math.round(rcvdQty),
      unitPrice,
      totalVal,
      item.appstremeNo
    ]);
  });

  const totalRowIndex = data.length + 1;
  data.push([
    "", "", "", "", "Total:", "YDS",
    Math.round(totals.totalInvoiceQty),
    Math.round(totals.totalRcvdQty),
    "",
    totals.totalValue,
    ""
  ]);

  const inWordsRowIndex = data.length + 1;
  data.push(["", "", "", "", `In Words: ${numberToWords(totals.totalValue)}`, "", "", "", "", "", ""]);

  data.push([], [], [], [], []); // Spacers

  const signatureRowIndex = data.length + 1;
  data.push(["Prepared By", "", "", "", "", "", "", "", "", "Store In-Charge", ""]);

  data.forEach((rowData) => {
    worksheet.addRow(rowData);
  });

  worksheet.columns = [
    { width: 14 }, { width: 35 }, { width: 13 }, { width: 15 }, { width: 15 }, 
    { width: 8 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 16 }
  ];

  const thinBorder = {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const }
  };
  const topBorderOnly = { top: { style: 'thin' as const } };

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      if (rowNumber === 1) {
        cell.font = { bold: true, size: 20 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (rowNumber === 2) {
        cell.font = { size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (rowNumber === 3) {
        cell.font = { bold: true, size: 14 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (rowNumber >= 5 && rowNumber <= 9) {
        if (colNumber === 1 || colNumber === 10) {
          cell.font = { bold: true, size: 10 };
        } else {
          cell.font = { size: 10 };
        }
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (rowNumber === 11) {
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      } else if (rowNumber > 11 && rowNumber < totalRowIndex) {
        cell.font = { size: 10 };
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (colNumber === 2 || colNumber === 11) cell.alignment.horizontal = 'left';
        if (colNumber >= 7 && colNumber <= 10) {
          cell.alignment.horizontal = 'right';
          if (colNumber >= 9) cell.numFmt = '#,##0.00';
          else cell.numFmt = '#,##0';
        }
      } else if (rowNumber === totalRowIndex) {
        cell.font = { bold: true, size: 10 };
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colNumber === 5) cell.alignment.horizontal = 'right';
        if (colNumber >= 7 && colNumber <= 10) {
          cell.alignment.horizontal = 'right';
          if (colNumber >= 9) cell.numFmt = '#,##0.00';
          else cell.numFmt = '#,##0';
        }
      } else if (rowNumber === inWordsRowIndex) {
        if (colNumber === 5) {
          cell.font = { bold: true, size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      } else if (rowNumber === signatureRowIndex) {
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'top' };
        if (colNumber === 1 || colNumber === 10) cell.border = topBorderOnly;
      }
    });
  });

  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 18;
  worksheet.getRow(3).height = 22;
  worksheet.getRow(11).height = 25;
  
  worksheet.mergeCells('A1:K1');
  worksheet.mergeCells('A2:K2');
  worksheet.mergeCells('A3:K3');
  worksheet.mergeCells(`E${inWordsRowIndex}:K${inWordsRowIndex}`);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
