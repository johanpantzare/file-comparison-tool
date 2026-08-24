import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, Download, Eye, FileDown, Info, Lock, MoreVertical, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FileDropZone } from './components/FileDropZone';
import { ResultTable } from './components/ResultTable';
import { SampleDataBuilder } from './components/SampleDataBuilder';
import { WizardStepper } from './components/WizardStepper';
import { buildCsvForRows, buildCsvForView, downloadCsv, flattenChangedRows, flattenReconciliationRows, flattenReconciliationSummaryRows, type ResultView } from './features/export/csvExport';
import { exportComparisonWorkbook } from './features/export/excelExport';
import type { GeneratedSampleFiles } from './features/sampleData/sampleDataBuilder';
import { analyzeMatchingColumns, compareTables } from './services/comparisonEngine';
import { enrichTable } from './services/enrichmentEngine';
import { parseFile } from './services/fileParser';
import type {
  ComparedColumnPair,
  CellValue,
  ComparisonConfig,
  ComparisonOptions,
  ComparisonResult,
  DataTable,
  DuplicateKeyWarning,
  EnrichmentConfig,
  EnrichmentResult,
  KeyColumnPair,
  ParsedWorkbook,
} from './types';
import { formatCell, formatFileSize } from './utils/format';
import { rowMatchesSearch } from './utils/search';

type AppTask = 'compare' | 'coverage' | 'enrich' | 'sample' | 'privacy';
type SampleKind = 'clean' | 'messy';
type SampleTarget = 'original' | 'new' | `extra-${number}`;
type PrivacyMode = 'replace' | 'hide';
type PrivacyTransforms = Record<string, PrivacyMode>;
type PrivacyKind = 'email' | 'string' | 'id' | 'date' | 'number' | 'category' | 'value';
type PrivacyTypeOverrides = Record<string, PrivacyKind>;

interface PrivacyColumnInfo {
  column: string;
  detectedKind: PrivacyKind;
  sample: string;
}

interface EnrichReference {
  index: number;
  workbook: ParsedWorkbook;
  table: DataTable;
  name: string;
  keyColumns: KeyColumnPair[];
  addedColumns: string[];
}

interface PreviewTableState {
  title: string;
  table: DataTable;
  selectedColumns?: string[];
  keepOpenOnSelect?: boolean;
  onSelectedColumnsChange?: (columns: string[]) => void;
  onColumnSelect?: (column: string) => void;
  onColumnDeselect?: (column: string) => void;
}

interface PreviewColumnOptions {
  selectedColumns?: string[];
  keepOpenOnSelect?: boolean;
  onSelectedColumnsChange?: (columns: string[]) => void;
  onColumnDeselect?: (column: string) => void;
}

type PreviewHandler = (
  title: string,
  table: DataTable,
  onColumnSelect?: (column: string) => void,
  options?: PreviewColumnOptions,
) => void;

type CoverageView = 'primaryAudit' | 'referenceAudit' | 'groupSummary';
type CoverageStatus = 'Found' | 'Not found' | 'Blank key' | 'Duplicate primary key' | 'Multiple reference matches';

interface CoverageResult {
  allPrimary: Record<string, CellValue>[];
  needsAttention: Record<string, CellValue>[];
  found: Record<string, CellValue>[];
  notInReference: Record<string, CellValue>[];
  matchedReference: Record<string, CellValue>[];
  referenceOnly: Record<string, CellValue>[];
  groupSummary: Record<string, CellValue>[];
  duplicateKeys: DuplicateKeyWarning[];
  blankPrimaryKeys: number;
  blankReferenceKeys: number;
  checkedAt: string;
}

const privacyKindOptions: PrivacyKind[] = ['email', 'string', 'id', 'date', 'number', 'category', 'value'];

const defaultOptions: ComparisonOptions = {
  trimWhitespace: true,
  caseInsensitive: false,
  blankEqualsNull: true,
  numericTextEqualsNumber: true,
};

const statusDescriptions: Record<'Only in new' | 'Missing in new' | 'Different' | 'Same', string> = {
  'Only in new': 'A matching key exists only in the New file.',
  'Missing in new': 'A matching key exists only in the Original file.',
  Different: 'The matching key exists in both files, but one or more selected comparison fields differ.',
  Same: 'The matching key exists in both files and all selected comparison fields are equivalent.',
};

const taskDetails: Record<AppTask, { title: string; description: string }> = {
  compare: {
    title: 'Compare files',
    description: 'Match rows, check selected fields, and export the differences.',
  },
  coverage: {
    title: 'Check coverage',
    description: 'Measure how much of a focused list exists in a larger population.',
  },
  enrich: {
    title: 'Add missing columns',
    description: 'Keep your file rows and pull selected fields from one or more reference reports.',
  },
  sample: {
    title: 'Build sample files',
    description: 'Generate test workbooks for trying the comparison flows.',
  },
  privacy: {
    title: 'Protect sensitive data',
    description: 'Pseudonymize, anonymize, or hide values before sharing a file.',
  },
};

