import { describe, expect, it } from 'vitest';
import { rowMatchesSearch, valueMatchesSearch } from './search';

describe('search helpers', () => {
  it('finds partial surname text inside dotted email addresses', () => {
    expect(valueMatchesSearch('alex.rivera@example.com', 'rive')).toBe(true);
  });

  it('finds first-initial surname aliases from email addresses', () => {
    expect(valueMatchesSearch('alex.rivera@example.com', 'arivera')).toBe(true);
  });

  it('finds first-initial surname aliases from names', () => {
    expect(valueMatchesSearch('Alex Rivera', 'arivera')).toBe(true);
  });

  it('searches across row values', () => {
    expect(rowMatchesSearch({ name: 'Alex Rivera', email: 'alex.rivera@example.com' }, 'arivera')).toBe(true);
  });
});
