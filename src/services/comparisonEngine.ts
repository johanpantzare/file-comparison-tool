import type {
  CellValue,
  ComparedColumnPair,
  ComparisonConfig,
  ComparisonOptions,
  ComparisonResult,
  DataTable,
  DuplicateKeyWarning,
  KeyColumnPair,
} from '../types';
import { formatCell } from '../utils/format';

const keySeparator = '\u001f';

export function compareTables(
  original: DataTable,
  next: DataTable,
  config: ComparisonConfig,
): ComparisonResult {
  validateConfig(config);

  const duplicateKeys: DuplicateKeyWarning[] = [];
  const originalIndex = indexRows(original.rows, config.keyColumns, 'original', duplicateKeys);
  const newIndex = indexRows(next.rows, config.keyColumns, 'new', duplicateKeys);

  const added: Record<string, CellValue>[] = [];
  const removed: Record<string, CellValue>[] = [];
  const changed = [];
  const unchanged: Record<string, CellValue>[] = [];
  const reconciliation: ComparisonResult['reconciliation'] = [];

  for (const [key, originalRows] of originalIndex.entries()) {
    const newRows = newIndex.get(key);

    if (!newRows) {
      removed.push(...originalRows);
      originalRows.forEach((originalRow) => {
        reconciliation.push({
          key: buildKeyRecordForSide(originalRow, config.keyColumns, 'original'),
          keyLabel: keyToLabelForSide(originalRow, config.keyColumns, 'original'),
          status: 'Missing in new',
          originalRow,
          changes: [],
        });
      });
      continue;
    }

    const originalRow = originalRows[0];
    const newRow = newRows[0];
    const changes = getFieldChanges(originalRow, newRow, config.comparedColumns, config.options);

    if (changes.length > 0) {
      reconciliation.push({
        key: buildKeyRecord(originalRow, newRow, config.keyColumns),
        keyLabel: keyToLabel(originalRow, newRow, config.keyColumns),
        status: 'Different',
        originalRow,
        newRow,
        changes,
      });
      changed.push({
        key: buildKeyRecord(originalRow, newRow, config.keyColumns),
        keyLabel: keyToLabel(originalRow, newRow, config.keyColumns),
        originalRow,
        newRow,
        changes,
      });
    } else {
      reconciliation.push({
        key: buildKeyRecord(originalRow, newRow, config.keyColumns),
        keyLabel: keyToLabel(originalRow, newRow, config.keyColumns),
        status: 'Same',
        originalRow,
        newRow,
        changes: [],
      });
      unchanged.push(originalRow);
    }
  }

  for (const [key, newRows] of newIndex.entries()) {
    if (!originalIndex.has(key)) {
      added.push(...newRows);
      newRows.forEach((newRow) => {
        reconciliation.push({
          key: buildKeyRecordForSide(newRow, config.keyColumns, 'new'),
          keyLabel: keyToLabelForSide(newRow, config.keyColumns, 'new'),
          status: 'Only in new',
          newRow,
          changes: [],
        });
      });
    }
  }

  return {
    added,
    removed,
    changed,
    unchanged,
    reconciliation,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
    },
    duplicateKeys,
    comparedAt: new Date().toISOString(),
  };
}

export function analyzeMatchingColumns(
  original: DataTable,
  next: DataTable,
  keyColumns: KeyColumnPair[],
): {
  originalPopulated: number;
  newPopulated: number;
  originalUnique: number;
  newUnique: number;
  originalDuplicates: number;
  newDuplicates: number;
  approximateMatches: number;
} {
  const originalKeys = collectKeys(original.rows, keyColumns, 'original');
  const newKeys = collectKeys(next.rows, keyColumns, 'new');
  const originalSet = new Set(originalKeys.filter(Boolean));
  const newSet = new Set(newKeys.filter(Boolean));
  const approximateMatches = [...originalSet].filter((key) => newSet.has(key)).length;

  return {
    originalPopulated: originalKeys.filter(Boolean).length,
    newPopulated: newKeys.filter(Boolean).length,
    originalUnique: originalSet.size,
    newUnique: newSet.size,
    originalDuplicates: countDuplicates(originalKeys),
    newDuplicates: countDuplicates(newKeys),
    approximateMatches,
  };
}

