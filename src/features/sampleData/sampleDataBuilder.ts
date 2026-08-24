import * as XLSX from 'xlsx';
import type { CellValue } from '../../types';

export type SampleColumnType = 'id' | 'person' | 'email' | 'department' | 'country' | 'status' | 'date' | 'number' | 'currency' | 'text';

export interface SampleColumnDefinition {
  id: string;
  name: string;
  type: SampleColumnType;
}

export interface SampleBuilderConfig {
  rows: number;
  columns: SampleColumnDefinition[];
  changedRows: number;
  addedRows: number;
  removedRows: number;
  blankCellsPercent: number;
  casingDifferences: boolean;
  whitespaceDifferences: boolean;
  numericTextDifferences: boolean;
}

export interface GeneratedSampleFiles {
  originalFile: File;
  newFile: File;
}

const names = [
  'Maya Lindholm',
  'Rami Saleh',
  'Clara Benton',
  'Jonas Keller',
  'Nora Feldt',
  'Samir Haddad',
  'Elena Novak',
  'Victor Hayes',
  'Amina Rahman',
  'Lucas Moreno',
  'Anika Weber',
  'Daniel Brooks',
];

const departments = ['Service', 'Parts', 'Sales', 'Training', 'Warranty', 'Rental', 'Support'];
const countries = ['Sweden', 'Germany', 'France', 'UAE', 'Canada', 'Brazil', 'South Africa', 'Japan'];
const statuses = ['Completed', 'In progress', 'Not started', 'Overdue', 'Waived'];
const textValues = ['Intro course', 'Safety briefing', 'Field assessment', 'Product update', 'Workshop lab'];

export const sampleColumnTypes: { value: SampleColumnType; label: string }[] = [
  { value: 'id', label: 'ID / key' },
  { value: 'person', label: 'Person name' },
  { value: 'email', label: 'Email' },
  { value: 'department', label: 'Department' },
  { value: 'country', label: 'Country' },
  { value: 'status', label: 'Status' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'text', label: 'Text' },
];

export const defaultSampleBuilderConfig: SampleBuilderConfig = {
  rows: 50,
  columns: [
    { id: 'record-id', name: 'Record ID', type: 'id' },
    { id: 'name', name: 'Name', type: 'person' },
    { id: 'email', name: 'Email', type: 'email' },
    { id: 'department', name: 'Department', type: 'department' },
    { id: 'country', name: 'Country', type: 'country' },
    { id: 'course', name: 'Course', type: 'text' },
    { id: 'status', name: 'Status', type: 'status' },
    { id: 'score', name: 'Score', type: 'number' },
    { id: 'completed-date', name: 'Completed Date', type: 'date' },
  ],
  changedRows: 12,
  addedRows: 4,
  removedRows: 4,
  blankCellsPercent: 2,
  casingDifferences: true,
  whitespaceDifferences: true,
  numericTextDifferences: true,
};

export function createSampleWorkbookFiles(config: SampleBuilderConfig): GeneratedSampleFiles {
  const safeConfig = normalizeConfig(config);
  const originalRows = Array.from({ length: safeConfig.rows }, (_, index) => buildRow(index + 1, safeConfig.columns, false));
  const removedKeys = new Set(Array.from({ length: safeConfig.removedRows }, (_, index) => safeConfig.rows - index));
  const changedKeys = new Set(Array.from({ length: safeConfig.changedRows }, (_, index) => index + 2).filter((key) => !removedKeys.has(key)));

  const newRows = originalRows
    .filter((row) => !removedKeys.has(rowIndexFromId(String(row[safeConfig.columns[0].name] ?? ''))))
    .map((row) => {
      const rowIndex = rowIndexFromId(String(row[safeConfig.columns[0].name] ?? ''));
      const next = { ...row };
      if (changedKeys.has(rowIndex)) {
        mutateRow(next, rowIndex, safeConfig);
      }
      return next;
    });

  for (let index = 0; index < safeConfig.addedRows; index += 1) {
    newRows.push(buildRow(safeConfig.rows + index + 1, safeConfig.columns, true));
  }

  applyBlankCells(originalRows, safeConfig);
  applyBlankCells(newRows, safeConfig);

  return {
    originalFile: buildWorkbookFile('sample-original.xlsx', safeConfig.columns, originalRows),
    newFile: buildWorkbookFile('sample-updated.xlsx', safeConfig.columns, newRows),
  };
}

