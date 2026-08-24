import { describe, expect, it } from 'vitest';
import { compareTables } from './comparisonEngine';
import type { ComparisonConfig, DataTable } from '../types';
import { flattenReconciliationSummaryRows } from '../features/export/csvExport';

const baseConfig: ComparisonConfig = {
  keyColumns: [{ original: 'ID', new: 'ID' }],
  comparedColumns: [
    { original: 'Name', new: 'Name' },
    { original: 'Status', new: 'Status' },
    { original: 'Score', new: 'Score' },
  ],
  options: {
    trimWhitespace: true,
    caseInsensitive: false,
    blankEqualsNull: true,
    numericTextEqualsNumber: true,
  },
};

function table(rows: DataTable['rows'], columns = ['ID', 'Name', 'Status', 'Score']): DataTable {
  return { columns, rows, sourceName: 'test.csv' };
}

describe('compareTables', () => {
  it('reports identical datasets as unchanged', () => {
    const result = compareTables(
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      baseConfig,
    );

    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 1 });
  });

  it('detects added rows', () => {
    const result = compareTables(
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      table([
        { ID: '1', Name: 'Ava', Status: 'Active', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Active', Score: 7 },
      ]),
      baseConfig,
    );

    expect(result.summary.added).toBe(1);
    expect(result.added[0].ID).toBe('2');
  });

  it('detects removed rows', () => {
    const result = compareTables(
      table([
        { ID: '1', Name: 'Ava', Status: 'Active', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Active', Score: 7 },
      ]),
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      baseConfig,
    );

    expect(result.summary.removed).toBe(1);
    expect(result.removed[0].ID).toBe('2');
  });

  it('detects changed rows and multiple changed fields', () => {
    const result = compareTables(
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      table([{ ID: '1', Name: 'Ava Smith', Status: 'Inactive', Score: 10 }]),
      baseConfig,
    );

    expect(result.summary.changed).toBe(1);
    expect(result.changed[0].changes.map((change) => change.field)).toEqual(['Name', 'Status']);
  });

  it('handles different column order', () => {
    const result = compareTables(
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }], ['Score', 'Status', 'Name', 'ID']),
      table([{ Score: 10, Status: 'Active', Name: 'Ava', ID: '1' }], ['ID', 'Name', 'Status', 'Score']),
      baseConfig,
    );

    expect(result.summary.unchanged).toBe(1);
  });

  it('treats blank and null values as equivalent when configured', () => {
    const result = compareTables(
      table([{ ID: '1', Name: '', Status: 'Active', Score: 10 }]),
      table([{ ID: '1', Name: null, Status: 'Active', Score: 10 }]),
      baseConfig,
    );

    expect(result.summary.unchanged).toBe(1);
  });

  it('reports duplicate keys', () => {
    const result = compareTables(
      table([
        { ID: '1', Name: 'Ava', Status: 'Active', Score: 10 },
        { ID: '1', Name: 'Ava 2', Status: 'Active', Score: 10 },
      ]),
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      baseConfig,
    );

    expect(result.duplicateKeys).toEqual([{ side: 'original', key: '1', count: 2 }]);
  });

  it('supports composite keys', () => {
    const config: ComparisonConfig = {
      ...baseConfig,
      keyColumns: [
        { original: 'Dealer', new: 'Dealer' },
        { original: 'ID', new: 'User Number' },
      ],
    };

    const result = compareTables(
      table([{ Dealer: 'SE01', ID: '7', Name: 'Ava', Status: 'Active', Score: 10 }]),
      table([{ Dealer: 'SE01', 'User Number': '7', Name: 'Ava', Status: 'Active', Score: 10 }]),
      config,
    );

    expect(result.summary.unchanged).toBe(1);
  });

  it('keeps unchanged rows in the original file structure', () => {
    const config: ComparisonConfig = {
      ...baseConfig,
      keyColumns: [{ original: 'Original ID', new: 'New ID' }],
      comparedColumns: [{ original: 'Original Name', new: 'New Name' }],
    };

    const result = compareTables(
      table([{ 'Original ID': '1', 'Original Name': 'Ava' }], ['Original ID', 'Original Name']),
      table([{ 'New ID': '1', 'New Name': 'Ava' }], ['New ID', 'New Name']),
      config,
    );

    expect(result.unchanged[0]).toEqual({ 'Original ID': '1', 'Original Name': 'Ava' });
  });

  it('builds reconciliation entries for same, different, missing, and only-in-new rows', () => {
    const result = compareTables(
      table([
        { ID: '1', Name: 'Ava', Status: 'Active', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Active', Score: 8 },
        { ID: '3', Name: 'Cy', Status: 'Active', Score: 6 },
      ]),
      table([
        { ID: '1', Name: 'Ava', Status: 'Active', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Inactive', Score: 8 },
        { ID: '4', Name: 'Dee', Status: 'Active', Score: 5 },
      ]),
      baseConfig,
    );

    expect(result.reconciliation.map((entry) => entry.status)).toEqual([
      'Same',
      'Different',
      'Missing in new',
      'Only in new',
    ]);
  });

  it('groups repeated reconciliation patterns with row counts', () => {
    const result = compareTables(
      table([
        { ID: '1', Name: 'Ava', Status: 'Dealer A', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Dealer A', Score: 10 },
      ]),
      table([
        { ID: '1', Name: 'Ava', Status: 'Dealer B', Score: 10 },
        { ID: '2', Name: 'Bo', Status: 'Dealer B', Score: 10 },
      ]),
      {
        ...baseConfig,
        comparedColumns: [{ original: 'Status', new: 'Status' }],
      },
    );

    const summary = flattenReconciliationSummaryRows(
      result,
      baseConfig.keyColumns,
      [{ original: 'Status', new: 'Status' }],
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].Rows).toBe('2');
    expect(summary[0]['Original Status']).toBe('Dealer A');
    expect(summary[0]['New Status']).toBe('Dealer B');
  });

  it('treats numeric text and numbers as equivalent when configured', () => {
    const result = compareTables(
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: '10' }]),
      table([{ ID: '1', Name: 'Ava', Status: 'Active', Score: 10 }]),
      baseConfig,
    );

    expect(result.summary.unchanged).toBe(1);
  });
});