function App() {
  const [step, setStep] = useState(0);
  const [task, setTask] = useState<AppTask>('compare');
  const [original, setOriginal] = useState<ParsedWorkbook | null>(null);
  const [next, setNext] = useState<ParsedWorkbook | null>(null);
  const [extraReferences, setExtraReferences] = useState<(ParsedWorkbook | null)[]>([]);
  const [originalError, setOriginalError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [extraReferenceErrors, setExtraReferenceErrors] = useState<(string | null)[]>([]);
  const [keyColumns, setKeyColumns] = useState<KeyColumnPair[]>([]);
  const [extraKeyColumns, setExtraKeyColumns] = useState<KeyColumnPair[][]>([]);
  const [comparedColumns, setComparedColumns] = useState<ComparedColumnPair[]>([]);
  const [addedColumns, setAddedColumns] = useState<string[]>([]);
  const [extraAddedColumns, setExtraAddedColumns] = useState<string[][]>([]);
  const [privacyTransforms, setPrivacyTransforms] = useState<PrivacyTransforms>({});
  const [privacyTypeOverrides, setPrivacyTypeOverrides] = useState<PrivacyTypeOverrides>({});
  const [options, setOptions] = useState(defaultOptions);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [enrichmentResult, setEnrichmentResult] = useState<EnrichmentResult | null>(null);
  const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);
  const [activeView, setActiveView] = useState<ResultView>('changed');
  const [coverageView, setCoverageView] = useState<CoverageView>('primaryAudit');
  const [coverageReferenceColumns, setCoverageReferenceColumns] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [runError, setRunError] = useState<string | null>(null);
  const [previewTable, setPreviewTable] = useState<PreviewTableState | null>(null);
  const [loadingSample, setLoadingSample] = useState<{ target: SampleTarget; kind: SampleKind } | null>(null);
  const [generatedSampleFiles, setGeneratedSampleFiles] = useState<GeneratedSampleFiles | null>(null);
  const [openingTask, setOpeningTask] = useState<AppTask | null>(null);

  const originalTable = original?.sheets[original.selectedSheetIndex] ?? null;
  const nextTable = next?.sheets[next.selectedSheetIndex] ?? null;
  const originalDisplayName = original?.displayName || original?.fileName || 'Original file';
  const nextDisplayName = next?.displayName || next?.fileName || 'New file';
  const enrichReferences = useMemo(() => {
    if (!next) return [];
    return [
      {
        index: 0,
        workbook: next,
        table: next.sheets[next.selectedSheetIndex],
        name: next.displayName || next.fileName || 'Reference file 1',
        keyColumns,
        addedColumns,
      },
      ...extraReferences.flatMap((workbook, slotIndex) => {
        if (!workbook) return [];
        return [{
          index: slotIndex + 1,
          workbook,
          table: workbook.sheets[workbook.selectedSheetIndex],
          name: workbook.displayName || workbook.fileName || `Reference file ${slotIndex + 2}`,
          keyColumns: extraKeyColumns[slotIndex] ?? [],
          addedColumns: extraAddedColumns[slotIndex] ?? [],
        }];
      }),
    ];
  }, [addedColumns, extraAddedColumns, extraKeyColumns, extraReferences, keyColumns, next]);
  const combinedAddedColumns = useMemo(
    () => enrichReferences.flatMap((reference) => reference.addedColumns),
    [enrichReferences],
  );
  const steps = useMemo(
    () => task === 'sample'
      ? ['Task', 'Build sample', 'Results']
      : task === 'privacy'
        ? ['Task', 'File', 'Protect data', 'Results']
        : task === 'enrich'
          ? ['Task', 'Files', 'Lookup chain', 'Privacy', 'Results']
          : task === 'coverage'
            ? ['Task', 'Files', 'Match population', 'Privacy', 'Results']
          : ['Task', 'Files', 'Match rows', 'Compare', 'Privacy', 'Results'],
    [task],
  );
  const workflowSteps = useMemo(() => steps.slice(1), [steps]);

  const matchingAnalysis = useMemo(() => {
    if (!originalTable || !nextTable || !canContinueMatching(keyColumns)) return null;
    return analyzeMatchingColumns(originalTable, nextTable, keyColumns);
  }, [originalTable, nextTable, keyColumns]);

  const commonColumns = useMemo(() => {
    if (!originalTable || !nextTable) return [];
    const newColumns = new Set(nextTable.columns);
    return originalTable.columns.filter((column) => newColumns.has(column));
  }, [originalTable, nextTable]);

  async function handleFile(side: 'original' | 'new', file: File) {
    const setWorkbook = side === 'original' ? setOriginal : setNext;
    const setError = side === 'original' ? setOriginalError : setNextError;
    setError(null);
    try {
      const parsed = await parseFile(file);
      setWorkbook(parsed);
      clearDownstream();
      setStep(1);
    } catch (error) {
      setWorkbook(null);
      clearDownstream();
      setError(error instanceof Error ? error.message : 'The file could not be read.');
    }
  }

  async function loadSampleFile(target: SampleTarget, kind: SampleKind) {
    const fileName = sampleFileName(target, kind, task);

    setLoadingSample({ target, kind });
    if (target === 'original') setOriginalError(null);
    else if (target === 'new') setNextError(null);
    else {
      const index = extraReferenceIndex(target);
      setExtraReferenceErrors((errors) => errors.map((error, itemIndex) => (itemIndex === index ? null : error)));
    }
    try {
      const file = await fetchSampleFile(fileName);
      const parsed = await parseFile(file);
      const sampleWorkbook = {
        ...parsed,
        displayName: sampleDisplayName(target, kind, task),
        description: sampleFileDescription(target, kind, task),
      };
      if (target === 'original') setOriginal(sampleWorkbook);
      else if (target === 'new') setNext(sampleWorkbook);
      else {
        const index = extraReferenceIndex(target);
        setExtraReferences((references) => references.map((reference, itemIndex) => (
          itemIndex === index ? sampleWorkbook : reference
        )));
      }
      clearDownstream();
      setStep(1);
    } catch (error) {
      clearDownstream();
      const message = error instanceof Error ? error.message : 'Sample data could not be loaded.';
      if (target === 'original') {
        setOriginal(null);
        setOriginalError(message);
      } else if (target === 'new') {
        setNext(null);
        setNextError(message);
      } else {
        const index = extraReferenceIndex(target);
        setExtraReferences((references) => references.map((reference, itemIndex) => (
          itemIndex === index ? null : reference
        )));
        setExtraReferenceErrors((errors) => errors.map((existingError, itemIndex) => (
          itemIndex === index ? message : existingError
        )));
      }
    } finally {
      setLoadingSample(null);
    }
  }

  async function loadGeneratedSampleFiles(files: GeneratedSampleFiles) {
    clearDownstream();
    setGeneratedSampleFiles(files);
    setOriginal(null);
    setNext(null);
    setOriginalError(null);
    setNextError(null);
    setStep(2);
  }

  async function handleExtraReferenceFile(index: number, file: File) {
    setExtraReferenceErrors((errors) => errors.map((error, itemIndex) => (itemIndex === index ? null : error)));
    try {
      const parsed = await parseFile(file);
      setExtraReferences((references) => references.map((reference, itemIndex) => (
        itemIndex === index ? parsed : reference
      )));
      clearDownstream();
      setStep(1);
    } catch (error) {
      setExtraReferences((references) => references.map((reference, itemIndex) => (
        itemIndex === index ? null : reference
      )));
      clearDownstream();
      setExtraReferenceErrors((errors) => errors.map((existingError, itemIndex) => (
        itemIndex === index ? (error instanceof Error ? error.message : 'The file could not be read.') : existingError
      )));
    }
  }

  function handleSheetChange(side: 'original' | 'new', index: number) {
    const updater = (workbook: ParsedWorkbook | null) =>
      workbook ? { ...workbook, selectedSheetIndex: index } : workbook;
    if (side === 'original') setOriginal(updater);
    else setNext(updater);
    clearDownstream();
  }

  function handleExtraReferenceSheetChange(referenceIndex: number, sheetIndex: number) {
    setExtraReferences((references) => references.map((workbook, itemIndex) => (
      itemIndex === referenceIndex && workbook ? { ...workbook, selectedSheetIndex: sheetIndex } : workbook
    )));
    clearDownstream();
  }

  function handleFileDetailsChange(
    side: 'original' | 'new',
    details: { displayName?: string; description?: string },
  ) {
    const updater = (workbook: ParsedWorkbook | null) =>
      workbook ? { ...workbook, ...details } : workbook;
    if (side === 'original') setOriginal(updater);
    else setNext(updater);
  }

  function handleExtraReferenceDetailsChange(
    index: number,
    details: { displayName?: string; description?: string },
  ) {
    setExtraReferences((references) => references.map((workbook, itemIndex) => (
      itemIndex === index && workbook ? { ...workbook, ...details } : workbook
    )));
  }

  function addReferenceSlot() {
    setExtraReferences((references) => [...references, null]);
    setExtraReferenceErrors((errors) => [...errors, null]);
    setExtraKeyColumns((columns) => [...columns, []]);
    setExtraAddedColumns((columns) => [...columns, []]);
  }

  function removeExtraReference(index: number) {
    setExtraReferences((references) => references.filter((_, itemIndex) => itemIndex !== index));
    setExtraReferenceErrors((errors) => errors.filter((_, itemIndex) => itemIndex !== index));
    setExtraKeyColumns((columns) => columns.filter((_, itemIndex) => itemIndex !== index));
    setExtraAddedColumns((columns) => columns.filter((_, itemIndex) => itemIndex !== index));
    clearDownstream();
  }

  function clearDownstream() {
    setGeneratedSampleFiles(null);
    setKeyColumns([]);
    setExtraKeyColumns([]);
    setComparedColumns([]);
    setAddedColumns([]);
    setExtraAddedColumns([]);
    setCoverageReferenceColumns([]);
    setPrivacyTransforms({});
    setPrivacyTypeOverrides({});
    setResult(null);
    setEnrichmentResult(null);
    setCoverageResult(null);
    setRunError(null);
  }

  function goBack() {
    setStep((value) => (task === 'sample' && value === 2 ? 1 : value - 1));
  }

  function startTask(nextTask: AppTask) {
    if (openingTask) return;
    setTask(nextTask);
    clearDownstream();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(1);
      return;
    }
    setOpeningTask(nextTask);
    window.setTimeout(() => {
      setStep(1);
      setOpeningTask(null);
    }, 130);
  }

  function continueFromFiles() {
    if (!originalTable || !nextTable) return;
    if (keyColumns.length === 0) {
      setKeyColumns([{ original: '', new: '' }]);
    }
    if (task === 'enrich') {
      setExtraKeyColumns((columns) => extraReferences.map((reference, index) => {
        if (!reference) return columns[index] ?? [];
        return columns[index]?.length ? columns[index] : [{ original: '', new: '' }];
      }));
    }
    setStep(2);
  }

  function continueFromMatching() {
    if (!originalTable || !nextTable) return;
    if (task === 'compare' && comparedColumns.length === 0) {
      setComparedColumns([{ original: '', new: '' }]);
    }
    setStep(3);
  }

  function runComparison() {
    if (!originalTable || !nextTable) return;
    try {
      const config: ComparisonConfig = { keyColumns, comparedColumns, options };
      const comparison = compareTables(originalTable, nextTable, config);
      setResult(comparison);
      setEnrichmentResult(null);
      setCoverageResult(null);
      setRunError(null);
      setActiveView(defaultResultView(comparison));
      setStep(5);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The comparison could not be completed.');
    }
  }

  function runCoverage() {
    if (!originalTable || !nextTable) return;
    try {
      const coverage = buildCoverageResult(originalTable, nextTable, keyColumns);
      setCoverageResult(coverage);
      setCoverageReferenceColumns((columns) => (
        columns.length > 0 ? columns : suggestedCoverageReferenceColumns(nextTable, keyColumns)
      ));
      setResult(null);
      setEnrichmentResult(null);
      setRunError(null);
      setCoverageView(defaultCoverageView(coverage));
      setStep(4);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The coverage check could not be completed.');
    }
  }

  function runEnrichment() {
    if (!originalTable || !nextTable) return;
    try {
      let currentTable: DataTable = originalTable;
      let matchedRows = 0;
      let unmatchedRows = 0;
      let builtAt = '';
      const duplicateKeys: EnrichmentResult['duplicateKeys'] = [];
      const allAddedColumns: string[] = [];

      enrichReferences.forEach((reference) => {
        const partial = enrichTable(currentTable, reference.table, {
          keyColumns: reference.keyColumns,
          addedColumns: reference.addedColumns,
        });
        matchedRows += partial.matchedRows;
        unmatchedRows += partial.unmatchedRows;
        builtAt = partial.builtAt;
        duplicateKeys.push(...partial.duplicateKeys);
        allAddedColumns.push(...partial.addedColumns);
        currentTable = {
          columns: partial.columns,
          rows: partial.rows,
          sourceName: originalTable.sourceName,
          sheetName: originalTable.sheetName,
        };
      });

      const enrichment: EnrichmentResult = {
        rows: currentTable.rows,
        columns: currentTable.columns,
        matchedRows,
        unmatchedRows,
        addedColumns: allAddedColumns,
        duplicateKeys,
        builtAt,
      };
      setEnrichmentResult(enrichment);
      setResult(null);
      setCoverageResult(null);
      setRunError(null);
      setStep(4);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The enriched table could not be built.');
    }
  }

  function selectedConfig(): ComparisonConfig {
    return { keyColumns, comparedColumns, options };
  }

  function selectedEnrichmentConfig(): EnrichmentConfig {
    return { keyColumns, addedColumns };
  }

  function setReferenceKeyColumns(referenceIndex: number, columns: KeyColumnPair[]) {
    if (referenceIndex === 0) {
      setKeyColumns(columns);
      return;
    }
    setExtraKeyColumns((current) => {
      const nextColumns = [...current];
      nextColumns[referenceIndex - 1] = columns;
      return nextColumns;
    });
  }

  function setReferenceAddedColumns(referenceIndex: number, columns: string[]) {
    if (referenceIndex === 0) {
      setAddedColumns(columns);
      return;
    }
    setExtraAddedColumns((current) => {
      const nextColumns = [...current];
      nextColumns[referenceIndex - 1] = columns;
      return nextColumns;
    });
  }

  function canVisitStep(stepIndex: number): boolean {
    if (task === 'sample') {
      if (stepIndex === 0) return true;
      if (stepIndex === 1) return true;
      if (stepIndex === 2) return Boolean(generatedSampleFiles);
      return false;
    }
    if (task === 'privacy') {
      if (stepIndex === 0) return true;
      if (stepIndex === 1) return true;
      if (stepIndex === 2) return Boolean(originalTable);
      if (stepIndex === 3) return Boolean(originalTable);
      return false;
    }
    if (stepIndex === 0) return true;
    if (stepIndex === 1) return true;
    if (stepIndex === 2) return Boolean(originalTable && nextTable);
    if (task === 'enrich') {
      if (stepIndex === 3) return Boolean(originalTable && nextTable && canRunEnrichmentReferences(enrichReferences));
      if (stepIndex === 4) return Boolean(enrichmentResult);
      return false;
    }
    if (task === 'coverage') {
      if (stepIndex === 3) return Boolean(originalTable && nextTable && canContinueMatching(keyColumns));
      if (stepIndex === 4) return Boolean(coverageResult);
      return false;
    }
    if (stepIndex === 3) return Boolean(originalTable && nextTable && canContinueMatching(keyColumns));
    if (stepIndex === 4) return Boolean(originalTable && nextTable && canContinueMatching(keyColumns));
    if (stepIndex === 5) return Boolean(result);
    return false;
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <h1>Helper</h1>
          <p>Local CSV/XLSX comparison and cleanup.</p>
        </div>
      </header>

      <section className={`workspace ${step > 0 ? 'workspace-open' : ''}`} aria-live="polite">
        {step > 0 ? (
          <>
            <TaskFlowHeader task={task} backLabel={step === 1 ? 'Change task' : 'Back'} onBack={goBack} />
            <WizardStepper
              currentStep={step - 1}
              steps={workflowSteps}
              canVisitStep={(stepIndex) => canVisitStep(stepIndex + 1)}
              onStepSelect={(stepIndex) => setStep(stepIndex + 1)}
            />
          </>
        ) : null}

        {step === 0 && (
          <TaskStep openingTask={openingTask} onStartTask={startTask} />
        )}

        {step === 1 && task === 'sample' && (
          <SampleDataBuilder onGenerate={loadGeneratedSampleFiles} />
        )}

        {step === 1 && task === 'privacy' && (
          <PrivacyFileStep
            workbook={original}
            error={originalError}
            onFile={(file) => handleFile('original', file)}
            onSheetChange={(index) => handleSheetChange('original', index)}
            onDetailsChange={(details) => handleFileDetailsChange('original', details)}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 1 && task !== 'sample' && task !== 'privacy' && (
          <FilesStep
            task={task}
            original={original}
            next={next}
            extraReferences={extraReferences}
            originalError={originalError}
            nextError={nextError}
            extraReferenceErrors={extraReferenceErrors}
            onFile={handleFile}
            onExtraReferenceFile={handleExtraReferenceFile}
            onSheetChange={handleSheetChange}
            onExtraReferenceSheetChange={handleExtraReferenceSheetChange}
            onDetailsChange={handleFileDetailsChange}
            onExtraReferenceDetailsChange={handleExtraReferenceDetailsChange}
            onAddReference={addReferenceSlot}
            onRemoveExtraReference={removeExtraReference}
            onLoadSampleFile={loadSampleFile}
            loadingSample={loadingSample}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 2 && originalTable && nextTable && task === 'compare' && (
          <MatchRowsStep
            original={originalTable}
            next={nextTable}
            originalName={originalDisplayName}
            nextName={nextDisplayName}
            keyColumns={keyColumns}
            analysis={matchingAnalysis}
            setKeyColumns={setKeyColumns}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 2 && originalTable && nextTable && task === 'coverage' && (
          <CoverageMatchStep
            primary={originalTable}
            reference={nextTable}
            primaryName={originalDisplayName}
            referenceName={nextDisplayName}
            keyColumns={keyColumns}
            analysis={matchingAnalysis}
            setKeyColumns={setKeyColumns}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 2 && originalTable && task === 'enrich' && (
          <EnrichChainStep
            base={originalTable}
            baseName={originalDisplayName}
            references={enrichReferences}
            setReferenceKeyColumns={setReferenceKeyColumns}
            setReferenceAddedColumns={setReferenceAddedColumns}
            runError={runError}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 2 && task === 'sample' && generatedSampleFiles && (
          <SampleFilesReadyStep files={generatedSampleFiles} />
        )}

        {step === 2 && originalTable && task === 'privacy' && (
          <PrivacyStep
            columns={privacyColumnInfos(task, originalTable, originalTable, [], [])}
            transforms={privacyTransforms}
            typeOverrides={privacyTypeOverrides}
            setTransforms={setPrivacyTransforms}
            setTypeOverrides={setPrivacyTypeOverrides}
          />
        )}

        {step === 3 && originalTable && task === 'privacy' && original && (
          <PrivacyResultsStep
            table={originalTable}
            workbook={original}
            privacyTransforms={privacyTransforms}
            privacyTypeOverrides={privacyTypeOverrides}
            search={search}
            setSearch={setSearch}
          />
        )}

        {step === 3 && originalTable && nextTable && task === 'compare' && (
          <CompareStep
            original={originalTable}
            next={nextTable}
            originalName={originalDisplayName}
            nextName={nextDisplayName}
            commonColumns={commonColumns}
            keyColumns={keyColumns}
            comparedColumns={comparedColumns}
            options={options}
            setComparedColumns={setComparedColumns}
            setOptions={setOptions}
            runError={runError}
            onPreview={(title, table, onColumnSelect, options) => setPreviewTable({ title, table, onColumnSelect, ...options })}
          />
        )}

        {step === 3 && originalTable && nextTable && task === 'enrich' && (
          <PrivacyStep
            columns={enrichmentPrivacyColumnInfos(originalTable, enrichReferences)}
            transforms={privacyTransforms}
            typeOverrides={privacyTypeOverrides}
            setTransforms={setPrivacyTransforms}
            setTypeOverrides={setPrivacyTypeOverrides}
          />
        )}

        {step === 3 && originalTable && nextTable && task === 'coverage' && (
          <PrivacyStep
            columns={privacyColumnInfos(task, originalTable, nextTable, [], [])}
            transforms={privacyTransforms}
            typeOverrides={privacyTypeOverrides}
            setTransforms={setPrivacyTransforms}
            setTypeOverrides={setPrivacyTypeOverrides}
          />
        )}

        {step === 4 && originalTable && nextTable && task === 'compare' && (
          <PrivacyStep
            columns={privacyColumnInfos(task, originalTable, nextTable, comparedColumns, combinedAddedColumns)}
            transforms={privacyTransforms}
            typeOverrides={privacyTypeOverrides}
            setTransforms={setPrivacyTransforms}
            setTypeOverrides={setPrivacyTypeOverrides}
          />
        )}

        {step === 5 && task === 'compare' && result && originalTable && nextTable && original && next && (
          <ResultsStep
            result={result}
            privacyTransforms={privacyTransforms}
            privacyTypeOverrides={privacyTypeOverrides}
            activeView={activeView}
            setActiveView={setActiveView}
            search={search}
            setSearch={setSearch}
            originalTable={originalTable}
            nextTable={nextTable}
            originalWorkbook={original}
            nextWorkbook={next}
            config={selectedConfig()}
          />
        )}

        {step === 4 && task === 'enrich' && enrichmentResult && originalTable && nextTable && original && next && (
          <EnrichmentResultsStep
            result={enrichmentResult}
            privacyTransforms={privacyTransforms}
            privacyTypeOverrides={privacyTypeOverrides}
            search={search}
            setSearch={setSearch}
            baseWorkbook={original}
            referenceWorkbook={next}
            config={selectedEnrichmentConfig()}
          />
        )}

        {step === 4 && task === 'coverage' && coverageResult && originalTable && nextTable && original && next && (
          <CoverageResultsStep
            result={coverageResult}
            privacyTransforms={privacyTransforms}
            privacyTypeOverrides={privacyTypeOverrides}
            activeView={coverageView}
            setActiveView={setCoverageView}
            search={search}
            setSearch={setSearch}
            primaryTable={originalTable}
            referenceTable={nextTable}
            primaryWorkbook={original}
            referenceWorkbook={next}
            keyColumns={keyColumns}
            selectedReferenceColumns={coverageReferenceColumns}
            setSelectedReferenceColumns={setCoverageReferenceColumns}
          />
        )}

        {step > 0 ? (
          <footer className="actions">
            {step === 1 && task === 'privacy' ? (
              <button className="primary" type="button" disabled={!originalTable} onClick={() => setStep(2)}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 1 && task !== 'sample' && task !== 'privacy' ? (
              <button className="primary" type="button" disabled={!originalTable || !nextTable} onClick={continueFromFiles}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 2 && task === 'privacy' ? (
              <button className="primary" type="button" onClick={() => setStep(3)}>
                Build protected file <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 2 && task === 'enrich' ? (
              <button className="primary" type="button" disabled={!canRunEnrichmentReferences(enrichReferences)} onClick={() => setStep(3)}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 2 && task === 'compare' ? (
              <button className="primary" type="button" disabled={!canContinueMatching(keyColumns)} onClick={continueFromMatching}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 2 && task === 'coverage' ? (
              <button className="primary" type="button" disabled={!canContinueMatching(keyColumns)} onClick={() => setStep(3)}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 3 && task === 'compare' ? (
              <button className="primary" type="button" disabled={!canRunComparison(comparedColumns)} onClick={() => setStep(4)}>
                Continue <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 3 && task === 'enrich' ? (
              <div className="run-action">
                {!canRunEnrichmentReferences(enrichReferences) ? (
                  <span className="action-hint">Complete each lookup match and choose at least one column to add.</span>
                ) : null}
                <button className="primary" type="button" disabled={!canRunEnrichmentReferences(enrichReferences)} onClick={runEnrichment}>
                  Build combined report <ArrowRight size={18} />
                </button>
              </div>
            ) : null}
            {step === 3 && task === 'coverage' ? (
              <button className="primary" type="button" disabled={!canContinueMatching(keyColumns)} onClick={runCoverage}>
                Check coverage <ArrowRight size={18} />
              </button>
            ) : null}
            {step === 4 && task === 'compare' ? (
              <div className="run-action">
                {!canRunComparison(comparedColumns) ? (
                  <span className="action-hint">Select or map at least one field to compare.</span>
                ) : null}
                <button className="primary" type="button" disabled={!canRunComparison(comparedColumns)} onClick={runComparison}>
                  Run comparison <ArrowRight size={18} />
                </button>
              </div>
            ) : null}
          </footer>
        ) : null}
      </section>
      {previewTable ? (
        <DataPreviewModal
          title={previewTable.title}
          table={previewTable.table}
          selectedColumns={previewTable.selectedColumns}
  keepOpenOnSelect={previewTable.keepOpenOnSelect}
          onSelectedColumnsChange={previewTable.onSelectedColumnsChange}
          onColumnSelect={previewTable.onColumnSelect}
          onColumnDeselect={previewTable.onColumnDeselect}
          onClose={() => setPreviewTable(null)}
        />
      ) : null}
    </main>
  );
}

interface FilesStepProps {
  task: AppTask;
  original: ParsedWorkbook | null;
  next: ParsedWorkbook | null;
  extraReferences: (ParsedWorkbook | null)[];
  originalError: string | null;
  nextError: string | null;
  extraReferenceErrors: (string | null)[];
  onFile: (side: 'original' | 'new', file: File) => void;
  onExtraReferenceFile: (index: number, file: File) => void;
  onSheetChange: (side: 'original' | 'new', index: number) => void;
  onExtraReferenceSheetChange: (referenceIndex: number, sheetIndex: number) => void;
  onDetailsChange: (side: 'original' | 'new', details: { displayName?: string; description?: string }) => void;
  onExtraReferenceDetailsChange: (index: number, details: { displayName?: string; description?: string }) => void;
  onAddReference: () => void;
  onRemoveExtraReference: (index: number) => void;
  onLoadSampleFile: (target: SampleTarget, kind: SampleKind) => void;
  loadingSample: { target: SampleTarget; kind: SampleKind } | null;
  onPreview: PreviewHandler;
}

function FilesStep({
  task,
  original,
  next,
  extraReferences,
  originalError,
  nextError,
  extraReferenceErrors,
  onFile,
  onExtraReferenceFile,
  onSheetChange,
  onExtraReferenceSheetChange,
  onDetailsChange,
  onExtraReferenceDetailsChange,
  onAddReference,
  onRemoveExtraReference,
  onLoadSampleFile,
  loadingSample,
  onPreview,
}: FilesStepProps) {
  const [openSampleMenu, setOpenSampleMenu] = useState<SampleTarget | null>(null);
  const originalTitle = task === 'enrich' ? 'File to update' : task === 'coverage' ? 'Primary list' : 'Original file';
  const nextTitle = task === 'enrich' ? 'Reference file' : task === 'coverage' ? 'Reference population' : 'New file';
  const originalHelper = task === 'enrich'
    ? 'The excerpt or report that is missing one or more columns.'
    : task === 'coverage'
      ? 'The focused export or list whose rows you want to audit.'
      : 'The older or baseline dataset.';
  const nextHelper = task === 'enrich'
    ? 'The lookup report that contains the missing columns.'
    : task === 'coverage'
      ? 'The broader dataset used to check whether primary rows are represented.'
      : 'The newer dataset to compare against the original.';

  return (
    <div className="step-content">
      <div className="section-heading split-heading">
        <div>
          <h2>Choose files</h2>
          <p>Your files are processed locally in your browser and are not uploaded.</p>
        </div>
      </div>
      {task === 'enrich' ? (
        <div className="analysis-card success">
          <strong>Example: add Created Date from an adoption report.</strong>
          <p>Use your excerpt as the file to update, use the adoption report as the reference file, match on Email, then add Created Date.</p>
        </div>
      ) : null}
      {task === 'compare' || task === 'coverage' ? (
        <div className="file-grid">
          <FileDropZone
            title={originalTitle}
            helper={originalHelper}
            workbook={original}
            error={originalError}
            onFile={(file) => onFile('original', file)}
            onSheetChange={(index) => onSheetChange('original', index)}
            onDetailsChange={(details) => onDetailsChange('original', details)}
            headerActions={
              <>
                {task === 'coverage' ? (
                  <CoverageFileInfo title="Primary list" description="Use this for the file whose rows you want to audit. Results start from this list and explain whether each row can be found in the reference population." />
                ) : null}
                <SampleFileMenu
                  target="original"
                  openTarget={openSampleMenu}
                  setOpenTarget={setOpenSampleMenu}
                  loadingSample={loadingSample}
                  onLoadSampleFile={onLoadSampleFile}
                />
              </>
            }
            onPreview={onPreview}
          />
          <FileDropZone
            title={nextTitle}
            helper={nextHelper}
            workbook={next}
            error={nextError}
            onFile={(file) => onFile('new', file)}
            onSheetChange={(index) => onSheetChange('new', index)}
            onDetailsChange={(details) => onDetailsChange('new', details)}
            headerActions={
              <>
                {task === 'coverage' ? (
                  <CoverageFileInfo title="Reference population" description="Use this for the larger or authoritative dataset you want to check against. Reference audit views show which reference rows were matched or left unmatched." />
                ) : null}
                <SampleFileMenu
                  target="new"
                  openTarget={openSampleMenu}
                  setOpenTarget={setOpenSampleMenu}
                  loadingSample={loadingSample}
                  onLoadSampleFile={onLoadSampleFile}
                />
              </>
            }
            onPreview={onPreview}
          />
        </div>
      ) : (
        <div className="enrich-file-layout">
          <FileDropZone
            title={originalTitle}
            helper={originalHelper}
            workbook={original}
            error={originalError}
            onFile={(file) => onFile('original', file)}
            onSheetChange={(index) => onSheetChange('original', index)}
            onDetailsChange={(details) => onDetailsChange('original', details)}
            headerActions={
              <SampleFileMenu
                target="original"
                openTarget={openSampleMenu}
                setOpenTarget={setOpenSampleMenu}
                loadingSample={loadingSample}
                onLoadSampleFile={onLoadSampleFile}
              />
            }
            onPreview={onPreview}
          />
          <div className="reference-file-section">
            <h3>Reference files</h3>
            <p>Add one or more lookup files that contain the columns you want to bring in.</p>
            <div className="reference-file-strip">
              <div className="reference-file-card">
                <FileDropZone
                  title={nextTitle}
                  helper={nextHelper}
                  workbook={next}
                  error={nextError}
                  onFile={(file) => onFile('new', file)}
                  onSheetChange={(index) => onSheetChange('new', index)}
                  onDetailsChange={(details) => onDetailsChange('new', details)}
                  headerActions={
                    <SampleFileMenu
                      target="new"
                      openTarget={openSampleMenu}
                      setOpenTarget={setOpenSampleMenu}
                      loadingSample={loadingSample}
                      onLoadSampleFile={onLoadSampleFile}
                    />
                  }
                  onPreview={onPreview}
                />
              </div>
              {extraReferences.map((reference, index) => (
                <div className="reference-file-card" key={index}>
                  <FileDropZone
                    title={`Reference file ${index + 2}`}
                    helper="Another lookup file with columns to add."
                    workbook={reference}
                    error={extraReferenceErrors[index] ?? null}
                    onFile={(file) => onExtraReferenceFile(index, file)}
                    onSheetChange={(sheetIndex) => onExtraReferenceSheetChange(index, sheetIndex)}
                    onDetailsChange={(details) => onExtraReferenceDetailsChange(index, details)}
                    onPreview={onPreview}
                    headerActions={
                      <>
                        <SampleFileMenu
                          target={`extra-${index}`}
                          openTarget={openSampleMenu}
                          setOpenTarget={setOpenSampleMenu}
                          loadingSample={loadingSample}
                          onLoadSampleFile={onLoadSampleFile}
                        />
                        <button className="icon-button" type="button" aria-label={`Remove reference file ${index + 2}`} onClick={() => onRemoveExtraReference(index)}>
                          <Trash2 size={17} />
                        </button>
                      </>
                    }
                  />
                </div>
              ))}
              <button className="add-reference-card" type="button" onClick={onAddReference} aria-label="Add another reference file">
                <Plus size={34} />
                <span>Add reference file</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoverageFileInfo({ title, description }: { title: string; description: string }) {
  return (
    <button className="info-button" type="button" aria-label={`${title}: ${description}`} title={description}>
      <Info size={15} aria-hidden="true" />
      <span className="tooltip" role="tooltip">{description}</span>
    </button>
  );
}

interface PrivacyFileStepProps {
  workbook: ParsedWorkbook | null;
  error: string | null;
  onFile: (file: File) => void;
  onSheetChange: (index: number) => void;
  onDetailsChange: (details: { displayName?: string; description?: string }) => void;
  onPreview: PreviewHandler;
}

function PrivacyFileStep({
  workbook,
  error,
  onFile,
  onSheetChange,
  onDetailsChange,
  onPreview,
}: PrivacyFileStepProps) {
  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Choose file</h2>
        <p>Select the CSV or workbook you want to export with protected values.</p>
      </div>
      <FileDropZone
        title="File to protect"
        helper="The original file stays unchanged. Helper only transforms the exported copy."
        workbook={workbook}
        error={error}
        onFile={onFile}
        onSheetChange={onSheetChange}
        onDetailsChange={onDetailsChange}
        onPreview={onPreview}
      />
    </div>
  );
}

function SampleFileMenu({
  target,
  openTarget,
  setOpenTarget,
  loadingSample,
  onLoadSampleFile,
}: {
  target: SampleTarget;
  openTarget: SampleTarget | null;
  setOpenTarget: (target: SampleTarget | null) => void;
  loadingSample: { target: SampleTarget; kind: SampleKind } | null;
  onLoadSampleFile: (target: SampleTarget, kind: SampleKind) => void;
}) {
  const loadingKind = loadingSample?.target === target ? loadingSample.kind : null;
  const disabled = Boolean(loadingSample);
  const isOpen = openTarget === target;
  const toggleMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setOpenTarget(isOpen ? null : target);
  };
  const selectSample = (kind: SampleKind) => {
    setOpenTarget(null);
    onLoadSampleFile(target, kind);
  };

  return (
    <details className="sample-menu" open={isOpen}>
      <summary aria-label="Sample files" title="Sample files" onClick={toggleMenu}>
        {loadingKind ? <span className="spinner" aria-hidden="true" /> : <MoreVertical size={18} />}
      </summary>
      <div className="sample-menu-panel">
        <button type="button" disabled={disabled} onClick={() => selectSample('clean')}>
          {loadingKind === 'clean' ? <span className="spinner" aria-hidden="true" /> : null}
          Clean sample
        </button>
        <button type="button" disabled={disabled} onClick={() => selectSample('messy')}>
          {loadingKind === 'messy' ? <span className="spinner" aria-hidden="true" /> : null}
          Messy sample
        </button>
      </div>
    </details>
  );
}

function SampleFilesReadyStep({ files }: { files: GeneratedSampleFiles }) {
  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Sample files ready</h2>
        <p>Download the generated workbooks and use them wherever you want to test file comparison.</p>
      </div>
      <div className="generated-files">
        <GeneratedFileCard file={files.originalFile} label="Original workbook" />
        <GeneratedFileCard file={files.newFile} label="Updated workbook" />
      </div>
    </div>
  );
}

function GeneratedFileCard({ file, label }: { file: File; label: string }) {
  return (
    <div className="generated-file-card">
      <div>
        <strong>{label}</strong>
        <p>{file.name} - {formatFileSize(file.size)}</p>
      </div>
      <button type="button" onClick={() => downloadFile(file)}>
        <Download size={18} /> Download
      </button>
    </div>
  );
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

interface TaskStepProps {
  openingTask: AppTask | null;
  onStartTask: (task: AppTask) => void;
}

function TaskStep({ openingTask, onStartTask }: TaskStepProps) {
  const taskCardClass = (taskName: AppTask) => {
    if (!openingTask) return 'task-card';
    return `task-card ${openingTask === taskName ? 'opening' : 'fading'}`;
  };

  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Choose task</h2>
        <p>Pick what you want to do. Each task opens its own workflow.</p>
      </div>
      <div className={`task-grid ${openingTask ? 'task-grid-opening' : ''}`}>
        <button
          className={taskCardClass('compare')}
          type="button"
          disabled={Boolean(openingTask)}
          onClick={() => onStartTask('compare')}
        >
          <span className="task-icon" aria-hidden="true">=</span>
          <span>
            <strong>Compare files</strong>
            <small>Match rows, then check selected fields for differences.</small>
          </span>
        </button>
        <button
          className={taskCardClass('coverage')}
          type="button"
          disabled={Boolean(openingTask)}
          onClick={() => onStartTask('coverage')}
        >
          <span className="task-icon" aria-hidden="true">%</span>
          <span>
            <strong>Check coverage</strong>
            <small>See how much of one list exists in a larger population.</small>
          </span>
        </button>
        <button
          className={taskCardClass('enrich')}
          type="button"
          disabled={Boolean(openingTask)}
          onClick={() => onStartTask('enrich')}
        >
          <span className="task-icon" aria-hidden="true">+</span>
          <span>
            <strong>Add missing columns</strong>
            <small>Keep your file rows and pull fields from a reference report.</small>
          </span>
        </button>
        <button
          className={taskCardClass('sample')}
          type="button"
          disabled={Boolean(openingTask)}
          onClick={() => onStartTask('sample')}
        >
          <span className="task-icon" aria-hidden="true">*</span>
          <span>
            <strong>Build sample files</strong>
            <small>Generate original and updated workbooks for testing.</small>
          </span>
        </button>
        <button
          className={taskCardClass('privacy')}
          type="button"
          disabled={Boolean(openingTask)}
          onClick={() => onStartTask('privacy')}
        >
          <span className="task-icon" aria-hidden="true"><Lock size={20} /></span>
          <span>
            <strong>Protect sensitive data</strong>
            <small>Pseudonymize, anonymize, or hide values in one file.</small>
          </span>
        </button>
      </div>
    </div>
  );
}

function TaskFlowHeader({ task, backLabel, onBack }: { task: AppTask; backLabel: string; onBack: () => void }) {
  const details = taskDetails[task];
  return (
    <div className="task-flow-header">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> {backLabel}
      </button>
      <div>
        <h2>{details.title}</h2>
        <p>{details.description}</p>
      </div>
    </div>
  );
}

interface MatchRowsStepProps {
  original: DataTable;
  next: DataTable;
  originalName: string;
  nextName: string;
  keyColumns: KeyColumnPair[];
  analysis: ReturnType<typeof analyzeMatchingColumns> | null;
  setKeyColumns: (columns: KeyColumnPair[]) => void;
  onPreview: PreviewHandler;
}

function MatchRowsStep({ original, next, originalName, nextName, keyColumns, analysis, setKeyColumns, onPreview }: MatchRowsStepProps) {
  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Match rows</h2>
        <p>Which column identifies the same row in both files?</p>
      </div>
      <div className="toolbar">
        <button className="secondary compact" type="button" onClick={() => {
          const suggestions = suggestedColumnPairs(original, next);
          if (suggestions.length > 0) setKeyColumns(suggestions);
        }}>
          <Sparkles size={16} /> Suggest matches
        </button>
      </div>
      <div className="mapping-list">
        {keyColumns.map((pair, index) => (
          <div className="mapping-row" key={index}>
            <div className="mapping-field">
              <span className="field-label-row">
                <label htmlFor={`match-original-${index}`}>{originalName}</label>
                <button className="text-icon-button" type="button" onClick={() => onPreview(originalName, original, (column) => updateKeyPair(keyColumns, setKeyColumns, index, 'original', column), {
                  selectedColumns: pair.original ? [pair.original] : [],
                  onColumnDeselect: () => updateKeyPair(keyColumns, setKeyColumns, index, 'original', ''),
                })}>
                  <Eye size={16} /> Preview
                </button>
              </span>
              <select
                id={`match-original-${index}`}
                value={pair.original}
                onChange={(event) => updateKeyPair(keyColumns, setKeyColumns, index, 'original', event.target.value)}
              >
                <option value="">Choose column</option>
                {original.columns.map((column) => <option key={column}>{column}</option>)}
              </select>
            </div>
            <span className="equals">=</span>
            <div className="mapping-field">
              <span className="field-label-row">
                <label htmlFor={`match-new-${index}`}>{nextName}</label>
                <button className="text-icon-button" type="button" onClick={() => onPreview(nextName, next, (column) => updateKeyPair(keyColumns, setKeyColumns, index, 'new', column), {
                  selectedColumns: pair.new ? [pair.new] : [],
                  onColumnDeselect: () => updateKeyPair(keyColumns, setKeyColumns, index, 'new', ''),
                })}>
                  <Eye size={16} /> Preview
                </button>
              </span>
              <select
                id={`match-new-${index}`}
                value={pair.new}
                onChange={(event) => updateKeyPair(keyColumns, setKeyColumns, index, 'new', event.target.value)}
              >
                <option value="">Choose column</option>
                {next.columns.map((column) => <option key={column}>{column}</option>)}
              </select>
            </div>
            {keyColumns.length > 1 ? (
              <button className="icon-button" type="button" aria-label="Remove matching column" onClick={() => setKeyColumns(keyColumns.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        className="secondary compact"
        type="button"
        onClick={() => setKeyColumns([...keyColumns, { original: '', new: '' }])}
      >
        <Plus size={18} /> Add another matching column
      </button>
      {analysis ? (
        <div className={`analysis-card ${analysis.originalDuplicates || analysis.newDuplicates ? 'warning' : 'success'}`}>
          <strong>
            {analysis.approximateMatches.toLocaleString()} matching values found.
          </strong>
          <p>
            Original: {analysis.originalUnique.toLocaleString()} unique values,
            {' '}{analysis.originalDuplicates.toLocaleString()} duplicate rows. New:
            {' '}{analysis.newUnique.toLocaleString()} unique values,
            {' '}{analysis.newDuplicates.toLocaleString()} duplicate rows.
          </p>
          {analysis.originalDuplicates || analysis.newDuplicates ? (
            <p>Duplicate matching values were found. Matching rows may be ambiguous.</p>
          ) : (
            <p>This looks like a good matching setup.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface CoverageMatchStepProps {
  primary: DataTable;
  reference: DataTable;
  primaryName: string;
  referenceName: string;
  keyColumns: KeyColumnPair[];
  analysis: ReturnType<typeof analyzeMatchingColumns> | null;
  setKeyColumns: (columns: KeyColumnPair[]) => void;
  onPreview: PreviewHandler;
}

function CoverageMatchStep({
  primary,
  reference,
  primaryName,
  referenceName,
  keyColumns,
  analysis,
  setKeyColumns,
  onPreview,
}: CoverageMatchStepProps) {
  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Match population</h2>
        <p>Choose the identifier that says a row in the primary list exists in the reference population.</p>
      </div>
      <div className="toolbar">
        <button className="secondary compact" type="button" onClick={() => {
          const suggestions = suggestedColumnPairs(primary, reference);
          if (suggestions.length > 0) setKeyColumns(suggestions);
        }}>
          <Sparkles size={16} /> Suggest matches
        </button>
      </div>
      <div className="mapping-list">
        {keyColumns.map((pair, index) => (
          <div className="mapping-row" key={index}>
            <div className="mapping-field">
              <span className="field-label-row">
                <label htmlFor={`coverage-primary-${index}`}>{primaryName}</label>
                <button className="text-icon-button" type="button" onClick={() => onPreview(primaryName, primary, (column) => updateKeyPair(keyColumns, setKeyColumns, index, 'original', column), {
                  selectedColumns: pair.original ? [pair.original] : [],
                  onColumnDeselect: () => updateKeyPair(keyColumns, setKeyColumns, index, 'original', ''),
                })}>
                  <Eye size={16} /> Preview
                </button>
              </span>
              <select
                id={`coverage-primary-${index}`}
                value={pair.original}
                onChange={(event) => updateKeyPair(keyColumns, setKeyColumns, index, 'original', event.target.value)}
              >
                <option value="">Choose column</option>
                {primary.columns.map((column) => <option key={column}>{column}</option>)}
              </select>
            </div>
            <span className="equals">=</span>
            <div className="mapping-field">
              <span className="field-label-row">
                <label htmlFor={`coverage-reference-${index}`}>{referenceName}</label>
                <button className="text-icon-button" type="button" onClick={() => onPreview(referenceName, reference, (column) => updateKeyPair(keyColumns, setKeyColumns, index, 'new', column), {
                  selectedColumns: pair.new ? [pair.new] : [],
                  onColumnDeselect: () => updateKeyPair(keyColumns, setKeyColumns, index, 'new', ''),
                })}>
                  <Eye size={16} /> Preview
                </button>
              </span>
              <select
                id={`coverage-reference-${index}`}
                value={pair.new}
                onChange={(event) => updateKeyPair(keyColumns, setKeyColumns, index, 'new', event.target.value)}
              >
                <option value="">Choose column</option>
                {reference.columns.map((column) => <option key={column}>{column}</option>)}
              </select>
            </div>
            {keyColumns.length > 1 ? (
              <button className="icon-button" type="button" aria-label="Remove matching column" onClick={() => setKeyColumns(keyColumns.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button className="secondary compact" type="button" onClick={() => setKeyColumns([...keyColumns, { original: '', new: '' }])}>
        <Plus size={18} /> Add another matching column
      </button>
      {analysis ? (
        <div className={`analysis-card ${analysis.originalDuplicates || analysis.newDuplicates ? 'warning' : 'success'}`}>
          <strong>{analysis.approximateMatches.toLocaleString()} primary keys found in the reference population.</strong>
          <p>
            Primary: {analysis.originalUnique.toLocaleString()} unique values,
            {' '}{analysis.originalDuplicates.toLocaleString()} duplicate rows. Reference:
            {' '}{analysis.newUnique.toLocaleString()} unique values,
            {' '}{analysis.newDuplicates.toLocaleString()} duplicate rows.
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface EnrichChainStepProps {
  base: DataTable;
  baseName: string;
  references: EnrichReference[];
  setReferenceKeyColumns: (referenceIndex: number, columns: KeyColumnPair[]) => void;
  setReferenceAddedColumns: (referenceIndex: number, columns: string[]) => void;
  runError: string | null;
  onPreview: PreviewHandler;
}

function EnrichChainStep({
  base,
  baseName,
  references,
  setReferenceKeyColumns,
  setReferenceAddedColumns,
  runError,
  onPreview,
}: EnrichChainStepProps) {
  const totalSelectedColumns = references.reduce((total, reference) => total + reference.addedColumns.length, 0);

  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Build lookup chain</h2>
        <p>Configure each reference in order. Later lookups can match on columns added by earlier lookups.</p>
      </div>
      <div className="reference-config-list">
        {references.map((reference, referencePosition) => {
          const pairs = reference.keyColumns.length ? reference.keyColumns : [{ original: '', new: '' }];
          const chainBase = buildChainBaseTable(base, references, referencePosition);
          const analysis = canContinueMatching(reference.keyColumns)
            ? analyzeMatchingColumns(chainBase, reference.table, reference.keyColumns)
            : null;
          const keyColumnNames = new Set(reference.keyColumns.map((pair) => pair.new).filter(Boolean));
          const selectableColumns = reference.table.columns.filter((column) => !keyColumnNames.has(column));
          const selectedColumns = new Set(reference.addedColumns);
          const chainBaseName = referencePosition === 0 ? baseName : `Output after lookup ${referencePosition}`;

          return (
            <section className="reference-config-card" key={`${reference.name}-${reference.index}`}>
              <div className="manual-mapping-heading">
                <h3>Lookup {referencePosition + 1}: {reference.name}</h3>
                <button className="text-icon-button" type="button" onClick={() => onPreview(reference.name, reference.table)}>
                  <Eye size={16} /> Preview
                </button>
              </div>
              <p className="muted">Match against {chainBaseName}, then choose columns to append from this reference.</p>
              <div className="toolbar compact-toolbar">
                <button className="secondary compact" type="button" onClick={() => {
                  const suggestions = suggestedColumnPairs(chainBase, reference.table);
                  if (suggestions.length > 0) setReferenceKeyColumns(reference.index, suggestions);
                }}>
                  <Sparkles size={16} /> Suggest matches
                </button>
              </div>
              <div className="mapping-list compact-list">
                {pairs.map((pair, index) => (
                  <div className="mapping-row" key={index}>
                    <div className="mapping-field">
                      <span className="field-label-row">
                        <label htmlFor={`enrich-base-${reference.index}-${index}`}>{chainBaseName}</label>
                        <button className="text-icon-button" type="button" onClick={() => onPreview(chainBaseName, chainBase, (column) => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'original', column), {
                          selectedColumns: pair.original ? [pair.original] : [],
                          onColumnDeselect: () => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'original', ''),
                        })}>
                          <Eye size={16} /> Preview
                        </button>
                      </span>
                      <select
                        id={`enrich-base-${reference.index}-${index}`}
                        value={pair.original}
                        onChange={(event) => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'original', event.target.value)}
                      >
                        <option value="">Choose column</option>
                        {chainBase.columns.map((column) => <option key={column}>{column}</option>)}
                      </select>
                    </div>
                    <span className="equals">=</span>
                    <div className="mapping-field">
                      <span className="field-label-row">
                        <label htmlFor={`enrich-reference-${reference.index}-${index}`}>{reference.name}</label>
                        <button className="text-icon-button" type="button" onClick={() => onPreview(reference.name, reference.table, (column) => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'new', column), {
                          selectedColumns: pair.new ? [pair.new] : [],
                          onColumnDeselect: () => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'new', ''),
                        })}>
                          <Eye size={16} /> Preview
                        </button>
                      </span>
                      <select
                        id={`enrich-reference-${reference.index}-${index}`}
                        value={pair.new}
                        onChange={(event) => updateKeyPair(pairs, (columns) => setReferenceKeyColumns(reference.index, columns), index, 'new', event.target.value)}
                      >
                        <option value="">Choose column</option>
                        {reference.table.columns.map((column) => <option key={column}>{column}</option>)}
                      </select>
                    </div>
                    {pairs.length > 1 ? (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Remove matching column"
                        onClick={() => setReferenceKeyColumns(reference.index, pairs.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                className="secondary compact"
                type="button"
                onClick={() => setReferenceKeyColumns(reference.index, [...pairs, { original: '', new: '' }])}
              >
                <Plus size={18} /> Add another matching column
              </button>
              {analysis ? (
                <div className={`analysis-card ${analysis.originalDuplicates || analysis.newDuplicates ? 'warning' : 'success'}`}>
                  <strong>{analysis.approximateMatches.toLocaleString()} matching values found.</strong>
                  <p>
                    Lookup input: {analysis.originalUnique.toLocaleString()} unique values,
                    {' '}{analysis.originalDuplicates.toLocaleString()} duplicate rows. Reference:
                    {' '}{analysis.newUnique.toLocaleString()} unique values,
                    {' '}{analysis.newDuplicates.toLocaleString()} duplicate rows.
                  </p>
                </div>
              ) : null}
              <div className="toolbar">
                <button className="secondary compact" type="button" onClick={() => setReferenceAddedColumns(reference.index, selectableColumns)}>
                  Select all
                </button>
                <button className="secondary compact" type="button" onClick={() => setReferenceAddedColumns(reference.index, [])}>
                  Clear all
                </button>
              </div>
              <div className="check-list">
                {selectableColumns.map((column) => (
                  <label className="check-row" key={column}>
                    <input
                      type="checkbox"
                      checked={selectedColumns.has(column)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setReferenceAddedColumns(reference.index, [...reference.addedColumns, column]);
                        } else {
                          setReferenceAddedColumns(reference.index, reference.addedColumns.filter((item) => item !== column));
                        }
                      }}
                    />
                    <span>{column}</span>
                  </label>
                ))}
              </div>
              <p className="muted">{reference.addedColumns.length.toLocaleString()} columns selected from this reference.</p>
            </section>
          );
        })}
      </div>
      <div className="analysis-card success">
        <strong>{totalSelectedColumns.toLocaleString()} columns selected across the chain.</strong>
        <p>The output will run each lookup in order, so columns added by one report can be used to match the next report.</p>
      </div>
      {runError ? <p className="error-text">{runError}</p> : null}
    </div>
  );
}

interface CompareStepProps {
  original: DataTable;
  next: DataTable;
  originalName: string;
  nextName: string;
  commonColumns: string[];
  keyColumns: KeyColumnPair[];
  comparedColumns: ComparedColumnPair[];
  options: ComparisonOptions;
  setComparedColumns: (columns: ComparedColumnPair[]) => void;
  setOptions: (options: ComparisonOptions) => void;
  runError: string | null;
  onPreview: PreviewHandler;
}

function CompareStep({
  original,
  next,
  originalName,
  nextName,
  commonColumns,
  keyColumns,
  comparedColumns,
  options,
  setComparedColumns,
  setOptions,
  runError,
  onPreview,
}: CompareStepProps) {
  const keyColumnNames = new Set(keyColumns.filter((pair) => pair.original === pair.new).map((pair) => pair.original));
  const selectableColumns = commonColumns.filter((column) => !keyColumnNames.has(column));
  const selectedSameNameColumns = new Set(
    comparedColumns
      .filter((pair) => pair.original === pair.new)
      .map((pair) => pair.original),
  );
  const manualColumns = comparedColumns.filter((pair) => pair.original !== pair.new || !selectableColumns.includes(pair.original));
  const hasValidComparedColumn = comparedColumns.some((pair) => pair.original && pair.new);

  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Choose what to compare</h2>
        <p>Select the fields that should be checked for changes.</p>
      </div>
      <div className="toolbar">
        <button className="secondary compact" type="button" onClick={() => setComparedColumns([
          ...selectableColumns.map((column) => ({ original: column, new: column })),
          ...manualColumns.filter((pair) => pair.original && pair.new && pair.original !== pair.new),
        ])}>
          Select all
        </button>
        <button className="secondary compact" type="button" onClick={() => setComparedColumns([])}>
          Clear all
        </button>
      </div>
      <div className="check-list">
        {selectableColumns.map((column) => (
          <label className="check-row" key={column}>
            <input
              type="checkbox"
              checked={selectedSameNameColumns.has(column)}
              onChange={(event) => {
                if (event.target.checked) {
                  setComparedColumns([...comparedColumns, { original: column, new: column }]);
                } else {
                  setComparedColumns(comparedColumns.filter((pair) => !(pair.original === column && pair.new === column)));
                }
              }}
            />
            <span>{column}</span>
          </label>
        ))}
      </div>
      <div className="manual-mapping">
        <div className="manual-mapping-heading">
          <h3>Field mappings</h3>
          <div className="manual-mapping-actions">
            <button
              className="secondary compact"
              type="button"
              onClick={() => {
                const keyNames = new Set(keyColumns.flatMap((pair) => [pair.original, pair.new]).filter(Boolean));
                const suggestions = suggestedColumnPairs(original, next, 6)
                  .filter((pair) => !keyNames.has(pair.original) && !keyNames.has(pair.new))
                  .map((pair) => ({ original: pair.original, new: pair.new }));
                const existing = new Set(comparedColumns.map((pair) => `${pair.original}\u0000${pair.new}`));
                setComparedColumns([
                  ...comparedColumns,
                  ...suggestions.filter((pair) => !existing.has(`${pair.original}\u0000${pair.new}`)),
                ]);
              }}
            >
              <Sparkles size={16} /> Suggest mappings
            </button>
            <button
              className="secondary compact"
              type="button"
              onClick={() => setComparedColumns([...comparedColumns, {
                original: '',
                new: '',
              }])}
            >
              <Plus size={18} /> Add field mapping
            </button>
          </div>
        </div>
        {manualColumns.length === 0 ? (
          <p className="muted">Use this when the files use different names for the same field.</p>
        ) : (
          <div className="mapping-list compact-list">
            {manualColumns.map((pair, index) => {
                  const globalIndex = comparedColumns.indexOf(pair);
                  return (
                    <div className="mapping-row" key={`${pair.original}-${pair.new}-${index}`}>
                      <div className="mapping-field">
                        <span className="field-label-row">
                          <label htmlFor={`compare-original-${globalIndex}`}>{originalName} field</label>
                          <button className="text-icon-button" type="button" onClick={() => onPreview(originalName, original, (column) => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'original', column), {
                            selectedColumns: pair.original ? [pair.original] : [],
                            onColumnDeselect: () => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'original', ''),
                          })}>
                            <Eye size={16} /> Preview
                          </button>
                        </span>
                        <select
                          id={`compare-original-${globalIndex}`}
                          value={pair.original}
                          onChange={(event) => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'original', event.target.value)}
                        >
                          <option value="">Choose field</option>
                          {original.columns.map((column) => <option key={column}>{column}</option>)}
                        </select>
                      </div>
                      <span className="equals">=</span>
                      <div className="mapping-field">
                        <span className="field-label-row">
                          <label htmlFor={`compare-new-${globalIndex}`}>{nextName} field</label>
                          <button className="text-icon-button" type="button" onClick={() => onPreview(nextName, next, (column) => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'new', column), {
                            selectedColumns: pair.new ? [pair.new] : [],
                            onColumnDeselect: () => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'new', ''),
                          })}>
                            <Eye size={16} /> Preview
                          </button>
                        </span>
                        <select
                          id={`compare-new-${globalIndex}`}
                          value={pair.new}
                          onChange={(event) => updateComparePair(comparedColumns, setComparedColumns, globalIndex, 'new', event.target.value)}
                        >
                          <option value="">Choose field</option>
                          {next.columns.map((column) => <option key={column}>{column}</option>)}
                        </select>
                      </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Remove field mapping"
                    onClick={() => setComparedColumns(comparedColumns.filter((_, itemIndex) => itemIndex !== globalIndex))}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectableColumns.length === 0 && !hasValidComparedColumn ? (
        <div className="analysis-card warning">
          <strong>No same-name fields were found to compare.</strong>
          <p>Use field mappings above to choose which Original and New fields should be compared.</p>
        </div>
      ) : null}
      <details className="options-panel">
        <summary>Comparison options</summary>
        <label><input type="checkbox" checked={options.trimWhitespace} onChange={(event) => setOptions({ ...options, trimWhitespace: event.target.checked })} /> Ignore leading and trailing whitespace</label>
        <label><input type="checkbox" checked={options.caseInsensitive} onChange={(event) => setOptions({ ...options, caseInsensitive: event.target.checked })} /> Case-insensitive text comparison</label>
        <label><input type="checkbox" checked={options.blankEqualsNull} onChange={(event) => setOptions({ ...options, blankEqualsNull: event.target.checked })} /> Treat blank and null values as equivalent</label>
        <label><input type="checkbox" checked={options.numericTextEqualsNumber} onChange={(event) => setOptions({ ...options, numericTextEqualsNumber: event.target.checked })} /> Treat numeric text and numbers as equivalent</label>
      </details>
      {runError ? <p className="error-text">{runError}</p> : null}
    </div>
  );
}

interface EnrichStepProps {
  references: EnrichReference[];
  setReferenceAddedColumns: (referenceIndex: number, columns: string[]) => void;
  runError: string | null;
  onPreview: PreviewHandler;
}

interface PrivacyStepProps {
  columns: PrivacyColumnInfo[];
  transforms: PrivacyTransforms;
  typeOverrides: PrivacyTypeOverrides;
  setTransforms: (transforms: PrivacyTransforms) => void;
  setTypeOverrides: (overrides: PrivacyTypeOverrides) => void;
}

function PrivacyStep({ columns, transforms, typeOverrides, setTransforms, setTypeOverrides }: PrivacyStepProps) {
  const selectedCount = Object.keys(transforms).length;

  function setColumnMode(column: string, mode: PrivacyMode | ''): void {
    const nextTransforms = { ...transforms };
    if (!mode) delete nextTransforms[column];
    else nextTransforms[column] = mode;
    setTransforms(nextTransforms);
  }

  function setColumnType(column: string, detectedKind: PrivacyKind, kind: PrivacyKind): void {
    const nextOverrides = { ...typeOverrides };
    if (kind === detectedKind) delete nextOverrides[column];
    else nextOverrides[column] = kind;
    setTypeOverrides(nextOverrides);
  }

  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Protect data</h2>
        <p>Choose how sensitive or identifying fields should be transformed in the result and export.</p>
      </div>
      <div className="analysis-card success">
        <strong>{selectedCount.toLocaleString()} data protection rules selected.</strong>
        <p>Pseudonymize keeps consistent realistic replacements. Anonymize uses neutral placeholders based on the detected field type.</p>
      </div>
      <div className="privacy-list">
        {columns.map((columnInfo) => (
          <div className="privacy-row" key={columnInfo.column}>
            <span>
              <strong>{columnInfo.column}</strong>
              <small>Detected as {privacyKindLabel(columnInfo.detectedKind)}{columnInfo.sample ? ` - e.g. ${columnInfo.sample}` : ''}</small>
            </span>
            <label className="privacy-type-select">
              <span>Type</span>
              <select
                value={typeOverrides[columnInfo.column] ?? columnInfo.detectedKind}
                onChange={(event) => setColumnType(columnInfo.column, columnInfo.detectedKind, event.target.value as PrivacyKind)}
              >
                {privacyKindOptions.map((kind) => (
                  <option value={kind} key={kind}>{privacyKindLabel(kind)}</option>
                ))}
              </select>
            </label>
            <div className="segmented-control" aria-label={`Privacy mode for ${columnInfo.column}`}>
              <button className={!transforms[columnInfo.column] ? 'active' : ''} type="button" onClick={() => setColumnMode(columnInfo.column, '')}>
                Keep
              </button>
              <button className={transforms[columnInfo.column] === 'replace' ? 'active' : ''} type="button" onClick={() => setColumnMode(columnInfo.column, 'replace')}>
                {primaryActionLabel(typeOverrides[columnInfo.column] ?? columnInfo.detectedKind)}
              </button>
              <button className={transforms[columnInfo.column] === 'hide' ? 'active' : ''} type="button" onClick={() => setColumnMode(columnInfo.column, 'hide')}>
                {secondaryActionLabel(typeOverrides[columnInfo.column] ?? columnInfo.detectedKind)}
              </button>
            </div>
            <small className="privacy-action-hint">
              {actionHint(typeOverrides[columnInfo.column] ?? columnInfo.detectedKind)}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrichStep({
  references,
  setReferenceAddedColumns,
  runError,
  onPreview,
}: EnrichStepProps) {
  const totalSelectedColumns = references.reduce((total, reference) => total + reference.addedColumns.length, 0);

  return (
    <div className="step-content narrow">
      <div className="section-heading">
        <h2>Choose columns to add</h2>
        <p>Select columns from each reference file that should be appended to the base table.</p>
      </div>
      <div className="reference-config-list">
        {references.map((reference) => {
          const keyColumnNames = new Set(reference.keyColumns.map((pair) => pair.new).filter(Boolean));
          const selectableColumns = reference.table.columns.filter((column) => !keyColumnNames.has(column));
          const selectedColumns = new Set(reference.addedColumns);

          return (
            <section className="reference-config-card" key={`${reference.name}-${reference.index}`}>
              <div className="manual-mapping-heading">
                <h3>{reference.name}</h3>
                <button
                  className="text-icon-button"
                  type="button"
                  onClick={() => onPreview(reference.name, reference.table, (column) => {
                    if (keyColumnNames.has(column) || selectedColumns.has(column)) return;
                    setReferenceAddedColumns(reference.index, [...reference.addedColumns, column]);
                  }, {
                    selectedColumns: reference.addedColumns,
                    keepOpenOnSelect: true,
                    onSelectedColumnsChange: (columns) => setReferenceAddedColumns(reference.index, columns.filter((column) => !keyColumnNames.has(column))),
                    onColumnDeselect: (column) => setReferenceAddedColumns(reference.index, reference.addedColumns.filter((item) => item !== column)),
                  })}
                >
                  <Eye size={16} /> Preview
                </button>
              </div>
              <div className="toolbar">
                <button className="secondary compact" type="button" onClick={() => setReferenceAddedColumns(reference.index, selectableColumns)}>
                  Select all
                </button>
                <button className="secondary compact" type="button" onClick={() => setReferenceAddedColumns(reference.index, [])}>
                  Clear all
                </button>
              </div>
              <div className="check-list">
                {selectableColumns.map((column) => (
                  <label className="check-row" key={column}>
                    <input
                      type="checkbox"
                      checked={selectedColumns.has(column)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setReferenceAddedColumns(reference.index, [...reference.addedColumns, column]);
                        } else {
                          setReferenceAddedColumns(reference.index, reference.addedColumns.filter((item) => item !== column));
                        }
                      }}
                    />
                    <span>{column}</span>
                  </label>
                ))}
              </div>
              <p className="muted">{reference.addedColumns.length.toLocaleString()} columns selected from this reference.</p>
            </section>
          );
        })}
      </div>
      <div className="analysis-card success">
        <strong>{totalSelectedColumns.toLocaleString()} columns selected.</strong>
        <p>The output will keep every row from the base file and add selected columns from each matching reference row.</p>
      </div>
      {runError ? <p className="error-text">{runError}</p> : null}
    </div>
  );
}

interface ResultsStepProps {
  result: ComparisonResult;
  privacyTransforms: PrivacyTransforms;
  privacyTypeOverrides: PrivacyTypeOverrides;
  activeView: ResultView;
  setActiveView: (view: ResultView) => void;
  search: string;
  setSearch: (value: string) => void;
  originalTable: DataTable;
  nextTable: DataTable;
  originalWorkbook: ParsedWorkbook;
  nextWorkbook: ParsedWorkbook;
  config: ComparisonConfig;
}

interface EnrichmentResultsStepProps {
  result: EnrichmentResult;
  privacyTransforms: PrivacyTransforms;
  privacyTypeOverrides: PrivacyTypeOverrides;
  search: string;
  setSearch: (value: string) => void;
  baseWorkbook: ParsedWorkbook;
  referenceWorkbook: ParsedWorkbook;
  config: EnrichmentConfig;
}

interface PrivacyResultsStepProps {
  table: DataTable;
  workbook: ParsedWorkbook;
  privacyTransforms: PrivacyTransforms;
  privacyTypeOverrides: PrivacyTypeOverrides;
  search: string;
  setSearch: (value: string) => void;
}

interface CoverageResultsStepProps {
  result: CoverageResult;
  privacyTransforms: PrivacyTransforms;
  privacyTypeOverrides: PrivacyTypeOverrides;
  activeView: CoverageView;
  setActiveView: (view: CoverageView) => void;
  search: string;
  setSearch: (value: string) => void;
  primaryTable: DataTable;
  referenceTable: DataTable;
  primaryWorkbook: ParsedWorkbook;
  referenceWorkbook: ParsedWorkbook;
  keyColumns: KeyColumnPair[];
  selectedReferenceColumns: string[];
  setSelectedReferenceColumns: (columns: string[]) => void;
}

function CoverageResultsStep({
  result,
  privacyTransforms,
  privacyTypeOverrides,
  activeView,
  setActiveView,
  search,
  setSearch,
  primaryTable,
  referenceTable,
  primaryWorkbook,
  referenceWorkbook,
  keyColumns,
  selectedReferenceColumns,
  setSelectedReferenceColumns,
}: CoverageResultsStepProps) {
  const privacyAwareResult = useMemo(
    () => transformCoverageResultForPrivacy(result, privacyTransforms, privacyTypeOverrides),
    [privacyTransforms, privacyTypeOverrides, result],
  );
  const selectedPrimaryContextColumns = useMemo(
    () => coveragePrimaryContextColumns(primaryTable, keyColumns),
    [primaryTable, keyColumns],
  );
  const selectedReferenceContextColumns = useMemo(
    () => coverageReferenceContextColumns(referenceTable, keyColumns, selectedReferenceColumns),
    [referenceTable, keyColumns, selectedReferenceColumns],
  );
  const auditColumns = useMemo(
    () => coverageAuditColumns(primaryTable, selectedReferenceContextColumns),
    [primaryTable, selectedReferenceContextColumns],
  );
  const referenceAuditColumns = useMemo(
    () => coverageReferenceAuditColumns(selectedPrimaryContextColumns, referenceTable),
    [referenceTable, selectedPrimaryContextColumns],
  );
  const groupSummaryColumns = useMemo(
    () => coverageGroupSummaryColumns(selectedPrimaryContextColumns, selectedReferenceContextColumns),
    [selectedPrimaryContextColumns, selectedReferenceContextColumns],
  );
  const referenceAuditRows = useMemo(
    () => [...privacyAwareResult.matchedReference, ...privacyAwareResult.referenceOnly],
    [privacyAwareResult.matchedReference, privacyAwareResult.referenceOnly],
  );
  const currentRows = activeView === 'primaryAudit'
    ? privacyAwareResult.allPrimary
    : activeView === 'referenceAudit'
      ? referenceAuditRows
      : privacyAwareResult.groupSummary;
  const currentColumns = activeView === 'primaryAudit'
    ? auditColumns
    : activeView === 'referenceAudit'
      ? referenceAuditColumns
      : groupSummaryColumns;
  const filteredRows = useMemo(() => filterRows(currentRows, search), [currentRows, search]);
  const checkablePrimaryRows = Math.max(primaryTable.rows.length - result.blankPrimaryKeys, 0);
  const primaryCoverage = primaryTable.rows.length === 0 ? 0 : (result.found.length / primaryTable.rows.length) * 100;
  const checkableCoverage = checkablePrimaryRows === 0 ? 0 : (result.found.length / checkablePrimaryRows) * 100;
  const referenceCoverage = referenceTable.rows.length === 0 ? 0 : (result.matchedReference.length / referenceTable.rows.length) * 100;
  const duplicateKeyRows = result.duplicateKeys.reduce((total, duplicate) => total + duplicate.count, 0);
  const exportColumns = currentColumns;
  const exportRows = useMemo(
    () => filteredRows.map((row) => Object.fromEntries(exportColumns.map((column) => [column, row[column] ?? null]))),
    [exportColumns, filteredRows],
  );

  return (
    <div className="step-content">
      <div className="results-header">
        {coverageMetric('Primary issues', result.needsAttention.length.toLocaleString(), 'Primary rows with blank keys, primary duplicates, multiple reference matches, or no match in the reference population.')}
        {coverageMetric('Checkable coverage', `${formatPercent(checkableCoverage)}%`, `${result.found.length.toLocaleString()} of ${checkablePrimaryRows.toLocaleString()} primary rows with usable keys were found.`)}
        {coverageMetric('One-to-one matches', result.found.length.toLocaleString(), `${formatPercent(primaryCoverage)}% of total primary rows matched exactly one reference row.`)}
        {coverageMetric('Matched reference', result.matchedReference.length.toLocaleString(), `${formatPercent(referenceCoverage)}% of the reference population matched the primary list.`)}
      </div>
      <div className="analysis-card success enrichment-context">
        <strong>Coverage summary</strong>
        <p>
          {result.found.length.toLocaleString()} of {checkablePrimaryRows.toLocaleString()} checkable primary rows were found in the reference population.
          {' '}{result.notInReference.length.toLocaleString()} checkable primary rows were not found.
          {' '}{result.blankPrimaryKeys.toLocaleString()} primary rows could not be checked because the match key is blank.
          {' '}Use Primary audit for primary rows, Reference audit for reference rows, and Group summary for one-to-many keys.
        </p>
      </div>
      {result.blankPrimaryKeys > 0 || result.blankReferenceKeys > 0 || duplicateKeyRows > 0 ? (
        <div className="analysis-card warning">
          <strong>Matching-key quality may affect the result.</strong>
          <p>
            Blank primary keys: {result.blankPrimaryKeys.toLocaleString()}.
            Blank reference keys: {result.blankReferenceKeys.toLocaleString()}.
            Duplicate key rows: {duplicateKeyRows.toLocaleString()}.
          </p>
        </div>
      ) : null}
      <details className="options-panel">
        <summary>Reference columns to show</summary>
        <div className="toolbar">
          <button className="secondary compact" type="button" onClick={() => setSelectedReferenceColumns(referenceTable.columns)}>
            Select all
          </button>
          <button className="secondary compact" type="button" onClick={() => setSelectedReferenceColumns(suggestedCoverageReferenceColumns(referenceTable, keyColumns))}>
            Suggested
          </button>
          <button className="secondary compact" type="button" onClick={() => setSelectedReferenceColumns([])}>
            Clear
          </button>
        </div>
        <div className="check-list">
          {referenceTable.columns.map((column) => (
            <label className="check-row" key={column}>
              <input
                type="checkbox"
                checked={selectedReferenceColumns.includes(column)}
                onChange={(event) => {
                  if (event.target.checked) setSelectedReferenceColumns([...selectedReferenceColumns, column]);
                  else setSelectedReferenceColumns(selectedReferenceColumns.filter((item) => item !== column));
                }}
              />
              <span>{column}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="result-controls">
        <div className="tabs" role="tablist" aria-label="Coverage categories">
          {(['primaryAudit', 'referenceAudit', 'groupSummary'] as CoverageView[]).map((view) => (
            <button className={activeView === view ? 'active' : ''} type="button" role="tab" aria-selected={activeView === view} onClick={() => setActiveView(view)} key={view}>
              {coverageViewLabel(view)}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search current coverage view" />
        </label>
        <button
          className="secondary compact export-action"
          type="button"
          onClick={() => downloadCsv(buildCsvForRows(exportRows, exportColumns), `${coverageViewFileName(activeView)}.csv`)}
        >
          <Download size={18} /> Current view CSV
        </button>
        <button
          className="secondary compact export-action"
          type="button"
          onClick={() => exportCoverageWorkbook(privacyAwareResult, {
            primaryAuditColumns: auditColumns,
            referenceAuditColumns,
            groupSummaryColumns,
            primaryName: primaryWorkbook.displayName || primaryWorkbook.fileName,
            referenceName: referenceWorkbook.displayName || referenceWorkbook.fileName,
            keyColumns,
          })}
        >
          <FileDown size={18} /> Full workbook
        </button>
        <button className="secondary compact export-action" type="button" onClick={() => downloadCsv(buildCsvForRows(privacyAwareResult.allPrimary, auditColumns), 'coverage-primary-audit.csv')}>
          <Download size={18} /> Primary audit CSV
        </button>
        <button className="secondary compact export-action" type="button" onClick={() => downloadCsv(buildCsvForRows(referenceAuditRows, referenceAuditColumns), 'coverage-reference-audit.csv')}>
          <Download size={18} /> Reference audit CSV
        </button>
        <button className="secondary compact export-action" type="button" onClick={() => downloadCsv(buildCsvForRows(privacyAwareResult.groupSummary, groupSummaryColumns), 'coverage-group-summary.csv')}>
          <Download size={18} /> Group summary CSV
        </button>
      </div>
      <div className="analysis-card success enrichment-context">
        <strong>Checked {primaryWorkbook.displayName || primaryWorkbook.fileName} against {referenceWorkbook.displayName || referenceWorkbook.fileName}.</strong>
        <p>Primary audit is primary-row based. Reference audit is reference-row based. Group summary is key/count based. Match: {keyColumns.map((pair) => `${pair.original} = ${pair.new}`).join('; ')}.</p>
      </div>
      <ResultTable rows={filteredRows} columns={currentColumns} />
    </div>
  );
}

function PrivacyResultsStep({
  table,
  workbook,
  privacyTransforms,
  privacyTypeOverrides,
  search,
  setSearch,
}: PrivacyResultsStepProps) {
  const privacyAwareRows = useMemo(
    () => transformRowsForPrivacy(table.rows, privacyTransforms, privacyTypeOverrides),
    [privacyTransforms, privacyTypeOverrides, table.rows],
  );
  const filteredRows = useMemo(() => filterRows(privacyAwareRows, search), [privacyAwareRows, search]);
  const [visibleColumns, setVisibleColumns] = useState(table.columns);
  const selectedRuleCount = Object.keys(privacyTransforms).length;

  const exportColumns = visibleColumns.length > 0 ? visibleColumns : table.columns;
  const exportRows = useMemo(
    () => filteredRows.map((row) => Object.fromEntries(exportColumns.map((column) => [column, row[column] ?? null]))),
    [exportColumns, filteredRows],
  );

  return (
    <div className="step-content">
      <div className="results-header">
        {enrichmentMetric('Rows', table.rows.length, 'Rows included in the protected export.')}
        {enrichmentMetric('Columns', table.columns.length, 'Columns available in the selected sheet.')}
        {enrichmentMetric('Rules', selectedRuleCount, 'Columns with pseudonymize, anonymize, or hide enabled.')}
        {enrichmentMetric('Visible', filteredRows.length, 'Rows currently visible after search filtering.')}
      </div>
      <div className="result-controls">
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search protected table" />
        </label>
        <button
          className="secondary compact export-action"
          type="button"
          onClick={() => downloadCsv(buildCsvForRows(exportRows, exportColumns), 'privacy-safe-table.csv')}
        >
          <Download size={18} /> Visible table CSV
        </button>
      </div>
      <div className="analysis-card success enrichment-context">
        <strong>Protected copy built from {workbook.displayName || workbook.fileName}.</strong>
        <p>The source file is unchanged. The export contains the transformed values shown below.</p>
      </div>
      <ResultTable rows={filteredRows} columns={table.columns} onVisibleColumnsChange={setVisibleColumns} />
    </div>
  );
}

function EnrichmentResultsStep({
  result,
  privacyTransforms,
  privacyTypeOverrides,
  search,
  setSearch,
  baseWorkbook,
  referenceWorkbook,
  config,
}: EnrichmentResultsStepProps) {
  const privacyAwareRows = useMemo(
    () => transformRowsForPrivacy(result.rows, privacyTransforms, privacyTypeOverrides),
    [privacyTransforms, privacyTypeOverrides, result.rows],
  );
  const filteredRows = useMemo(() => filterRows(privacyAwareRows, search), [privacyAwareRows, search]);
  const [visibleColumns, setVisibleColumns] = useState(result.columns);

  const exportColumns = visibleColumns.length > 0 ? visibleColumns : result.columns;
  const exportRows = useMemo(
    () => filteredRows.map((row) => Object.fromEntries(exportColumns.map((column) => [column, row[column] ?? null]))),
    [exportColumns, filteredRows],
  );

  return (
    <div className="step-content">
      <div className="results-header enrichment-header">
        {enrichmentMetric('Rows kept', result.rows.length, 'The output keeps every row from the file you updated.')}
        {enrichmentMetric('Matched', result.matchedRows, 'Rows where a matching reference record was found.')}
        {enrichmentMetric('Unmatched', result.unmatchedRows, 'Rows where no matching reference record was found. Added values are blank.')}
        {enrichmentMetric('Columns added', result.addedColumns.length, 'Reference columns appended to your file.')}
      </div>
      {result.duplicateKeys.length > 0 ? (
        <div className="analysis-card warning">
          <strong>Duplicate reference matching values were found.</strong>
          <p>The first matching reference row was used for duplicate keys. Review the output carefully.</p>
        </div>
      ) : null}
      <div className="result-controls">
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search output table" />
        </label>
        <button
          className="secondary compact export-action"
          type="button"
          onClick={() => downloadCsv(buildCsvForRows(exportRows, exportColumns), 'table-with-added-columns.csv')}
        >
          <Download size={18} /> Visible table CSV
        </button>
      </div>
      <div className="analysis-card success enrichment-context">
        <strong>Built from {baseWorkbook.displayName || baseWorkbook.fileName} and {referenceWorkbook.displayName || referenceWorkbook.fileName}.</strong>
        <p>
          Match: {config.keyColumns.map((pair) => `${pair.original} = ${pair.new}`).join('; ')}.
          Added: {config.addedColumns.join(', ')}.
        </p>
      </div>
      <ResultTable rows={filteredRows} columns={result.columns} onVisibleColumnsChange={setVisibleColumns} />
    </div>
  );
}

function ResultsStep({
  result,
  privacyTransforms,
  privacyTypeOverrides,
  activeView,
  setActiveView,
  search,
  setSearch,
  originalTable,
  nextTable,
  originalWorkbook,
  nextWorkbook,
  config,
}: ResultsStepProps) {
  const privacyAwareResult = useMemo(
    () => transformComparisonResultForPrivacy(result, privacyTransforms, privacyTypeOverrides),
    [privacyTransforms, privacyTypeOverrides, result],
  );
  const changedFieldCount = useMemo(
    () => privacyAwareResult.changed.reduce((total, row) => total + row.changes.length, 0),
    [privacyAwareResult.changed],
  );
  const filteredRows = useMemo(() => {
    if (activeView === 'changed' || activeView === 'reconciliation' || activeView === 'reconciliationSummary') return [];
    return filterRows(privacyAwareResult[activeView], search);
  }, [activeView, privacyAwareResult, search]);
  const changedRows = useMemo(() => (
    filterRows(flattenChangedRows(privacyAwareResult.changed, config.keyColumns), search)
  ), [config.keyColumns, privacyAwareResult.changed, search]);
  const reconciliationRows = useMemo(() => (
    filterRows(flattenReconciliationRows(privacyAwareResult, config.keyColumns, config.comparedColumns), search)
  ), [config, privacyAwareResult, search]);
  const reconciliationSummaryRows = useMemo(() => (
    filterRows(flattenReconciliationSummaryRows(privacyAwareResult, config.keyColumns, config.comparedColumns), search)
  ), [config, privacyAwareResult, search]);

  return (
    <div className="step-content">
      <div className="results-header">
        {metric('Different', privacyAwareResult.summary.changed, statusDescriptions.Different, `${changedFieldCount.toLocaleString()} field changes`)}
        {metric('Only in new', privacyAwareResult.summary.added, statusDescriptions['Only in new'])}
        {metric('Missing in new', privacyAwareResult.summary.removed, statusDescriptions['Missing in new'])}
        {metric('Same', privacyAwareResult.summary.unchanged, statusDescriptions.Same)}
      </div>
      {privacyAwareResult.duplicateKeys.length > 0 ? (
        <div className="analysis-card warning">
          <strong>Duplicate matching values were found.</strong>
          <p>The first matching row was compared for duplicate keys. Review the exported results carefully.</p>
        </div>
      ) : null}
      <div className="result-controls">
        <div className="tabs" role="tablist" aria-label="Result categories">
          {(['reconciliation', 'reconciliationSummary', 'changed', 'added', 'removed', 'unchanged'] as ResultView[]).map((view) => (
            <button className={activeView === view ? 'active' : ''} type="button" role="tab" aria-selected={activeView === view} onClick={() => setActiveView(view)} key={view}>
              {resultViewLabel(view)}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search current view" />
        </label>
        <button
          className="secondary compact export-action"
          type="button"
          onClick={() => exportComparisonWorkbook(privacyAwareResult, config, originalTable, nextTable, {
            originalName: originalWorkbook.displayName || originalWorkbook.fileName,
            newName: nextWorkbook.displayName || nextWorkbook.fileName,
            originalDescription: originalWorkbook.description,
            newDescription: nextWorkbook.description,
          })}
        >
          <FileDown size={18} /> Full workbook
        </button>
        <button className="secondary compact export-action" type="button" onClick={() => downloadCsv(buildCsvForView(privacyAwareResult, activeView, config), `${resultViewFileName(activeView)}-comparison.csv`)}>
          <Download size={18} /> Current view CSV
        </button>
      </div>
      {activeView === 'reconciliation' ? (
        <ResultTable rows={reconciliationRows} columns={reconciliationTableColumns(config)} />
      ) : activeView === 'reconciliationSummary' ? (
        <ResultTable rows={reconciliationSummaryRows} columns={reconciliationSummaryTableColumns(config)} />
      ) : activeView === 'changed' ? (
        <ResultTable rows={changedRows} columns={changedTableColumns(config)} />
      ) : (
        <ResultTable rows={filteredRows} columns={columnsForResultView(activeView, originalTable, nextTable)} />
      )}
    </div>
  );
}

function DataPreviewModal({
  title,
  table,
  selectedColumns = [],
  keepOpenOnSelect = false,
  onSelectedColumnsChange,
  onColumnSelect,
  onColumnDeselect,
  onClose,
}: {
  title: string;
  table: DataTable;
  selectedColumns?: string[];
  keepOpenOnSelect?: boolean;
  onSelectedColumnsChange?: (columns: string[]) => void;
  onColumnSelect?: (column: string) => void;
  onColumnDeselect?: (column: string) => void;
  onClose: () => void;
}) {
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [isLoadingFullPreview, setIsLoadingFullPreview] = useState(false);
  const [localSelectedColumns, setLocalSelectedColumns] = useState(selectedColumns);
  const canSelectColumns = Boolean(onColumnSelect || onSelectedColumnsChange);
  const previewRows = showFullPreview ? table.rows : table.rows.slice(0, 10);
  const isPartialPreview = !showFullPreview && table.rows.length > previewRows.length;

  useEffect(() => {
    setLocalSelectedColumns(selectedColumns);
  }, [selectedColumns]);

  function selectPreviewColumn(column: string): void {
    if (localSelectedColumns.includes(column)) {
      const nextColumns = localSelectedColumns.filter((item) => item !== column);
      if (onSelectedColumnsChange) {
        setLocalSelectedColumns(nextColumns);
        onSelectedColumnsChange(nextColumns);
        return;
      }
      onColumnDeselect?.(column);
      setLocalSelectedColumns(nextColumns);
      return;
    }

    const nextColumns = keepOpenOnSelect ? [...localSelectedColumns, column] : [column];
    if (onSelectedColumnsChange) {
      setLocalSelectedColumns(nextColumns);
      onSelectedColumnsChange(nextColumns);
      return;
    }

    onColumnSelect?.(column);
    setLocalSelectedColumns(nextColumns);
    if (!keepOpenOnSelect) onClose();
  }

  function loadFullPreview(): void {
    setIsLoadingFullPreview(true);
    window.setTimeout(() => {
      setShowFullPreview(true);
      setIsLoadingFullPreview(false);
    }, 50);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="preview-modal-header">
          <div>
            <h2 id="preview-title">{title}</h2>
            <p>{table.rows.length.toLocaleString()} rows - {table.columns.length.toLocaleString()} columns{table.sheetName ? ` - ${table.sheetName}` : ''}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close preview" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {isPartialPreview || isLoadingFullPreview ? (
          <div className="preview-mode-bar">
            <span>
              Showing first {previewRows.length.toLocaleString()} rows for a quick preview.
            </span>
            <button className="secondary compact" type="button" disabled={isLoadingFullPreview} onClick={loadFullPreview}>
              {isLoadingFullPreview ? <span className="spinner" aria-hidden="true" /> : null}
              {isLoadingFullPreview ? 'Loading full preview' : 'Load full preview'}
            </button>
          </div>
        ) : null}
        {canSelectColumns ? (
          <div className="preview-column-picker" aria-label="Select a column from preview">
            <span>Hover a table header to use a column, or choose from the list.</span>
            <div>
              {table.columns.map((column) => (
                <button
                  className={`column-chip ${localSelectedColumns.includes(column) ? 'selected' : ''}`}
                  type="button"
                  key={column}
                  onClick={() => selectPreviewColumn(column)}
                >
                  {column}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ResultTable
          rows={previewRows}
          columns={table.columns}
          selectedColumns={localSelectedColumns}
          onColumnSelect={canSelectColumns ? selectPreviewColumn : undefined}
          onColumnDeselect={selectPreviewColumn}
        />
      </section>
    </div>
  );
}

function updateKeyPair(
  keyColumns: KeyColumnPair[],
  setKeyColumns: (columns: KeyColumnPair[]) => void,
  index: number,
  side: keyof KeyColumnPair,
  value: string,
) {
  setKeyColumns(keyColumns.map((pair, itemIndex) => (
    itemIndex === index ? { ...pair, [side]: value } : pair
  )));
}

function updateComparePair(
  comparedColumns: ComparedColumnPair[],
  setComparedColumns: (columns: ComparedColumnPair[]) => void,
  index: number,
  side: keyof ComparedColumnPair,
  value: string,
) {
  setComparedColumns(comparedColumns.map((pair, itemIndex) => (
    itemIndex === index ? { ...pair, [side]: value } : pair
  )));
}

function suggestedColumnPairs(left: DataTable, right: DataTable, limit = 3): KeyColumnPair[] {
  const candidates = left.columns.flatMap((leftColumn) =>
    right.columns.map((rightColumn) => ({
      original: leftColumn,
      new: rightColumn,
      score: scoreColumnPair(left, right, leftColumn, rightColumn),
    })),
  ).sort((a, b) => b.score - a.score);

  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const suggestions: KeyColumnPair[] = [];

  candidates.forEach((candidate) => {
    if (candidate.score < 34) return;
    if (usedLeft.has(candidate.original) || usedRight.has(candidate.new)) return;
    usedLeft.add(candidate.original);
    usedRight.add(candidate.new);
    suggestions.push({ original: candidate.original, new: candidate.new });
  });

  return suggestions.slice(0, limit);
}

function scoreColumnPair(left: DataTable, right: DataTable, leftColumn: string, rightColumn: string): number {
  const leftName = normalizeColumnForMatch(leftColumn);
  const rightName = normalizeColumnForMatch(rightColumn);
  let score = 0;

  if (leftName === rightName) score += 70;
  else if (leftName.includes(rightName) || rightName.includes(leftName)) score += 36;

  const leftTokens = new Set(leftName.split(' ').filter(Boolean));
  const rightTokens = new Set(rightName.split(' ').filter(Boolean));
  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
  score += sharedTokens.length * 12;

  if (isIdentifierColumnName(leftColumn) && isIdentifierColumnName(rightColumn)) score += 18;
  if (isEmailColumnName(leftColumn) && isEmailColumnName(rightColumn)) score += 28;
  if (isNameLikeColumn(leftColumn) && isNameLikeColumn(rightColumn)) score += 8;

  score += sampleOverlapScore(left, right, leftColumn, rightColumn);
  return score;
}

function normalizeColumnForMatch(column: string): string {
  return column
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/\b(original|new|primary|reference|lookup|base|user|person|employee|customer|account)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sampleOverlapScore(left: DataTable, right: DataTable, leftColumn: string, rightColumn: string): number {
  const leftValues = sampleColumnValues(left, leftColumn);
  const rightValues = sampleColumnValues(right, rightColumn);
  if (leftValues.size === 0 || rightValues.size === 0) return 0;

  let matches = 0;
  leftValues.forEach((value) => {
    if (rightValues.has(value)) matches += 1;
  });

  return Math.min(30, Math.round((matches / Math.min(leftValues.size, rightValues.size)) * 30));
}

function sampleColumnValues(table: DataTable, column: string): Set<string> {
  const values = new Set<string>();
  table.rows.slice(0, 250).forEach((row) => {
    const value = formatCell(row[column]).trim().toLowerCase();
    if (value) values.add(value);
  });
  return values;
}

function isIdentifierColumnName(column: string): boolean {
  return /\b(id|identifier|key|number|no|code)\b/i.test(column);
}

function isEmailColumnName(column: string): boolean {
  return /\b(e-?mail|email|mail)\b/i.test(column);
}

function canContinueMatching(keyColumns: KeyColumnPair[]): boolean {
  return keyColumns.length > 0 && keyColumns.every((pair) => pair.original && pair.new);
}

function canRunComparison(comparedColumns: ComparedColumnPair[]): boolean {
  return comparedColumns.length > 0 && comparedColumns.every((pair) => pair.original && pair.new);
}

function buildCoverageResult(
  primary: DataTable,
  reference: DataTable,
  keyColumns: KeyColumnPair[],
): CoverageResult {
  if (!canContinueMatching(keyColumns)) {
    throw new Error('Choose at least one complete matching column.');
  }

  const duplicateKeys: DuplicateKeyWarning[] = [];
  const primaryIndex = indexCoverageRows(primary.rows, keyColumns, 'original', duplicateKeys);
  const referenceIndex = indexCoverageRows(reference.rows, keyColumns, 'new', duplicateKeys);
  const allPrimary: Record<string, CellValue>[] = [];
  const needsAttention: Record<string, CellValue>[] = [];
  const found: Record<string, CellValue>[] = [];
  const notInReference: Record<string, CellValue>[] = [];
  const matchedReference: Record<string, CellValue>[] = [];
  const referenceOnly: Record<string, CellValue>[] = [];

  primary.rows.forEach((primaryRow) => {
    const key = coverageKey(primaryRow, keyColumns, 'original');
    const primaryRows = key ? primaryIndex.get(key) : undefined;
    const referenceRows = key ? referenceIndex.get(key) : undefined;
    const referenceRow = referenceRows?.[0];
    const hasPrimaryDuplicate = Boolean(primaryRows && primaryRows.length > 1);
    const hasReferenceDuplicate = Boolean(referenceRows && referenceRows.length > 1);
    const status: CoverageStatus = !key
      ? 'Blank key'
      : !referenceRow
        ? 'Not found'
        : hasReferenceDuplicate
          ? 'Multiple reference matches'
          : hasPrimaryDuplicate
            ? 'Duplicate primary key'
          : 'Found';
    const auditRow = coverageAuditRow(
      status,
      coverageReason(status, primaryRows?.length ?? 0, referenceRows?.length ?? 0),
      key,
      primaryRow,
      referenceRows ?? [],
      primary,
      reference,
    );

    allPrimary.push(auditRow);
    if (status === 'Found') {
      found.push(auditRow);
    } else {
      needsAttention.push(auditRow);
    }
    if (status === 'Not found') {
      notInReference.push(auditRow);
    }
  });

  for (const [key, referenceRows] of referenceIndex.entries()) {
    const primaryRows = primaryIndex.get(key) ?? [];
    const status = primaryRows.length > 0 ? 'Matched' : 'Reference-only';
    referenceRows.forEach((referenceRow) => {
      const auditRow = coverageReferenceAuditRow(status, key, primaryRows, referenceRow, primary, reference);
      if (primaryRows.length > 0) matchedReference.push(auditRow);
      else referenceOnly.push(auditRow);
    });
  }

  return {
    allPrimary,
    needsAttention,
    found,
    notInReference,
    matchedReference,
    referenceOnly,
    groupSummary: buildCoverageGroupSummary(primaryIndex, referenceIndex, primary, reference),
    duplicateKeys,
    blankPrimaryKeys: countBlankCoverageKeys(primary.rows, keyColumns, 'original'),
    blankReferenceKeys: countBlankCoverageKeys(reference.rows, keyColumns, 'new'),
    checkedAt: new Date().toISOString(),
  };
}

function coverageReason(status: CoverageStatus, primaryMatchCount: number, referenceMatchCount: number): string {
  if (status === 'Blank key') return 'The primary row has no usable match key.';
  if (status === 'Not found') return 'No reference row uses this match key.';
  if (status === 'Duplicate primary key') return `${primaryMatchCount.toLocaleString()} primary rows use this match key.`;
  if (status === 'Multiple reference matches') return `${referenceMatchCount.toLocaleString()} reference rows use this match key.`;
  return 'A single matching reference row was found.';
}

function indexCoverageRows(
  rows: Record<string, CellValue>[],
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
  duplicateKeys: DuplicateKeyWarning[],
): Map<string, Record<string, CellValue>[]> {
  const index = new Map<string, Record<string, CellValue>[]>();

  rows.forEach((row) => {
    const key = coverageKey(row, keyColumns, side);
    if (!key) return;
    const bucket = index.get(key) ?? [];
    bucket.push(row);
    index.set(key, bucket);
  });

  for (const [key, bucket] of index.entries()) {
    if (bucket.length > 1) duplicateKeys.push({ side, key, count: bucket.length });
  }

  return index;
}

function countBlankCoverageKeys(
  rows: Record<string, CellValue>[],
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): number {
  return rows.filter((row) => !coverageKey(row, keyColumns, side)).length;
}

function coverageKey(
  row: Record<string, CellValue>,
  keyColumns: KeyColumnPair[],
  side: 'original' | 'new',
): string {
  const parts = keyColumns.map((pair) => formatCell(row[pair[side]]).trim());
  if (parts.every((part) => part === '')) return '';
  return parts.join('\u001f');
}

function coverageAuditRow(
  status: CoverageStatus,
  reason: string,
  key: string,
  primaryRow: Record<string, CellValue>,
  referenceRows: Record<string, CellValue>[],
  primary: DataTable,
  reference: DataTable,
): Record<string, CellValue> {
  const row: Record<string, CellValue> = {
    Status: status,
    Reason: reason,
    'Match key': key || null,
    'Reference match count': referenceRows.length,
  };

  primary.columns.forEach((column) => {
    row[`Primary ${column}`] = primaryRow[column] ?? null;
  });
  reference.columns.forEach((column) => {
    row[`Reference ${column}`] = referenceColumnSummary(referenceRows, column);
  });

  return row;
}

function referenceColumnSummary(rows: Record<string, CellValue>[], column: string): CellValue {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0][column] ?? null;

  const values = uniqueFormattedValues(rows.map((row) => row[column]));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return `${values.slice(0, 5).join(', ')}${values.length > 5 ? `, +${values.length - 5} more` : ''}`;
}

function uniqueFormattedValues(values: CellValue[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    const formatted = formatCell(value);
    if (!formatted || seen.has(formatted)) return;
    seen.add(formatted);
    unique.push(formatted);
  });

  return unique;
}

function coverageAuditColumns(primary: DataTable, referenceColumns: string[]): string[] {
  return [
    'Status',
    'Reason',
    'Match key',
    'Reference match count',
    ...primary.columns.map((column) => `Primary ${column}`),
    ...referenceColumns.map((column) => `Reference ${column}`),
  ];
}

function coverageReferenceAuditRow(
  status: 'Matched' | 'Reference-only',
  key: string,
  primaryRows: Record<string, CellValue>[],
  referenceRow: Record<string, CellValue>,
  primary: DataTable,
  reference: DataTable,
): Record<string, CellValue> {
  const row: Record<string, CellValue> = {
    Status: status,
    'Match key': key || null,
    'Primary match count': primaryRows.length,
  };

  primary.columns.forEach((column) => {
    row[`Primary ${column}`] = referencePrimaryColumnSummary(primaryRows, column);
  });
  reference.columns.forEach((column) => {
    row[`Reference ${column}`] = referenceRow[column] ?? null;
  });

  return row;
}

function referencePrimaryColumnSummary(rows: Record<string, CellValue>[], column: string): CellValue {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0][column] ?? null;

  const values = uniqueFormattedValues(rows.map((row) => row[column]));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return `${values.slice(0, 5).join(', ')}${values.length > 5 ? `, +${values.length - 5} more` : ''}`;
}

function coverageReferenceAuditColumns(primaryColumns: string[], reference: DataTable): string[] {
  return [
    'Status',
    'Match key',
    'Primary match count',
    ...primaryColumns.map((column) => `Primary ${column}`),
    ...reference.columns.map((column) => `Reference ${column}`),
  ];
}

function buildCoverageGroupSummary(
  primaryIndex: Map<string, Record<string, CellValue>[]>,
  referenceIndex: Map<string, Record<string, CellValue>[]>,
  primary: DataTable,
  reference: DataTable,
): Record<string, CellValue>[] {
  const keys = new Set([...primaryIndex.keys(), ...referenceIndex.keys()]);

  return [...keys].map((key) => {
    const primaryRows = primaryIndex.get(key) ?? [];
    const referenceRows = referenceIndex.get(key) ?? [];
    const status = groupSummaryStatus(primaryRows.length, referenceRows.length);
    const row: Record<string, CellValue> = {
      Status: status,
      'Match key': key,
      'Primary match count': primaryRows.length,
      'Reference match count': referenceRows.length,
    };

    primary.columns.forEach((column) => {
      row[`Primary ${column}`] = referencePrimaryColumnSummary(primaryRows, column);
    });
    reference.columns.forEach((column) => {
      row[`Reference ${column}`] = referenceColumnSummary(referenceRows, column);
    });

    return row;
  }).sort((left, right) => Number(right['Reference match count'] ?? 0) - Number(left['Reference match count'] ?? 0));
}

function groupSummaryStatus(primaryCount: number, referenceCount: number): string {
  if (primaryCount === 0) return 'Reference-only';
  if (referenceCount === 0) return 'Not in reference';
  if (primaryCount > 1) return 'Duplicate primary key';
  if (referenceCount > 1) return 'Multiple reference matches';
  return 'One-to-one match';
}

function coverageGroupSummaryColumns(primaryColumns: string[], referenceColumns: string[]): string[] {
  return [
    'Status',
    'Match key',
    'Primary match count',
    'Reference match count',
    ...primaryColumns.map((column) => `Primary ${column}`),
    ...referenceColumns.map((column) => `Reference ${column}`),
  ];
}

function coveragePrimaryContextColumns(primary: DataTable, keyColumns: KeyColumnPair[]): string[] {
  return uniqueColumns([
    ...keyColumns.map((pair) => pair.original),
    ...suggestedCoveragePrimaryColumns(primary, keyColumns),
  ]).filter((column) => primary.columns.includes(column));
}

function coverageReferenceContextColumns(
  reference: DataTable,
  keyColumns: KeyColumnPair[],
  selectedReferenceColumns: string[],
): string[] {
  return uniqueColumns([
    ...keyColumns.map((pair) => pair.new),
    ...selectedReferenceColumns,
  ]).filter((column) => reference.columns.includes(column));
}

function suggestedCoveragePrimaryColumns(primary: DataTable, keyColumns: KeyColumnPair[]): string[] {
  const keyColumnNames = new Set(keyColumns.map((pair) => pair.original).filter(Boolean));
  const priorityPatterns = [
    /name/i,
    /email|mail/i,
    /identifier|user.?id|uuid|parma|party/i,
    /org|dealer|branch|customer|account/i,
    /country|market|region/i,
  ];
  return primary.columns
    .filter((column) => !keyColumnNames.has(column) && priorityPatterns.some((pattern) => pattern.test(column)))
    .slice(0, 8);
}

function uniqueColumns(columns: string[]): string[] {
  const seen = new Set<string>();
  return columns.filter((column) => {
    if (!column || seen.has(column)) return false;
    seen.add(column);
    return true;
  });
}

function suggestedCoverageReferenceColumns(reference: DataTable, keyColumns: KeyColumnPair[]): string[] {
  const keyColumnNames = new Set(keyColumns.map((pair) => pair.new).filter(Boolean));
  const priorityPatterns = [
    /name/i,
    /email|mail/i,
    /identifier|user.?id|uuid|parma|party/i,
    /org|dealer|branch|customer|account/i,
    /country|market|region/i,
    /status|active/i,
    /created|creation|date/i,
  ];
  const suggested = reference.columns.filter((column) => (
    !keyColumnNames.has(column) && priorityPatterns.some((pattern) => pattern.test(column))
  ));

  return (suggested.length > 0 ? suggested : reference.columns.filter((column) => !keyColumnNames.has(column))).slice(0, 8);
}

function defaultCoverageView(result: CoverageResult): CoverageView {
  return result.allPrimary.length > 0 ? 'primaryAudit' : 'referenceAudit';
}

function canRunEnrichment(addedColumns: string[]): boolean {
  return addedColumns.length > 0;
}

function canContinueEnrichmentMatching(references: EnrichReference[]): boolean {
  return references.length > 0 && references.every((reference) => canContinueMatching(reference.keyColumns));
}

function canRunEnrichmentReference(reference: EnrichReference): boolean {
  return canContinueMatching(reference.keyColumns) && reference.addedColumns.length > 0;
}

function canRunEnrichmentReferences(references: EnrichReference[]): boolean {
  return references.length > 0 && references.every(canRunEnrichmentReference);
}

function buildChainBaseTable(base: DataTable, references: EnrichReference[], referencePosition: number): DataTable {
  let currentTable = base;

  for (const reference of references.slice(0, referencePosition)) {
    if (canRunEnrichmentReference(reference)) {
      try {
        const result = enrichTable(currentTable, reference.table, {
          keyColumns: reference.keyColumns,
          addedColumns: reference.addedColumns,
        });
        currentTable = {
          columns: result.columns,
          rows: result.rows,
          sourceName: base.sourceName,
          sheetName: base.sheetName,
        };
      } catch {
        currentTable = appendPlaceholderColumns(currentTable, reference.addedColumns);
      }
    } else {
      currentTable = appendPlaceholderColumns(currentTable, reference.addedColumns);
    }
  }

  return currentTable;
}

function appendPlaceholderColumns(table: DataTable, addedColumns: string[]): DataTable {
  const columns = [...table.columns];
  const rows = table.rows.map((row) => ({ ...row }));

  addedColumns.forEach((column) => {
    const outputColumn = uniqueDisplayColumn(columns, column);
    columns.push(outputColumn);
    rows.forEach((row) => {
      row[outputColumn] = null;
    });
  });

  return { ...table, columns, rows };
}

function uniqueDisplayColumn(existingColumns: string[], column: string): string {
  const used = new Set(existingColumns);
  if (!used.has(column)) return column;

  const base = `Reference ${column}`;
  if (!used.has(base)) return base;

  let index = 2;
  while (used.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

function defaultResultView(result: ComparisonResult): ResultView {
  if (result.reconciliation.length > 0) return 'reconciliation';
  if (result.summary.changed > 0) return 'changed';
  if (result.summary.added > 0) return 'added';
  if (result.summary.removed > 0) return 'removed';
  return 'unchanged';
}

function reconciliationTableColumns(config: ComparisonConfig): string[] {
  return [
    ...config.keyColumns.map((pair) => pair.original),
    'Status',
    'Different Fields',
    'Different Field Count',
    ...config.comparedColumns.flatMap((pair) => [
      `Original ${pair.original}`,
      `New ${pair.new}`,
    ]),
  ];
}

function reconciliationSummaryTableColumns(config: ComparisonConfig): string[] {
  return [
    'Rows',
    'Status',
    'Different Fields',
    'Different Field Count',
    'Example Keys',
    ...config.comparedColumns.flatMap((pair) => [
      `Original ${pair.original}`,
      `New ${pair.new}`,
    ]),
  ];
}

function columnsForResultView(
  view: ResultView,
  originalTable: DataTable,
  nextTable: DataTable,
): string[] {
  if (view === 'removed' || view === 'unchanged') return originalTable.columns;
  return nextTable.columns;
}

function changedTableColumns(config: ComparisonConfig): string[] {
  return [
    ...config.keyColumns.map((pair) => pair.original),
    'Field',
    'Original Value',
    'New Value',
    'Same Change Count',
  ];
}

function resultViewLabel(view: ResultView): string {
  const labels: Record<ResultView, string> = {
    reconciliation: 'Reconciliation',
    reconciliationSummary: 'Summary',
    changed: 'Different',
    added: 'Only in new',
    removed: 'Missing in new',
    unchanged: 'Same',
  };
  return labels[view];
}

function resultViewFileName(view: ResultView): string {
  return resultViewLabel(view).toLocaleLowerCase().replace(/\s+/g, '-');
}

function coverageViewLabel(view: CoverageView): string {
  if (view === 'primaryAudit') return 'Primary audit';
  if (view === 'referenceAudit') return 'Reference audit';
  return 'Group summary';
}

function coverageViewFileName(view: CoverageView): string {
  return coverageViewLabel(view).toLocaleLowerCase().replace(/\s+/g, '-');
}

function formatPercent(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2,
    minimumFractionDigits: value === 100 || value === 0 ? 0 : 1,
  });
}

function metric(label: keyof typeof statusDescriptions, value: number, description: string, detail?: string) {
  return (
    <div className="metric" key={label}>
      <div className="metric-label">
        <span>{label}</span>
        <button className="info-button" type="button" aria-label={`${label}: ${description}`} title={description}>
          <Info size={15} aria-hidden="true" />
          <span className="tooltip" role="tooltip">{description}</span>
        </button>
      </div>
      <strong>{value.toLocaleString()}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function coverageMetric(label: string, value: string, description: string) {
  return (
    <div className="metric" key={label}>
      <div className="metric-label">
        <span>{label}</span>
        <button className="info-button" type="button" aria-label={`${label}: ${description}`} title={description}>
          <Info size={15} aria-hidden="true" />
          <span className="tooltip" role="tooltip">{description}</span>
        </button>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function exportCoverageWorkbook(
  result: CoverageResult,
  config: {
    primaryAuditColumns: string[];
    referenceAuditColumns: string[];
    groupSummaryColumns: string[];
    primaryName: string;
    referenceName: string;
    keyColumns: KeyColumnPair[];
  },
): void {
  const workbook = XLSX.utils.book_new();
  const referenceAuditRows = [...result.matchedReference, ...result.referenceOnly];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Coverage summary', ''],
      ['Primary file', config.primaryName],
      ['Reference file', config.referenceName],
      ['Matching columns', config.keyColumns.map((pair) => `${pair.original} = ${pair.new}`).join('; ')],
      ['Primary audit rows', String(result.allPrimary.length)],
      ['Primary issues', String(result.needsAttention.length)],
      ['One-to-one matches', String(result.found.length)],
      ['Not in reference', String(result.notInReference.length)],
      ['Matched reference rows', String(result.matchedReference.length)],
      ['Reference-only rows', String(result.referenceOnly.length)],
      ['Blank primary keys', String(result.blankPrimaryKeys)],
      ['Blank reference keys', String(result.blankReferenceKeys)],
      ['Exported at', new Date().toISOString()],
    ]),
    'Summary',
  );
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(result.allPrimary, config.primaryAuditColumns), 'Primary Audit');
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(referenceAuditRows, config.referenceAuditColumns), 'Reference Audit');
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(result.groupSummary, config.groupSummaryColumns), 'Group Summary');
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(result.notInReference, config.primaryAuditColumns), 'Not In Reference');
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(result.referenceOnly, config.referenceAuditColumns), 'Reference Only');

  XLSX.writeFile(workbook, `coverage-result-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function rowsToSheet(rows: Record<string, CellValue>[], columns: string[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    columns,
    ...rows.map((row) => columns.map((column) => row[column] ?? '')),
  ]);
}

function enrichmentMetric(label: string, value: number, description: string) {
  return (
    <div className="metric" key={label}>
      <div className="metric-label">
        <span>{label}</span>
        <button className="info-button" type="button" aria-label={`${label}: ${description}`} title={description}>
          <Info size={15} aria-hidden="true" />
          <span className="tooltip" role="tooltip">{description}</span>
        </button>
      </div>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function privacyColumnInfos(
  task: AppTask,
  originalTable: DataTable,
  nextTable: DataTable,
  comparedColumns: ComparedColumnPair[],
  addedColumns: string[],
): PrivacyColumnInfo[] {
  const sourceColumns = task === 'privacy'
    ? originalTable.columns.map((column) => ({ outputColumn: column, sourceColumn: column, table: originalTable }))
    : task === 'enrich'
    ? [
      ...originalTable.columns.map((column) => ({ outputColumn: column, sourceColumn: column, table: originalTable })),
      ...addedColumns.map((column) => ({ outputColumn: column, sourceColumn: column, table: nextTable })),
    ]
    : [
      ...originalTable.columns.map((column) => ({ outputColumn: column, sourceColumn: column, table: originalTable })),
      ...nextTable.columns.map((column) => ({ outputColumn: column, sourceColumn: column, table: nextTable })),
      ...comparedColumns.flatMap((pair) => [
        { outputColumn: `Original ${pair.original}`, sourceColumn: pair.original, table: originalTable },
        { outputColumn: `New ${pair.new}`, sourceColumn: pair.new, table: nextTable },
      ]),
    ];

  const seen = new Set<string>();
  const infos = sourceColumns
    .filter(({ outputColumn }) => {
      if (!outputColumn.trim() || seen.has(outputColumn)) return false;
      seen.add(outputColumn);
      return true;
    })
    .map(({ outputColumn, sourceColumn, table }) => {
      const sample = sampleValueForColumn(table, sourceColumn);
      return {
        column: outputColumn,
        detectedKind: detectPrivacyKind(outputColumn, sample),
        sample,
      };
    });

  return infos.sort((left, right) => {
    const leftSensitive = privacyKindRank(left.detectedKind);
    const rightSensitive = privacyKindRank(right.detectedKind);
    if (leftSensitive !== rightSensitive) return leftSensitive - rightSensitive;
    return left.column.localeCompare(right.column, undefined, { sensitivity: 'base' });
  });
}

function enrichmentPrivacyColumnInfos(
  originalTable: DataTable,
  references: EnrichReference[],
): PrivacyColumnInfo[] {
  const sourceColumns = [
    ...originalTable.columns.map((column) => ({ outputColumn: column, sourceColumn: column, table: originalTable })),
    ...references.flatMap((reference) => (
      reference.addedColumns.map((column) => ({ outputColumn: column, sourceColumn: column, table: reference.table }))
    )),
  ];

  return buildPrivacyColumnInfos(sourceColumns);
}

function buildPrivacyColumnInfos(
  sourceColumns: { outputColumn: string; sourceColumn: string; table: DataTable }[],
): PrivacyColumnInfo[] {
  const seen = new Set<string>();
  const infos = sourceColumns
    .filter(({ outputColumn }) => {
      if (!outputColumn.trim() || seen.has(outputColumn)) return false;
      seen.add(outputColumn);
      return true;
    })
    .map(({ outputColumn, sourceColumn, table }) => {
      const sample = sampleValueForColumn(table, sourceColumn);
      return {
        column: outputColumn,
        detectedKind: detectPrivacyKind(outputColumn, sample),
        sample,
      };
    });

  return infos.sort((left, right) => {
    const leftSensitive = privacyKindRank(left.detectedKind);
    const rightSensitive = privacyKindRank(right.detectedKind);
    if (leftSensitive !== rightSensitive) return leftSensitive - rightSensitive;
    return left.column.localeCompare(right.column, undefined, { sensitivity: 'base' });
  });
}

function transformRowsForPrivacy(
  rows: Record<string, CellValue>[],
  transforms: PrivacyTransforms,
  typeOverrides: PrivacyTypeOverrides,
): Record<string, CellValue>[] {
  if (Object.keys(transforms).length === 0) return rows;
  return rows.map((row) => transformRecordForPrivacy(row, transforms, typeOverrides));
}

function transformCoverageResultForPrivacy(
  result: CoverageResult,
  transforms: PrivacyTransforms,
  typeOverrides: PrivacyTypeOverrides,
): CoverageResult {
  if (Object.keys(transforms).length === 0) return result;

  return {
    ...result,
    allPrimary: transformRowsForPrivacy(result.allPrimary, transforms, typeOverrides),
    needsAttention: transformRowsForPrivacy(result.needsAttention, transforms, typeOverrides),
    found: transformRowsForPrivacy(result.found, transforms, typeOverrides),
    notInReference: transformRowsForPrivacy(result.notInReference, transforms, typeOverrides),
    matchedReference: transformRowsForPrivacy(result.matchedReference, transforms, typeOverrides),
    referenceOnly: transformRowsForPrivacy(result.referenceOnly, transforms, typeOverrides),
    groupSummary: transformRowsForPrivacy(result.groupSummary, transforms, typeOverrides),
  };
}

function transformComparisonResultForPrivacy(
  result: ComparisonResult,
  transforms: PrivacyTransforms,
  typeOverrides: PrivacyTypeOverrides,
): ComparisonResult {
  if (Object.keys(transforms).length === 0) return result;

  return {
    ...result,
    added: transformRowsForPrivacy(result.added, transforms, typeOverrides),
    removed: transformRowsForPrivacy(result.removed, transforms, typeOverrides),
    unchanged: transformRowsForPrivacy(result.unchanged, transforms, typeOverrides),
    changed: result.changed.map((row) => ({
      ...row,
      key: transformRecordForPrivacy(row.key, transforms, typeOverrides),
      originalRow: transformRecordForPrivacy(row.originalRow, transforms, typeOverrides),
      newRow: transformRecordForPrivacy(row.newRow, transforms, typeOverrides),
      changes: row.changes.map((change) => ({
        ...change,
        originalValue: transformCellForPrivacy(change.originalColumn, change.originalValue, transforms, typeOverrides, row.originalRow),
        newValue: transformCellForPrivacy(change.newColumn, change.newValue, transforms, typeOverrides, row.newRow),
      })),
    })),
    reconciliation: result.reconciliation.map((entry) => ({
      ...entry,
      key: transformRecordForPrivacy(entry.key, transforms, typeOverrides),
      originalRow: entry.originalRow ? transformRecordForPrivacy(entry.originalRow, transforms, typeOverrides) : undefined,
      newRow: entry.newRow ? transformRecordForPrivacy(entry.newRow, transforms, typeOverrides) : undefined,
      changes: entry.changes.map((change) => ({
        ...change,
        originalValue: transformCellForPrivacy(change.originalColumn, change.originalValue, transforms, typeOverrides, entry.originalRow),
        newValue: transformCellForPrivacy(change.newColumn, change.newValue, transforms, typeOverrides, entry.newRow),
      })),
    })),
  };
}

function transformRecordForPrivacy(
  row: Record<string, CellValue>,
  transforms: PrivacyTransforms,
  typeOverrides: PrivacyTypeOverrides,
): Record<string, CellValue> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      transformCellForPrivacy(column, value, transforms, typeOverrides, row),
    ]),
  );
}

function transformCellForPrivacy(
  column: string,
  value: CellValue,
  transforms: PrivacyTransforms,
  typeOverrides: PrivacyTypeOverrides,
  row?: Record<string, CellValue>,
): CellValue {
  const mode = privacyModeForColumn(column, transforms);
  if (!mode || value === null || value === '') return value;
  const text = String(value);
  const kind = privacyKindForColumn(column, text, typeOverrides);

  if (mode === 'hide') {
    if (kind === 'email') return 'hidden.user@example.com';
    if (kind === 'string') return '[string hidden]';
    if (kind === 'id') return '[id hidden]';
    if (kind === 'date') return '1900-01-01';
    if (kind === 'number') return typeof value === 'number' ? 0 : '0';
    if (kind === 'category') return '[category hidden]';
    return '[hidden]';
  }

  const id = stablePrivacyId(text);
  if (kind === 'email') return pseudonymizedEmail(text, row);
  if (kind === 'string') return isNameLikeColumn(column) ? pseudonymizedPersonName(text) : `String ${id}`;
  if (kind === 'id') return `ID-${id}`;
  if (kind === 'date') return pseudonymizedDate(text, id);
  if (kind === 'number') return pseudonymizedNumber(value, id);
  if (kind === 'category') return `Category ${id}`;
  return `Value ${id}`;
}

function privacyModeForColumn(column: string, transforms: PrivacyTransforms): PrivacyMode | undefined {
  if (transforms[column]) return transforms[column];

  const withoutPrefix = column.replace(/^(Original|New|Reference|Primary)\s+/i, '');
  return transforms[withoutPrefix];
}

function privacyKindForColumn(
  column: string,
  value: string,
  typeOverrides: PrivacyTypeOverrides,
): PrivacyKind {
  if (typeOverrides[column]) return typeOverrides[column];

  const withoutPrefix = column.replace(/^(Original|New|Reference|Primary)\s+/i, '');
  return typeOverrides[withoutPrefix] ?? detectPrivacyKind(column, value);
}

function detectPrivacyKind(column: string, value: string): PrivacyKind {
  if (/email|mail/i.test(column) || value.includes('@')) return 'email';
  if (isIdColumn(column, value)) return 'id';
  if (isOrganizationColumn(column)) return 'category';
  if (isNameLikeColumn(column)) return 'string';
  if (isDateLike(value) || /date|created|updated|start|end/i.test(column)) return 'date';
  if (isNumberLike(value) || /\b(amount|sales|revenue|cost|price|score|count|total|number)\b/i.test(column)) return 'number';
  if (isLikelyCategoryColumn(column, value)) return 'category';
  if (typeof value === 'string' && value.trim()) return 'string';
  return 'value';
}

function sampleValueForColumn(table: DataTable, column: string): string {
  const sample = table.rows
    .slice(0, 100)
    .map((row) => row[column])
    .find((value) => value !== null && value !== undefined && String(value).trim() !== '');
  return sample === undefined ? '' : String(sample);
}

function privacyKindRank(kind: PrivacyKind): number {
  const ranks: Record<PrivacyKind, number> = {
    email: 0,
    string: 1,
    id: 2,
    date: 3,
    number: 4,
    category: 5,
    value: 6,
  };
  return ranks[kind];
}

function privacyKindLabel(kind: PrivacyKind): string {
  const labels: Record<PrivacyKind, string> = {
    email: 'Email',
    string: 'String',
    id: 'ID',
    date: 'Date',
    number: 'Number',
    category: 'Category',
    value: 'Other value',
  };
  return labels[kind];
}

function primaryActionLabel(kind: PrivacyKind): string {
  const labels: Record<PrivacyKind, string> = {
    email: 'Pseudonymize',
    string: 'Pseudonymize',
    id: 'Pseudonymize',
    date: 'Shift date',
    number: 'Randomize',
    category: 'Replace',
    value: 'Replace',
  };
  return labels[kind];
}

function secondaryActionLabel(kind: PrivacyKind): string {
  const labels: Record<PrivacyKind, string> = {
    email: 'Anonymize',
    string: 'Anonymize',
    id: 'Anonymize',
    date: 'Hide date',
    number: 'Hide number',
    category: 'Hide',
    value: 'Hide value',
  };
  return labels[kind];
}

function actionHint(kind: PrivacyKind): string {
  const hints: Record<PrivacyKind, string> = {
    email: 'Pseudonymize creates a realistic fake email. Anonymize uses a generic hidden email.',
    string: 'Pseudonymize creates a consistent fake string. Anonymize hides the value.',
    id: 'Pseudonymize creates a consistent fake ID. Anonymize hides the ID.',
    date: 'Shift date moves the date consistently. Hide date uses a neutral placeholder date.',
    number: 'Randomize creates a replacement number. Hide number uses 0.',
    category: 'Replace creates a consistent fake category. Hide removes the category value.',
    value: 'Replace creates a consistent fake value. Hide removes the value.',
  };
  return hints[kind];
}

function isIdColumn(column: string, value: string): boolean {
  if (/\b(id|identifier|key)\b/i.test(column)) return true;
  return /^[A-Z]{1,4}[-]?\d{2,}([-_][A-Z0-9]+)?$/i.test(value.trim());
}

function isLikelyCategoryColumn(column: string, value: string): boolean {
  if (/\b(country|region|segment|department|status|currency|category|type|group)\b/i.test(column)) return true;
  return value.trim().length > 0 && value.trim().length <= 40 && !/\d{4}/.test(value);
}

function isOrganizationColumn(column: string): boolean {
  return /\b(organization|organisation|company|dealer|branch name|account)\b/i.test(column);
}

function isNameLikeColumn(column: string): boolean {
  return /\b(name|person|employee)\b/i.test(column) && !isOrganizationColumn(column);
}

function isDateLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) return false;
  return Number.isFinite(Date.parse(trimmed));
}

function isNumberLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed.replace(/,/g, '')));
}

function pseudonymizedDate(value: string, id: string): string {
  const original = new Date(value);
  const offsetDays = (Number(id) % 730) - 365;
  const date = Number.isFinite(original.getTime()) ? original : new Date(Date.UTC(2020, 0, 1));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function pseudonymizedPersonName(value: string): string {
  const id = stablePrivacyId(value);
  const identity = fakeIdentity(id);
  return `${identity.firstName} ${identity.lastName} ${id}`;
}

function pseudonymizedEmail(value: string, row?: Record<string, CellValue>): string {
  const sourceName = findNameValue(row);
  const id = stablePrivacyId(sourceName || value);
  const identity = fakeIdentity(id);
  return `${identity.firstName}.${identity.lastName}${id}@example.com`.toLocaleLowerCase();
}

function fakeIdentity(id: string): { firstName: string; lastName: string } {
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Jamie', 'Robin', 'Avery'];
  const lastNames = ['Anders', 'Bergman', 'Lind', 'Stone', 'Reed', 'Hart', 'Lane', 'West', 'Nordin', 'Vale'];
  const numeric = Number(id);
  return {
    firstName: firstNames[numeric % firstNames.length],
    lastName: lastNames[Math.floor(numeric / firstNames.length) % lastNames.length],
  };
}

function findNameValue(row?: Record<string, CellValue>): string {
  if (!row) return '';
  const entry = Object.entries(row).find(([column, value]) =>
    value !== null
    && value !== ''
    && isNameLikeColumn(column),
  );
  return entry ? String(entry[1]) : '';
}

function pseudonymizedNumber(value: CellValue, id: string): CellValue {
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  const replacement = (Number(id) % 90000) + 1000;
  if (typeof value === 'number') return replacement;
  if (!Number.isFinite(numeric)) return String(replacement);
  return String(replacement);
}

function stablePrivacyId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return String((hash % 100000) + 1).padStart(5, '0');
}

function filterRows(rows: Record<string, CellValue>[], search: string) {
  if (!search.trim()) return rows;
  return rows.filter((row) => rowMatchesSearch(row, search));
}

function sampleFileName(target: SampleTarget, kind: SampleKind, task: AppTask): string {
  if (task === 'coverage') {
    if (target === 'original') return kind === 'messy' ? 'RequiredParticipantsMessy.csv' : 'RequiredParticipants.csv';
    if (target === 'new') return kind === 'messy' ? 'RegisteredParticipantsMessy.csv' : 'RegisteredParticipants.csv';
  }
  if (target === 'original') return kind === 'messy' ? 'PersonalMessy.csv' : 'Personal.csv';
  if (target === 'new') return kind === 'messy' ? 'ParmaReferenceMessy.csv' : 'ParmaReference.csv';
  if (extraReferenceIndex(target) > 0) return kind === 'messy' ? 'ComplianceRecordsMessy.csv' : 'ComplianceRecords.csv';
  return kind === 'messy' ? 'BranchInsightsMessy.csv' : 'BranchInsights.csv';
}

function sampleDisplayName(target: SampleTarget, kind: SampleKind, task: AppTask): string {
  if (task === 'coverage') {
    if (target === 'original') return kind === 'messy' ? 'Required participants Messy' : 'Required participants';
    if (target === 'new') return kind === 'messy' ? 'Registered participants Messy' : 'Registered participants';
  }
  if (target === 'original') return kind === 'messy' ? 'Personal Messy' : 'Personal';
  if (target === 'new') return kind === 'messy' ? 'PARMA Reference Messy' : 'PARMA Reference';
  if (extraReferenceIndex(target) > 0) return kind === 'messy' ? 'Compliance Records Messy' : 'Compliance Records';
  return kind === 'messy' ? 'Branch Insights Messy' : 'Branch Insights';
}

function sampleFileDescription(target: SampleTarget, kind: SampleKind, task: AppTask): string {
  if (task === 'coverage') {
    if (target === 'original') {
      return kind === 'messy'
        ? 'Fictional required participant list with blank, duplicate, and missing-registration cases.'
        : 'Fictional required participant list for coverage testing.';
    }
    if (target === 'new') {
      return kind === 'messy'
        ? 'Fictional registration population with duplicates, reference-only rows, and messy fields.'
        : 'Fictional registration population with all required participants plus optional attendees.';
    }
  }
  if (target === 'original') {
    return kind === 'messy'
      ? 'Fictional user list with blanks and spelling inconsistencies.'
      : 'Fictional user list with repeated PARMA IDs.';
  }
  if (target === 'new') {
    return kind === 'messy'
      ? 'Fictional reference list with blanks, extra branches, and missing branches.'
      : 'Fictional account/reference list with organization details.';
  }
  if (extraReferenceIndex(target) > 0) {
    return kind === 'messy'
      ? 'Fictional compliance lookup with blanks, spelling variations, missing branches, and extra branches.'
      : 'Fictional compliance lookup with fields that can be added to Personal.';
  }

  return kind === 'messy'
    ? 'Fictional branch insight lookup with blanks, spelling variations, missing branches, and extra branches.'
    : 'Fictional branch insight lookup with fields that can be added to Personal.';
}

function extraReferenceIndex(target: SampleTarget): number {
  return Number(target.replace('extra-', ''));
}

async function fetchSampleFile(fileName: string): Promise<File> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample-data/${fileName}`);
  if (!response.ok) {
    throw new Error('Sample data could not be loaded.');
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: 'text/csv' });
}

export default App;
