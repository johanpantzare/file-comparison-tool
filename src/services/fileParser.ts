import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { CellValue, DataTable, ParsedWorkbook } from '../types';
import { ensureUniqueHeaders, normalizeHeader } from '../utils/format';

const supportedExtensions = ['csv', 'xlsx'];

export async function parseFile(file: File): Promise<ParsedWorkbook> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (!extension || !supportedExtensions.includes(extension)) {
    throw new Error('Use a CSV or XLSX file.');
  }

  if (file.size === 0) {
    throw new Error('This file is empty.');
  }

  if (extension === 'csv') {
    const table = await parseCsv(file);
    return {
      fileName: file.name,
      displayName: defaultDisplayName(file.name),
      description: '',
      fileSize: file.size,
      fileType: 'csv',
      sheets: [table],
      selectedSheetIndex: 0,
    };
  }

  const sheets = await parseXlsx(file);
  return {
    fileName: file.name,
    displayName: defaultDisplayName(file.name),
    description: '',
    fileSize: file.size,
    fileType: 'xlsx',
    sheets,
    selectedSheetIndex: 0,
  };
}

function defaultDisplayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || fileName;
}

async function parseCsv(file: File): Promise<DataTable> {
  const text = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          reject(new Error('The CSV file could not be read cleanly.'));
          return;
        }
        try {
          resolve(rowsToDataTable(result.data, file.name));
        } catch (error) {
          reject(error);
        }
      },
      error: () => reject(new Error('The CSV file could not be read.')),
    });
  });
}

async function parseXlsx(file: File): Promise<DataTable[]> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    throw new Error('The workbook could not be read.');
  }

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    return rowsToDataTable(rows, file.name, sheetName);
  }).filter((sheet) => sheet.columns.length > 0);

  if (sheets.length === 0) {
    throw new Error('No usable worksheets were found.');
  }

  return sheets;
}

function rowsToDataTable(rawRows: unknown[][], sourceName: string, sheetName?: string): DataTable {
  const meaningfulRows = rawRows.filter((row) =>
    row.some((value) => String(value ?? '').trim() !== ''),
  );

  if (meaningfulRows.length === 0) {
    throw new Error('No usable rows were found.');
  }

  const headers = ensureUniqueHeaders(meaningfulRows[0].map(normalizeHeader));

  if (headers.every((header) => header.startsWith('Column '))) {
    throw new Error('The file needs a header row.');
  }

  const rows = meaningfulRows.slice(1).map((row) => {
    const record: Record<string, CellValue> = {};
    headers.forEach((header, index) => {
      record[header] = toCellValue(row[index]);
    });
    return record;
  });

  if (rows.length === 0) {
    throw new Error('The file has headers but no data rows.');
  }

  return {
    columns: headers,
    rows,
    sourceName,
    sheetName,
  };
}

function toCellValue(value: unknown): CellValue {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}
