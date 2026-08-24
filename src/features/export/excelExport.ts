import * as XLSX from 'xlsx';
import type { ComparisonConfig, ComparisonResult, DataTable } from '../../types';
import { flattenChangedRows, flattenReconciliationRows, flattenReconciliationSummaryRows } from './csvExport';

export function exportComparisonWorkbook(
  result: ComparisonResult,
  config: ComparisonConfig,
  original: DataTable,
  next: DataTable,
  metadata?: {
    originalName: string;
    newName: string;
    originalDescription?: string;
    newDescription?: string;
  },
): void {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSummary(result, config, original, next, metadata), { skipHeader: true }),
    'Summary',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(flattenReconciliationRows(result, config.keyColumns, config.comparedColumns)),
    'Reconciliation',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(flattenReconciliationSummaryRows(result, config.keyColumns, config.comparedColumns)),
    'Reconciliation Summary',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(flattenChangedRows(result.changed, config.keyColumns)),
    'Different',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.added), 'Only in new');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.removed), 'Missing in new');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.unchanged), 'Same');

  XLSX.writeFile(workbook, `comparison-result-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function buildSummary(
  result: ComparisonResult,
  config: ComparisonConfig,
  original: DataTable,
  next: DataTable,
  metadata?: {
    originalName: string;
    newName: string;
    originalDescription?: string;
    newDescription?: string;
  },
): string[][] {
  return [
    ['Comparison summary', ''],
    ['Original name', metadata?.originalName ?? original.sourceName],
    ['Original filename', original.sourceName],
    ['Original description', metadata?.originalDescription ?? ''],
    ['New name', metadata?.newName ?? next.sourceName],
    ['New filename', next.sourceName],
    ['New description', metadata?.newDescription ?? ''],
    ['Original worksheet', original.sheetName ?? ''],
    ['New worksheet', next.sheetName ?? ''],
    ['Compared at', result.comparedAt],
    ['Matching columns', config.keyColumns.map((pair) => `${pair.original} = ${pair.new}`).join('; ')],
    ['Compared columns', config.comparedColumns.map((pair) => `${pair.original} = ${pair.new}`).join('; ')],
    ['Only in new', String(result.summary.added)],
    ['Missing in new', String(result.summary.removed)],
    ['Different', String(result.summary.changed)],
    ['Same', String(result.summary.unchanged)],
  ];
}