function normalizeConfig(config: SampleBuilderConfig): SampleBuilderConfig {
  const columns = config.columns
    .map((column) => ({ ...column, name: column.name.trim() || 'Column' }))
    .filter((column) => column.name.length > 0)
    .slice(0, 24);
  const withKey = columns.some((column) => column.type === 'id')
    ? columns
    : [{ id: 'record-id', name: 'Record ID', type: 'id' as const }, ...columns];

  return {
    ...config,
    rows: clampInteger(config.rows, 5, 5000),
    columns: ensureUniqueColumnNames(withKey),
    changedRows: clampInteger(config.changedRows, 0, config.rows),
    addedRows: clampInteger(config.addedRows, 0, 500),
    removedRows: clampInteger(config.removedRows, 0, Math.max(0, config.rows - 1)),
    blankCellsPercent: clampInteger(config.blankCellsPercent, 0, 25),
  };
}

function ensureUniqueColumnNames(columns: SampleColumnDefinition[]): SampleColumnDefinition[] {
  const seen = new Map<string, number>();
  return columns.map((column) => {
    const count = seen.get(column.name) ?? 0;
    seen.set(column.name, count + 1);
    return count === 0 ? column : { ...column, name: `${column.name} ${count + 1}` };
  });
}

function buildRow(index: number, columns: SampleColumnDefinition[], isAdded: boolean): Record<string, CellValue> {
  return Object.fromEntries(columns.map((column) => [column.name, valueForColumn(column, index, isAdded)]));
}

function valueForColumn(column: SampleColumnDefinition, index: number, isAdded: boolean): CellValue {
  switch (column.type) {
    case 'id':
      return `TRN-${String(index).padStart(5, '0')}`;
    case 'person':
      return names[index % names.length];
    case 'email': {
      const name = names[index % names.length].toLowerCase().replace(/\s+/g, '.');
      return `${name}${index}@example.test`;
    }
    case 'department':
      return departments[index % departments.length];
    case 'country':
      return countries[index % countries.length];
    case 'status':
      return isAdded ? 'Not started' : statuses[index % statuses.length];
    case 'date':
      return isoDate(index);
    case 'number':
      return 55 + (index * 7) % 46;
    case 'currency':
      return 125 + (index * 19) % 900;
    case 'text':
      return textValues[index % textValues.length];
  }
}

function mutateRow(row: Record<string, CellValue>, rowIndex: number, config: SampleBuilderConfig): void {
  const candidates = config.columns.filter((column) => column.type !== 'id');
  const primary = candidates[rowIndex % candidates.length];
  if (primary) {
    row[primary.name] = changedValue(primary, row[primary.name], rowIndex);
  }

  if (config.casingDifferences) {
    const textColumn = candidates.find((column) => ['status', 'department', 'text'].includes(column.type));
    const value = textColumn ? row[textColumn.name] : null;
    if (textColumn && typeof value === 'string') row[textColumn.name] = value.toUpperCase();
  }

  if (config.whitespaceDifferences) {
    const personColumn = candidates.find((column) => column.type === 'person');
    const value = personColumn ? row[personColumn.name] : null;
    if (personColumn && typeof value === 'string') row[personColumn.name] = ` ${value} `;
  }

  if (config.numericTextDifferences) {
    const numericColumn = candidates.find((column) => column.type === 'number' || column.type === 'currency');
    if (numericColumn && typeof row[numericColumn.name] === 'number') row[numericColumn.name] = String(row[numericColumn.name]);
  }
}

function changedValue(column: SampleColumnDefinition, value: CellValue, rowIndex: number): CellValue {
  switch (column.type) {
    case 'person':
      return names[(rowIndex + 5) % names.length];
    case 'email':
      return `updated.${rowIndex}@example.test`;
    case 'department':
      return departments[(rowIndex + 2) % departments.length];
    case 'country':
      return countries[(rowIndex + 3) % countries.length];
    case 'status':
      return statuses[(rowIndex + 1) % statuses.length];
    case 'date':
      return isoDate(rowIndex + 12);
    case 'number':
    case 'currency':
      return typeof value === 'number' ? value + 5 : 75 + rowIndex;
    case 'text':
      return `${textValues[(rowIndex + 1) % textValues.length]} revised`;
    case 'id':
      return value;
  }
}

function applyBlankCells(rows: Record<string, CellValue>[], config: SampleBuilderConfig): void {
  if (config.blankCellsPercent <= 0) return;
  const columns = config.columns.filter((column) => column.type !== 'id');
  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      if (((rowIndex + 1) * (columnIndex + 3)) % 100 < config.blankCellsPercent) row[column.name] = null;
    });
  });
}

function buildWorkbookFile(fileName: string, columns: SampleColumnDefinition[], rows: Record<string, CellValue>[]): File {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: columns.map((column) => column.name) });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new File([output], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function rowIndexFromId(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function isoDate(index: number): string {
  const date = new Date(Date.UTC(2026, index % 12, (index % 24) + 1));
  return date.toISOString().slice(0, 10);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
