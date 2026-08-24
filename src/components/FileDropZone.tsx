import type { ReactNode } from 'react';
import { Eye, FileSpreadsheet, UploadCloud } from 'lucide-react';
import type { DataTable, ParsedWorkbook } from '../types';
import { formatFileSize } from '../utils/format';

interface FileDropZoneProps {
  title: string;
  helper: string;
  workbook: ParsedWorkbook | null;
  error: string | null;
  onFile: (file: File) => void;
  onSheetChange: (index: number) => void;
  onDetailsChange: (details: { displayName?: string; description?: string }) => void;
  headerActions?: ReactNode;
  onPreview?: (title: string, table: DataTable) => void;
}

export function FileDropZone({
  title,
  helper,
  workbook,
  error,
  onFile,
  onSheetChange,
  onDetailsChange,
  headerActions,
  onPreview,
}: FileDropZoneProps) {
  const inputId = `${title.toLowerCase().replace(/\s+/g, '-')}-file`;
  const selectedTable = workbook?.sheets[workbook.selectedSheetIndex];

  return (
    <section className="file-panel">
      <div className="file-panel-header">
        <div>
          <h2>{title}</h2>
          <p>{helper}</p>
        </div>
        {headerActions ? <div className="file-panel-actions">{headerActions}</div> : null}
      </div>
      <label
        className={`drop-zone ${error ? 'has-error' : ''}`}
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <input
          id={inputId}
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        {workbook ? <FileSpreadsheet size={34} /> : <UploadCloud size={34} />}
        <strong className="uploaded-file-name" title={workbook?.fileName}>
          {workbook ? workbook.fileName : 'Drop file here or browse'}
        </strong>
        <span>{workbook ? `${workbook.fileType.toUpperCase()} · ${formatFileSize(workbook.fileSize)}` : 'CSV or XLSX'}</span>
      </label>

      {error ? <p className="error-text">{error}</p> : null}

      {workbook && selectedTable ? (
        <div className="file-meta">
          {onPreview ? (
            <div className="file-loaded-actions">
              <button
                className="text-icon-button"
                type="button"
                onClick={() => onPreview(workbook.displayName || workbook.fileName || title, selectedTable)}
              >
                <Eye size={18} /> Preview
              </button>
            </div>
          ) : null}
          <div className="file-details">
            <label>
              Name
              <input
                type="text"
                value={workbook.displayName}
                onChange={(event) => onDetailsChange({ displayName: event.target.value })}
                placeholder="Friendly file name"
              />
            </label>
            <label>
              Description
              <textarea
                value={workbook.description}
                onChange={(event) => onDetailsChange({ description: event.target.value })}
                placeholder="Optional note about this dataset"
                rows={3}
              />
            </label>
          </div>
          {workbook.sheets.length > 1 ? (
            <label>
              Worksheet
              <select
                value={workbook.selectedSheetIndex}
                onChange={(event) => onSheetChange(Number(event.target.value))}
              >
                {workbook.sheets.map((sheet, index) => (
                  <option value={index} key={sheet.sheetName ?? index}>
                    {sheet.sheetName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <dl>
            <div>
              <dt>Rows</dt>
              <dd>{selectedTable.rows.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Columns</dt>
              <dd>{selectedTable.columns.length.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
