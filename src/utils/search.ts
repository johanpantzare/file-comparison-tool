export function valueMatchesSearch(value: unknown, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  return searchableVariants(value).some((variant) => variant.includes(normalizedQuery));
}

export function rowMatchesSearch(row: Record<string, unknown>, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const combined = Object.values(row)
    .flatMap(searchableVariants)
    .join(' ');

  return combined.includes(normalizedQuery);
}

function searchableVariants(value: unknown): string[] {
  const raw = String(value ?? '');
  const normalized = normalizeSearchText(raw);
  if (!normalized) return [''];

  const variants = new Set<string>([
    normalized,
    normalized.replace(/\s+/g, ''),
  ]);

  addEmailVariants(raw, variants);
  addNameVariants(raw, variants);

  return [...variants];
}

function addEmailVariants(raw: string, variants: Set<string>): void {
  const emailMatches = raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) ?? [];

  emailMatches.forEach((email) => {
    const localPart = email.split('@')[0];
    const localSegments = localPart.split(/[._-]+/).filter(Boolean);
    const normalizedLocal = normalizeSearchText(localPart);
    variants.add(normalizedLocal);
    variants.add(normalizedLocal.replace(/\s+/g, ''));
    variants.add(localSegments.map(normalizeSearchText).join(''));

    if (localSegments.length >= 2) {
      const first = normalizeSearchText(localSegments[0]);
      const last = normalizeSearchText(localSegments[localSegments.length - 1]);
      if (first && last) variants.add(`${first[0]}${last}`);
    }
  });
}

function addNameVariants(raw: string, variants: Set<string>): void {
  const parts = normalizeSearchText(raw).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return;
  const first = parts[0];
  const last = parts[parts.length - 1];
  variants.add(`${first[0]}${last}`);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
