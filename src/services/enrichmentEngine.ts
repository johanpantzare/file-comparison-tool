import type {
  CellValue,
  DataTable,
  DuplicateKeyWarning,
  EnrichmentConfig,
  EnrichmentResult,
  KeyColumnPair,
} from '../types';
import { formatCell } from '../utils/format';

const keySeparator = '\u001f';

export function enrichTable(
  base: DataTable,
  reference: DataTable,
  config: EnrichmentConfig,
): EnrichmentResult {
  validateConfig(config);

  const duplicateKeys: DuplicateKeyWarning[] = [];
  const referenceIndex = indexReferenceRows(reference.rows, config.keyColumns, duplicateKeys);
  const outputColumns = buildOutputColumns(base.columns, config.addedColumns);
  let matchedRows = 0;
  let unmatchedRows = 0;

  const rows = base.rows.map((baseRow) => {
    const key = buildKey(baseRow, config.keyColumns, 'original');
    const referenceRow = referenceIndex.get(key)?.[0];
    const outputRow: Record<string, CellValue> = { ...baseRow };

    if (referenceRow) matchedRows += 1;
    else unmatchedRows += 1;

    config.addedColumns.forEach((column) => {
      outputRow[outputColumns.addedColumnNames[column]] = referenceRow?.[column] ?? null;
    });

    return outputRow;
  });

  return {
    rows,
    columns: outputColumns.columns,
    matchedRows,
    unmatchedRows,
    addedColumns: config.addedColumns,
    duplicateKeys,
    builtAt: new Date().toISOString(),
  };
}

function validateConfig(config: EnrichmentConfig): void {
  if (config.keyColumns.length === 0) {
    throw new Error('Choose at least one matching column.');
  }
  if (!config.keyColumns.every((pair) => pair.original && pair.new)) {
    throw new Error('Complete every matching column pair.');
  }
  if (config.addedColumns.length === 0) {
    throw new Error('Choose at least one reference column to add.');
  }
}

function indexReferenceRows(
  rows: Record<string, CellValue>[],
  keyColumns: KeyColumnPair[],
  duplicateKeys: DuplicateKeyWarning[],
): Map<string, Record<string, CellValue>[]> {
  const index = new Map<string, Record<string, CellValue>[]>();

  rows.forEach((row) => {
    const key = buildKey(row, keyColumns, 'new');
    const bucket = index.get(key) ?? [];
    bucket.push(row);
    index.set(key, bucket);
  });

  for (const [key, bucket] of index.entries()) {
    if (bucket.length > 1) {
      duplicateKeys.push({ side: 'new', key, count: bucket.length });
    }
  }

  return index;
}

function buildKey(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): string {
  return keyColumns.map((pair) => formatCell(row[pair[side]])).join(keySeparator);
}

function buildOutputColumns(
  baseColumns: string[],
  addedColumns: string[],
): { columns: string[]; addedColumnNames: Record<string, string> } {
  const used = new Set(baseColumns);
  const addedColumnNames: Record<string, string> = {};

  addedColumns.forEach((column) => {
    const outputName = uniqueColumnName(used, column);
    addedColumnNames[column] = outputName;
    used.add(outputName);
  });

  return {
    columns: [...baseColumns, ...addedColumns.map((column) => addedColumnNames[column])],
    addedColumnNames,
  };
}

function uniqueColumnName(used: Set<string>, column: string): string {
  if (!used.has(column)) return column;

  const base = `Reference ${column}`;
  if (!used.has(base)) return base;

  let index = 2;
  while (used.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}