function validateConfig(config: ComparisonConfig): void {
  if (config.keyColumns.length === 0) {
    throw new Error('Choose at least one matching column.');
  }
  if (config.comparedColumns.length === 0) {
    throw new Error('Choose at least one field to compare.');
  }
}

function indexRows(
  rows: Record<string, CellValue>[],
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
  duplicateKeys: DuplicateKeyWarning[],
): Map<string, Record<string, CellValue>[]> {
  const index = new Map<string, Record<string, CellValue>[]>();

  rows.forEach((row) => {
    const key = buildKey(row, keyColumns, side);
    const bucket = index.get(key) ?? [];
    bucket.push(row);
    index.set(key, bucket);
  });

  for (const [key, bucket] of index.entries()) {
    if (bucket.length > 1) {
      duplicateKeys.push({ side, key, count: bucket.length });
    }
  }

  return index;
}

function collectKeys(
  rows: Record<string, CellValue>[],
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): string[] {
  return rows.map((row) => buildKey(row, keyColumns, side));
}

function buildKey(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): string {
  return keyColumns.map((pair) => formatCell(row[pair[side]])).join(keySeparator);
}

function keyToLabel(
  originalRow: Record<string, CellValue>,
  newRow: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
): string {
  return keyColumns
    .map((pair) => formatCell(newRow[pair.new] ?? originalRow[pair.original]))
    .join(' / ');
}

function buildKeyRecord(
  originalRow: Record<string, CellValue>,
  newRow: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
): Record<string, CellValue> {
  const key: Record<string, CellValue> = {};
  keyColumns.forEach((pair) => {
    key[pair.original] = newRow[pair.new] ?? originalRow[pair.original] ?? null;
  });
  return key;
}

function keyToLabelForSide(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): string {
  return keyColumns.map((pair) => formatCell(row[pair[side]])).join(' / ');
}

function buildKeyRecordForSide(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): Record<string, CellValue> {
  const key: Record<string, CellValue> = {};
  keyColumns.forEach((pair) => {
    key[pair.original] = row[pair[side]] ?? null;
  });
  return key;
}

function getFieldChanges(
  originalRow: Record<string, CellValue>,
  newRow: Record<string, CellValue>,
  comparedColumns: ComparedColumnPair[],
  options: ComparisonOptions,
) {
  return comparedColumns.flatMap((pair) => {
    const originalValue = originalRow[pair.original] ?? null;
    const newValue = newRow[pair.new] ?? null;

    if (areEquivalent(originalValue, newValue, options)) {
      return [];
    }

    return [{
      field: pair.original === pair.new ? pair.original : `${pair.original} / ${pair.new}`,
      originalColumn: pair.original,
      newColumn: pair.new,
      originalValue,
      newValue,
    }];
  });
}

function areEquivalent(left: CellValue, right: CellValue, options: ComparisonOptions): boolean {
  if (options.blankEqualsNull && isBlankish(left) && isBlankish(right)) {
    return true;
  }

  let normalizedLeft = normalizeComparable(left, options);
  let normalizedRight = normalizeComparable(right, options);

  if (options.numericTextEqualsNumber) {
    const leftNumber = toNumber(normalizedLeft);
    const rightNumber = toNumber(normalizedRight);
    if (leftNumber !== null && rightNumber !== null) {
      normalizedLeft = leftNumber;
      normalizedRight = rightNumber;
    }
  }

  return Object.is(normalizedLeft, normalizedRight);
}

function normalizeComparable(value: CellValue, options: ComparisonOptions): CellValue | string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  let normalized = value;
  if (options.trimWhitespace) normalized = normalized.trim();
  if (options.caseInsensitive) normalized = normalized.toLocaleLowerCase();
  return normalized;
}

function isBlankish(value: CellValue): boolean {
  return value === null || value === '';
}

function toNumber(value: CellValue | string): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function countDuplicates(keys: string[]): number {
  const counts = new Map<string, number>();
  keys.filter(Boolean).forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}
