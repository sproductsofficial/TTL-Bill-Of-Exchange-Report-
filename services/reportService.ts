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
  }
  
  // Small delay to prevent browser from blocking the second download
  await new Promise(resolve => setTimeout(resolve, 800));

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
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  await registerPDFFonts(doc);
  const fontName = getActiveFontName();

  doc.setTextColor(0, 0, 0);

  const marginX = 10;
  const topMargin = 10;
  const headerSectionHeight = 45; 
  const tableStartY = topMargin + headerSectionHeight;
  
  const signatureBlockHeight = 15;
  const bottomMargin = 10;
  const fixedSignatureGap = 20; 

  const signatureLineY = pageHeight - bottomMargin - signatureBlockHeight;
  const tableMaxEndY = signatureLineY - fixedSignatureGap - 10; 
  const availableTableHeight = tableMaxEndY - tableStartY;

  const totalRows = items.length + 2; 
  let targetRowHeight = availableTableHeight / totalRows;
  const finalRowHeight = Math.max(4.5, Math.min(12, targetRowHeight));

  const minFontSize = 6;
  const maxFontSize = 10;
  const fontSize = minFontSize + (finalRowHeight - 4.5) * ((maxFontSize - minFontSize) / (12 - 4.5));
  const cellPadding = Math.max(0.5, finalRowHeight * 0.15);

  // --- Header Text ---
  doc.setFont(fontName, 'bold');
  doc.setFontSize(20);
  doc.text("Tusuka Trousers Ltd.", pageWidth / 2, topMargin, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont(fontName, 'normal');
  doc.text("Neelngar, Konabari, Gazipur", pageWidth / 2, topMargin + 7, { align: 'center' });

  doc.setFontSize(15);
  doc.setFont(fontName, 'bold');
  doc.text("Bill Of Exchange Report", pageWidth / 2, topMargin + 15, { align: 'center' });

  const infoY = topMargin + 22;
  const infoLineStep = 5.5;
  doc.setFontSize(9);
  
  const drawInfo = (label: string, value: string, x: number, y: number) => {
    doc.setFont(fontName, 'bold'); 
    doc.text(label, x, y);
    doc.setFont(fontName, 'normal'); 
    doc.text(value || '', x + 30, y);
  };

  drawInfo("Buyer Name :", header.buyerName, marginX, infoY);
  drawInfo("Supplier Name:", header.supplierName, marginX, infoY + infoLineStep);
  drawInfo("File No :", header.fileNo, marginX, infoY + infoLineStep * 2);
  drawInfo("Invoice No :", header.invoiceNo, marginX, infoY + infoLineStep * 3);
  drawInfo("L/C Number :", header.lcNumber, marginX, infoY + infoLineStep * 4);

  const rightColX = pageWidth - 85;
  drawInfo("Invoice Date:", formatDateForReport(header.invoiceDate), rightColX, infoY);
  drawInfo("Billing Date:", formatDateForReport(header.billingDate), rightColX, infoY + infoLineStep);

  // --- Table Data ---
  const tableColumn = [
    "Fabric Code", "Item Description", "Rcvd Date", "Challan No", 
    "Pi Number", "Unit", "Invoice Qty", "Rcvd Qty", "Unit Price ($)", "Total Value ($)", "Appstreme No"
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

  tableRows.push(["", "", "", "", "", "TOTAL", `${Math.round(totals.totalInvoiceQty).toLocaleString()}`, `${Math.round(totals.totalRcvdQty).toLocaleString()}`, "", `$ ${totals.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]);

  // --- Main Table Configuration ---
  autoTable(doc, {
    startY: tableStartY,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: fontSize,
      textColor: [0, 0, 0], 
      cellPadding: cellPadding,
      minCellHeight: finalRowHeight,
      valign: 'middle',
      halign: 'center',
      lineColor: [0, 0, 0], 
      lineWidth: 0.1,
      // CHANGE 1: Set overflow to linebreak to wrap text
      overflow: 'linebreak', 
      cellWidth: 'auto',
    },
    headStyles: { 
      fillColor: [245, 245, 245], 
      textColor: [0, 0, 0], 
      fontStyle: 'bold' 
    },
    columnStyles: {
      // CHANGE 2: Define specific widths for long text columns to force wrapping
      0: { cellWidth: 25 }, // Fabric Code
      1: { cellWidth: 45, halign: 'left' }, // Item Description (Longest text)
      3: { cellWidth: 20 }, // Challan No
      4: { cellWidth: 20 }, // PI Number
      9: { fontStyle: 'bold', cellWidth: 25 }, // Total Value
      10: { cellWidth: 20 } // Appstreme No
    },
    didParseCell: (data) => {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: marginX, right: marginX },
    // This handles page breaks if the wrapped text makes the table too long
    pageBreak: 'auto', 
  });

  // --- Footer / In Words Section ---
  const finalTableInfo = (doc as any).lastAutoTable;
  if (finalTableInfo) {
    const finalTableY = finalTableInfo.finalY || tableStartY + 20;
    const unitCol = finalTableInfo.columns[5];
    const appstremeCol = finalTableInfo.columns[10];
    const unitColumnX = (unitCol && !isNaN(unitCol.x)) ? unitCol.x : marginX + 100; 
    const tableEndX = (appstremeCol && !isNaN(appstremeCol.x) && !isNaN(appstremeCol.width)) 
      ? (appstremeCol.x + appstremeCol.width) 
      : (pageWidth - marginX);
    
    const wordsY = finalTableY + 8;
    const wordsText = `In Words: ${numberToWords(totals.totalValue)}`;

    doc.setFont(fontName, 'bold');
    doc.setFontSize(10);
    
    if (typeof wordsText === 'string' && !isNaN(unitColumnX)) {
      const wrapWidth = tableEndX - unitColumnX;
      doc.text(wordsText, unitColumnX, wordsY, {
        maxWidth: wrapWidth > 10 ? wrapWidth : 120,
        align: 'left'
      });
    }
  }

  // --- Signature Section ---
  doc.setLineWidth(0.2);
  doc.setFontSize(9);
  if (!isNaN(signatureLineY)) {
    doc.line(marginX + 5, signatureLineY, marginX + 65, signatureLineY);
    doc.text("Prepared By", marginX + 20, signatureLineY + 5);
    doc.line(pageWidth - marginX - 65, signatureLineY, pageWidth - marginX - 5, signatureLineY);
    doc.text("Store In-Charge", pageWidth - marginX - 52, signatureLineY + 5);
  }

  doc.save(`${filename}.pdf`);
};

const generateExcel = async (header: ReportHeader, items: LineItem[], totals: Totals, filename: string) => {
  // Use the default export to instantiate Workbook
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
      "Fabric Code", "Item Description", "Rcvd Date", "Challan No", "Pi Number", 
      "Unit", "Invoice Qty", "Rcvd Qty", "Unit Price $", "Total Value", "Appstreme No.\n(Receipt no)"
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