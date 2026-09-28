import type { CellValue, KeyColumnPair, KeyMatchingOptions } from '../types';
import { formatCell } from '../utils/format';

export const keySeparator = '\u001f';

export const defaultKeyMatchingOptions: KeyMatchingOptions = {
  trimWhitespace: false,
  caseInsensitive: false,
};

export function buildMatchKey(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
  options: KeyMatchingOptions = defaultKeyMatchingOptions,
): string {
  return keyColumns.map((pair) => normalizeKeyPart(row[pair[side]], options)).join(keySeparator);
}

export function buildNonBlankMatchKey(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
  options: KeyMatchingOptions = defaultKeyMatchingOptions,
): string {
  const parts = keyColumns.map((pair) => normalizeKeyPart(row[pair[side]], options));
  if (parts.every((part) => part === '')) return '';
  return parts.join(keySeparator);
}

function normalizeKeyPart(value: CellValue, options: KeyMatchingOptions): string {
  let normalized = formatCell(value);
  if (options.trimWhitespace) normalized = normalized.trim();
  if (options.caseInsensitive) normalized = normalized.toLocaleLowerCase();
  return normalized;
}
