import Papa from 'papaparse';
import type { CellValue, ChangedRow, ComparedColumnPair, ComparisonResult, KeyColumnPair } from '../../types';
import { formatCell } from '../../utils/format';

export type ResultView = 'reconciliation' | 'reconciliationSummary' | 'changed' | 'added' | 'removed' | 'unchanged';

export function buildCsvForView(
  result: ComparisonResult,
  view: ResultView,
  config: { keyColumns: KeyColumnPair[]; comparedColumns: ComparedColumnPair[] },
): string {
  if (view === 'changed') {
    return Papa.unparse(flattenChangedRows(result.changed, config.keyColumns));
  }

  if (view === 'reconciliation') {
    return Papa.unparse(flattenReconciliationRows(result, config.keyColumns, config.comparedColumns));
  }

  if (view === 'reconciliationSummary') {
    return Papa.unparse(flattenReconciliationSummaryRows(result, config.keyColumns, config.comparedColumns));
  }

  return Papa.unparse(result[view]);
}

export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, fileName);
}

export function buildCsvForRows(rows: Record<string, CellValue>[], columns: string[]): string {
  return Papa.unparse({
    fields: columns,
    data: rows.map((row) => columns.map((column) => row[column] ?? '')),
  });
}

export function flattenChangedRows(
  rows: ChangedRow[],
  keyColumns: KeyColumnPair[],
): Record<string, string>[] {
  const counts = countChangePatterns(rows);

  return rows.flatMap((row) =>
    row.changes.map((change) => {
      const flattened: Record<string, string> = {};
      keyColumns.forEach((pair) => {
        flattened[pair.original] = formatCell(row.key[pair.original]);
      });
      flattened.Field = change.field;
      flattened['Original Value'] = formatCell(change.originalValue);
      flattened['New Value'] = formatCell(change.newValue);
      flattened['Same Change Count'] = String(counts.get(changePatternKey(change.field, change.originalValue, change.newValue)) ?? 1);
      return flattened;
    }),
  );
}

export function flattenReconciliationRows(
  result: ComparisonResult,
  keyColumns: KeyColumnPair[],
  comparedColumns: ComparedColumnPair[],
): Record<string, string>[] {
  return result.reconciliation.map((entry) => {
    const row: Record<string, string> = {};

    keyColumns.forEach((pair) => {
      row[pair.original] = formatCell(entry.key[pair.original]);
    });

    row.Status = entry.status;
    row['Different Fields'] = entry.changes.length === 0
      ? ''
      : entry.changes.map((change) => change.field).join(', ');
    row['Different Field Count'] = String(entry.changes.length);

    comparedColumns.forEach((pair) => {
      const originalLabel = pair.original === pair.new ? `Original ${pair.original}` : `Original ${pair.original}`;
      const newLabel = pair.original === pair.new ? `New ${pair.new}` : `New ${pair.new}`;
      row[originalLabel] = formatCell(entry.originalRow?.[pair.original]);
      row[newLabel] = formatCell(entry.newRow?.[pair.new]);
    });

    return row;
  });
}

export function flattenReconciliationSummaryRows(
  result: ComparisonResult,
  keyColumns: KeyColumnPair[],
  comparedColumns: ComparedColumnPair[],
): Record<string, string>[] {
  const grouped = new Map<string, Record<string, string>>();

  flattenReconciliationRows(result, keyColumns, comparedColumns).forEach((row) => {
    const groupKey = [
      row.Status,
      row['Different Fields'],
      ...comparedColumns.flatMap((pair) => [
        row[`Original ${pair.original}`] ?? '',
        row[`New ${pair.new}`] ?? '',
      ]),
    ].join('\u001f');

    const existing = grouped.get(groupKey);
    if (existing) {
      existing.Rows = String(Number(existing.Rows) + 1);
      existing['Example Keys'] = appendExampleKey(existing['Example Keys'], keyColumns.map((pair) => row[pair.original]).filter(Boolean).join(' / '));
      return;
    }

    const summaryRow: Record<string, string> = {
      Rows: '1',
      Status: row.Status,
      'Different Fields': row['Different Fields'],
      'Different Field Count': row['Different Field Count'],
      'Example Keys': keyColumns.map((pair) => row[pair.original]).filter(Boolean).join(' / '),
    };

    comparedColumns.forEach((pair) => {
      summaryRow[`Original ${pair.original}`] = row[`Original ${pair.original}`] ?? '';
      summaryRow[`New ${pair.new}`] = row[`New ${pair.new}`] ?? '';
    });

    grouped.set(groupKey, summaryRow);
  });

  return [...grouped.values()].sort((left, right) => Number(right.Rows) - Number(left.Rows));
}

function appendExampleKey(existing: string, next: string): string {
  if (!next) return existing;
  const examples = existing ? existing.split(', ') : [];
  if (examples.includes(next) || examples.length >= 5) return existing;
  return [...examples, next].join(', ');
}

function countChangePatterns(rows: ChangedRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    row.changes.forEach((change) => {
      const key = changePatternKey(change.field, change.originalValue, change.newValue);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return counts;
}

function changePatternKey(field: string, originalValue: CellValue, newValue: CellValue): string {
  return `${field}\u001f${formatCell(originalValue)}\u001f${formatCell(newValue)}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
