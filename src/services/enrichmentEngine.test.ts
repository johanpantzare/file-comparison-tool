import { describe, expect, it } from 'vitest';
import type { DataTable, EnrichmentConfig } from '../types';
import { enrichTable } from './enrichmentEngine';

const config: EnrichmentConfig = {
  keyColumns: [
    { original: 'PARMA ID', new: 'PARMA ID' },
    { original: 'Branch ID', new: 'Branch ID' },
  ],
  addedColumns: ['Branch Name', 'Region'],
};

function table(rows: DataTable['rows'], columns: string[]): DataTable {
  return { columns, rows, sourceName: 'test.csv' };
}

describe('enrichTable', () => {
  it('keeps every base row and adds selected reference columns', () => {
    const result = enrichTable(
      table([
        { Name: 'Ava', 'PARMA ID': 'P1', 'Branch ID': 'B1', Dealer: 'Nordic' },
        { Name: 'Bo', 'PARMA ID': 'P1', 'Branch ID': 'B1', Dealer: 'Nordic' },
      ], ['Name', 'PARMA ID', 'Branch ID', 'Dealer']),
      table([
        { 'PARMA ID': 'P1', 'Branch ID': 'B1', 'Branch Name': 'Nordic Stockholm', Region: 'Europe North' },
      ], ['PARMA ID', 'Branch ID', 'Branch Name', 'Region']),
      config,
    );

    expect(result.rows).toHaveLength(2);
    expect(result.matchedRows).toBe(2);
    expect(result.unmatchedRows).toBe(0);
    expect(result.rows[0]['Branch Name']).toBe('Nordic Stockholm');
    expect(result.rows[1].Region).toBe('Europe North');
  });

  it('leaves added columns blank when no reference row matches', () => {
    const result = enrichTable(
      table([{ Name: 'Cy', 'PARMA ID': 'P9', 'Branch ID': 'B9' }], ['Name', 'PARMA ID', 'Branch ID']),
      table([{ 'PARMA ID': 'P1', 'Branch ID': 'B1', 'Branch Name': 'Nordic Stockholm', Region: 'Europe North' }], ['PARMA ID', 'Branch ID', 'Branch Name', 'Region']),
      config,
    );

    expect(result.matchedRows).toBe(0);
    expect(result.unmatchedRows).toBe(1);
    expect(result.rows[0]['Branch Name']).toBeNull();
  });

  it('renames added columns when they already exist in the base table', () => {
    const result = enrichTable(
      table([{ Name: 'Ava', Region: 'User Region', 'PARMA ID': 'P1', 'Branch ID': 'B1' }], ['Name', 'Region', 'PARMA ID', 'Branch ID']),
      table([{ 'PARMA ID': 'P1', 'Branch ID': 'B1', 'Branch Name': 'Nordic Stockholm', Region: 'Europe North' }], ['PARMA ID', 'Branch ID', 'Branch Name', 'Region']),
      config,
    );

    expect(result.columns).toEqual(['Name', 'Region', 'PARMA ID', 'Branch ID', 'Branch Name', 'Reference Region']);
    expect(result.rows[0].Region).toBe('User Region');
    expect(result.rows[0]['Reference Region']).toBe('Europe North');
  });

  it('warns when the reference file has duplicate matching keys', () => {
    const result = enrichTable(
      table([{ Name: 'Ava', 'PARMA ID': 'P1', 'Branch ID': 'B1' }], ['Name', 'PARMA ID', 'Branch ID']),
      table([
        { 'PARMA ID': 'P1', 'Branch ID': 'B1', 'Branch Name': 'Nordic Stockholm', Region: 'Europe North' },
        { 'PARMA ID': 'P1', 'Branch ID': 'B1', 'Branch Name': 'Nordic Stockholm 2', Region: 'Europe North' },
      ], ['PARMA ID', 'Branch ID', 'Branch Name', 'Region']),
      config,
    );

    expect(result.duplicateKeys).toEqual([{ side: 'new', key: 'P1\u001fB1', count: 2 }]);
  });
});
