export type CellValue = string | number | boolean | Date | null;

export interface DataTable {
  columns: string[];
  rows: Record<string, CellValue>[];
  sourceName: string;
  sheetName?: string;
}

export interface ParsedWorkbook {
  fileName: string;
  displayName: string;
  description: string;
  fileSize: number;
  fileType: 'csv' | 'xlsx';
  sheets: DataTable[];
  selectedSheetIndex: number;
}

export interface KeyColumnPair {
  original: string;
  new: string;
}

export interface ComparedColumnPair {
  original: string;
  new: string;
}

export interface ComparisonOptions {
  trimWhitespace: boolean;
  caseInsensitive: boolean;
  blankEqualsNull: boolean;
  numericTextEqualsNumber: boolean;
}

export interface ComparisonConfig {
  keyColumns: KeyColumnPair[];
  comparedColumns: ComparedColumnPair[];
  options: ComparisonOptions;
}

export interface ComparisonSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface FieldChange {
  field: string;
  originalColumn: string;
  newColumn: string;
  originalValue: CellValue;
  newValue: CellValue;
}

export interface ChangedRow {
  key: Record<string, CellValue>;
  keyLabel: string;
  originalRow: Record<string, CellValue>;
  newRow: Record<string, CellValue>;
  changes: FieldChange[];
}

export interface DuplicateKeyWarning {
  side: 'original' | 'new';
  key: string;
  count: number;
}

export type ReconciliationStatus = 'Same' | 'Different' | 'Missing in new' | 'Only in new';

export interface ReconciliationEntry {
  key: Record<string, CellValue>;
  keyLabel: string;
  status: ReconciliationStatus;
  originalRow?: Record<string, CellValue>;
  newRow?: Record<string, CellValue>;
  changes: FieldChange[];
}

export interface ComparisonResult {
  added: Record<string, CellValue>[];
  removed: Record<string, CellValue>[];
  changed: ChangedRow[];
  unchanged: Record<string, CellValue>[];
  reconciliation: ReconciliationEntry[];
  summary: ComparisonSummary;
  duplicateKeys: DuplicateKeyWarning[];
  comparedAt: string;
}

export interface EnrichmentConfig {
  keyColumns: KeyColumnPair[];
  addedColumns: string[];
}

export interface EnrichmentResult {
  rows: Record<string, CellValue>[];
  columns: string[];
  matchedRows: number;
  unmatchedRows: number;
  addedColumns: string[];
  duplicateKeys: DuplicateKeyWarning[];
  builtAt: string;
}
