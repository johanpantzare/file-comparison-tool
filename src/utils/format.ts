import type { CellValue } from '../types';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatCell(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim();
}

export function ensureUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const fallback = header || `Column ${index + 1}`;
    const count = seen.get(fallback) ?? 0;
    seen.set(fallback, count + 1);
    return count === 0 ? fallback : `${fallback} (${count + 1})`;
  });
}
