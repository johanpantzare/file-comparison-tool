import { Plus, Trash2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import {
  createSampleWorkbookFiles,
  defaultSampleBuilderConfig,
  sampleColumnTypes,
  type GeneratedSampleFiles,
  type SampleBuilderConfig,
  type SampleColumnDefinition,
} from '../features/sampleData/sampleDataBuilder';

interface SampleDataBuilderProps {
  onClose?: () => void;
  onGenerate: (files: GeneratedSampleFiles) => void;
}

export function SampleDataBuilder({ onClose, onGenerate }: SampleDataBuilderProps) {
  const [config, setConfig] = useState<SampleBuilderConfig>(defaultSampleBuilderConfig);

  function updateNumber(field: keyof Pick<SampleBuilderConfig, 'rows' | 'changedRows' | 'addedRows' | 'removedRows' | 'blankCellsPercent'>, value: string) {
    setConfig((current) => ({ ...current, [field]: Number(value) }));
  }

  function updateFlag(field: keyof Pick<SampleBuilderConfig, 'casingDifferences' | 'whitespaceDifferences' | 'numericTextDifferences'>, value: boolean) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  function updateColumn(id: string, updates: Partial<SampleColumnDefinition>) {
    setConfig((current) => ({
      ...current,
      columns: current.columns.map((column) => (column.id === id ? { ...column, ...updates } : column)),
    }));
  }

  function addColumn() {
    setConfig((current) => ({
      ...current,
      columns: [
        ...current.columns,
        { id: `column-${Date.now()}`, name: `Custom ${current.columns.length + 1}`, type: 'text' },
      ],
    }));
  }

  function removeColumn(id: string) {
    setConfig((current) => ({
      ...current,
      columns: current.columns.length <= 2 ? current.columns : current.columns.filter((column) => column.id !== id),
    }));
  }

  function generate() {
    onGenerate(createSampleWorkbookFiles(config));
  }

  const content = (
    <section className="builder-modal" role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-labelledby="sample-builder-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <p className="eyebrow">Sample Data</p>
          <h2 id="sample-builder-title">Build sample files</h2>
        </div>
        {onClose ? (
          <button className="icon-button" type="button" aria-label="Close sample data builder" onClick={onClose}>
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="builder-grid">
        <label>
          <span>Rows</span>
          <input type="number" min={5} max={5000} value={config.rows} onChange={(event) => updateNumber('rows', event.target.value)} />
        </label>
        <label>
          <span>Changed rows</span>
          <input type="number" min={0} max={config.rows} value={config.changedRows} onChange={(event) => updateNumber('changedRows', event.target.value)} />
        </label>
        <label>
          <span>Added rows</span>
          <input type="number" min={0} max={500} value={config.addedRows} onChange={(event) => updateNumber('addedRows', event.target.value)} />
        </label>
        <label>
          <span>Removed rows</span>
          <input type="number" min={0} max={Math.max(0, config.rows - 1)} value={config.removedRows} onChange={(event) => updateNumber('removedRows', event.target.value)} />
        </label>
        <label>
          <span>Blank cells %</span>
          <input type="number" min={0} max={25} value={config.blankCellsPercent} onChange={(event) => updateNumber('blankCellsPercent', event.target.value)} />
        </label>
      </div>

      <div className="builder-toggles">
        <label><input type="checkbox" checked={config.casingDifferences} onChange={(event) => updateFlag('casingDifferences', event.target.checked)} /> Casing differences</label>
        <label><input type="checkbox" checked={config.whitespaceDifferences} onChange={(event) => updateFlag('whitespaceDifferences', event.target.checked)} /> Whitespace differences</label>
        <label><input type="checkbox" checked={config.numericTextDifferences} onChange={(event) => updateFlag('numericTextDifferences', event.target.checked)} /> Numeric text differences</label>
      </div>

      <div className="builder-column-header">
        <h3>Columns</h3>
        <button className="secondary compact" type="button" onClick={addColumn}>
          <Plus size={16} /> Add column
        </button>
      </div>
      <div className="builder-columns">
        {config.columns.map((column) => (
          <div className="builder-column-row" key={column.id}>
            <input value={column.name} onChange={(event) => updateColumn(column.id, { name: event.target.value })} aria-label="Column name" />
            <select value={column.type} onChange={(event) => updateColumn(column.id, { type: event.target.value as SampleColumnDefinition['type'] })} aria-label="Column type">
              {sampleColumnTypes.map((type) => (
                <option value={type.value} key={type.value}>{type.label}</option>
              ))}
            </select>
            <button className="icon-button" type="button" aria-label={`Remove ${column.name}`} onClick={() => removeColumn(column.id)} disabled={config.columns.length <= 2}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="builder-footer">
        {onClose ? <button className="secondary" type="button" onClick={onClose}>Cancel</button> : <span />}
        <button type="button" onClick={generate}>
          <Wand2 size={18} /> Generate files
        </button>
      </div>
    </section>
  );

  if (!onClose) return <div className="sample-builder-step">{content}</div>;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      {content}
    </div>
  );
}
