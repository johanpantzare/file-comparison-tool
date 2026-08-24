# File Comparison Tool

A browser-based utility for comparing two CSV or Excel files. It guides users through a simple workflow:

1. Upload an Original file and a New file.
2. Choose the column or columns that identify the same row.
3. Choose which fields should be compared.
4. Review Reconciliation, Summary, Different, Only in new, Missing in new, and Same views.
5. Export the full result to Excel or the current view to CSV.

## Supported Formats

- `.csv`
- `.xlsx`

Excel workbooks with multiple worksheets are supported. The selected worksheet is parsed into the same normalized table model as CSV files.

## Technology Stack

- React
- TypeScript
- Vite
- SheetJS for XLSX parsing and Excel export
- Papa Parse for CSV parsing and CSV export
- Vitest for comparison-engine unit tests

## Local Development

```bash
npm install
npm run dev
npm run build
npm test
```

The app is fully client-side and does not require a backend.

## Architecture Overview

```text
src/
  components/              Reusable UI components
  features/export/         CSV and Excel export logic
  services/                File parsing and comparison engine
  types/                   Shared TypeScript interfaces
  utils/                   Formatting and normalization helpers
```

File parsing produces a normalized `DataTable`, so the comparison workflow does not need to know whether the source was CSV or XLSX.

The comparison engine is independent of React. It accepts normalized tables and a comparison configuration, then returns structured results with field-level changes.

The export layer consumes the comparison result and configuration directly, which keeps future export formats easy to add.

## Privacy Model

Files are read, parsed, compared, and exported locally in the browser. The app does not upload file contents, call a backend, or store uploaded data in cloud storage.

## Current Functionality

- Drag-and-drop or browse upload for Original and New files
- Worksheet selection for XLSX workbooks
- Basic file metadata
- Multiple matching columns for row identity
- Matching-column analysis with duplicate warnings
- Automatic detection of same-name columns for comparison
- Comparison options for whitespace, case, blank/null, and numeric text handling
- Reconciliation, Summary, Different, Only in new, Missing in new, and Same result views
- Field-level change inspection
- Basic search in the active result view
- Excel workbook export with Summary, Reconciliation, Reconciliation Summary, Different, Only in new, Missing in new, and Same worksheets
- CSV export for the active result view

## Known Limitations

- Large datasets are shown with simple row limits instead of virtualization.
- Duplicate matching keys are warned about, but not resolved interactively.
- CSV parsing is designed for common well-formed exports.

## Planned Incremental Development

- Suggested matching columns
- Fuzzy column mapping
- JSON import support
- XML import support
- Saved comparison configurations
- More advanced filtering and sorting
- Pagination or virtualization
- Web Worker comparison for larger files
- Richer export and report formats
