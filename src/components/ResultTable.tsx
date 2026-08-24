import { useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, ListFilter, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { CellValue } from '../types';
import { formatCell } from '../utils/format';
import { valueMatchesSearch } from '../utils/search';

interface ResultTableProps {
  rows: Record<string, CellValue>[];
  columns?: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
  selectedColumns?: string[];
  onColumnSelect?: (column: string) => void;
  onColumnDeselect?: (column: string) => void;
}

type SortState = {
  column: string;
  direction: 'asc' | 'desc';
} | null;

type TableColumnItem =
  | { type: 'visible'; column: string }
  | { type: 'hidden'; id: string; columns: string[] };

const defaultColumnWidth = 180;
const minColumnWidth = 90;

export function ResultTable({
  rows,
  columns,
  onVisibleColumnsChange,
  selectedColumns = [],
  onColumnSelect,
  onColumnDeselect,
}: ResultTableProps) {
  const allColumns = useMemo(() => columns ?? Object.keys(rows[0] ?? {}), [columns, rows]);
  const selectedColumnSet = useMemo(() => new Set(selectedColumns), [selectedColumns]);
  const canSelectColumns = Boolean(onColumnSelect);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [hiddenColumnGroups, setHiddenColumnGroups] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [openHiddenGroup, setOpenHiddenGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const displayedColumns = useMemo(
    () => allColumns.filter((column) => !hiddenColumns.has(column)),
    [allColumns, hiddenColumns],
  );
  const tableItems = useMemo(
    () => buildTableColumnItems(allColumns, hiddenColumns, hiddenColumnGroups),
    [allColumns, hiddenColumns, hiddenColumnGroups],
  );

  const processedRows = useMemo(() => {
    const activeFilters = Object.entries(filters)
      .filter(([, values]) => values.size > 0);

    const filtered = activeFilters.length === 0
      ? rows
      : rows.filter((row) =>
        activeFilters.every(([column, values]) =>
          values.has(formatCell(row[column])),
        ),
      );

    if (!sort) return filtered;

    return [...filtered].sort((left, right) => {
      const comparison = compareValues(left[sort.column], right[sort.column]);
      return sort.direction === 'asc' ? comparison : comparison * -1;
    });
  }, [filters, rows, sort]);

  const visibleRows = processedRows.slice(0, 500);

  useEffect(() => {
    onVisibleColumnsChange?.(displayedColumns);
  }, [displayedColumns, onVisibleColumnsChange]);

  if (rows.length === 0) {
    return <div className="empty-state">No rows in this view.</div>;
  }

  return (
    <>
      <div className="table-tools">
        <details className="column-menu">
          <summary>
            <SlidersHorizontal size={18} /> Columns
          </summary>
          <div className="column-menu-panel">
            <button
              className="secondary compact"
              type="button"
              onClick={() => {
                setHiddenColumns(new Set());
                setHiddenColumnGroups({});
              }}
            >
              <RotateCcw size={16} /> Show all
            </button>
            {allColumns.map((column) => (
              <label className="column-toggle" key={column}>
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(column)}
                  onChange={(event) => {
                    if (event.target.checked) unhideColumn(column);
                    else hideColumn(column);
                  }}
                />
                <span>{column}</span>
              </label>
            ))}
          </div>
        </details>
        <button
          className="secondary compact"
          type="button"
          onClick={() => {
            setFilters({});
            setFilterSearch({});
            setSort(null);
          }}
        >
          <RotateCcw size={16} /> Clear filters
        </button>
        <span className="muted">
          {processedRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
        </span>
      </div>

      {displayedColumns.length === 0 ? (
        <div className="empty-state">All columns are hidden.</div>
      ) : (
        <div className="table-wrap data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {tableItems.map((item) => {
                  if (item.type === 'hidden') {
                    return (
                      <th className="hidden-columns-cell" key={item.id}>
                        <HiddenColumnsMarker
                          columns={item.columns}
                          isOpen={openHiddenGroup === item.id}
                          onOpenChange={(open) => {
                            setOpenFilterColumn(null);
                            setOpenHiddenGroup(open ? item.id : null);
                          }}
                          onUnhide={(column) => {
                            unhideColumn(column);
                          }}
                          onUnhideAll={() => {
                            unhideColumns(item.columns);
                            setOpenHiddenGroup(null);
                          }}
                        />
                      </th>
                    );
                  }

                  const column = item.column;
                  const selected = selectedColumnSet.has(column);
                  return (
                    <th className={selected ? 'selectable-column selected-column' : canSelectColumns ? 'selectable-column' : undefined} key={column} style={{ width: columnWidths[column] ?? defaultColumnWidth }}>
                      <div className="column-header">
                        <button
                          className="sort-button"
                          type="button"
                          onClick={() => setSort(nextSortState(sort, column))}
                          aria-label={`Sort by ${column}`}
                          title={`Sort by ${column}`}
                        >
                          <span>{column}</span>
                          {sort?.column === column && sort.direction === 'desc' ? <ArrowDownAZ size={15} /> : <ArrowUpAZ size={15} />}
                        </button>
                        <button
                          className="hide-column-button"
                          type="button"
                          aria-label={`Hide ${column}`}
                          title={`Hide ${column}`}
                          onClick={() => hideColumn(column)}
                        >
                          <EyeOff size={15} />
                        </button>
                        <ColumnFilterMenu
                          column={column}
                          isOpen={openFilterColumn === column}
                          onOpenChange={(open) => {
                            setOpenHiddenGroup(null);
                            setOpenFilterColumn(open ? column : null);
                          }}
                          rows={rows}
                          selectedValues={filters[column]}
                          search={filterSearch[column] ?? ''}
                          onSearchChange={(value) => setFilterSearch({ ...filterSearch, [column]: value })}
                          onFilterChange={(values) => {
                            const nextFilters = { ...filters };
                            if (values === null) delete nextFilters[column];
                            else nextFilters[column] = values;
                            setFilters(nextFilters);
                          }}
                        />
                        <span
                          className="resize-handle"
                          role="separator"
                          aria-label={`Resize ${column}`}
                          onMouseDown={(event) => startColumnResize(event, column, columnWidths[column] ?? defaultColumnWidth, setColumnWidths)}
                        />
                        {canSelectColumns ? (
                          <button
                            className="select-column-button"
                            type="button"
                            onClick={() => {
                              if (selected) onColumnDeselect?.(column);
                              else onColumnSelect?.(column);
                            }}
                          >
                            {selected ? 'Deselect' : 'Use column'}
                          </button>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {tableItems.map((item) => {
                    if (item.type === 'hidden') {
                      return <td className="hidden-columns-cell" key={item.id} />;
                    }

                    return (
                      <td
                        key={item.column}
                        style={{ width: columnWidths[item.column] ?? defaultColumnWidth }}
                        title={formatCell(row[item.column])}
                      >
                        {formatCell(row[item.column])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {processedRows.length === 0 ? (
        <p className="muted">No rows match the current filters.</p>
      ) : null}
      {processedRows.length > visibleRows.length ? (
        <p className="muted">Showing the first {visibleRows.length.toLocaleString()} matching rows.</p>
      ) : null}
    </>
  );

  function hideColumn(column: string): void {
    const nextHidden = new Set(hiddenColumns).add(column);
    const nextGroups = { ...hiddenColumnGroups };
    const columnIndex = allColumns.indexOf(column);
    const previousColumn = allColumns[columnIndex - 1];
    const nextColumn = allColumns[columnIndex + 1];
    const previousGroup = previousColumn && hiddenColumns.has(previousColumn) ? nextGroups[previousColumn] : undefined;
    const followingGroup = nextColumn && hiddenColumns.has(nextColumn) ? nextGroups[nextColumn] : undefined;
    const groupId = previousGroup ?? followingGroup ?? `hidden-group-${column}`;

    nextGroups[column] = groupId;

    if (previousGroup && followingGroup && previousGroup !== followingGroup) {
      Object.entries(nextGroups).forEach(([groupColumn, existingGroup]) => {
        if (existingGroup === followingGroup) nextGroups[groupColumn] = previousGroup;
      });
    }

    setHiddenColumns(nextHidden);
    setHiddenColumnGroups(nextGroups);
  }

  function unhideColumn(column: string): void {
    unhideColumns([column]);
  }

  function unhideColumns(columnsToUnhide: string[]): void {
    const nextHidden = new Set(hiddenColumns);
    const nextGroups = { ...hiddenColumnGroups };
    columnsToUnhide.forEach((column) => {
      nextHidden.delete(column);
      delete nextGroups[column];
    });
    setHiddenColumns(nextHidden);
    setHiddenColumnGroups(nextGroups);
  }
}

interface HiddenColumnsMarkerProps {
  columns: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUnhide: (column: string) => void;
  onUnhideAll: () => void;
}

function HiddenColumnsMarker({
  columns,
  isOpen,
  onOpenChange,
  onUnhide,
  onUnhideAll,
}: HiddenColumnsMarkerProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function updatePosition(): void {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 280;
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
    });
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    updatePosition();

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false);
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="hidden-marker">
      <button
        ref={triggerRef}
        className="hidden-marker-button"
        type="button"
        aria-label={`${columns.length} hidden columns. Click to show hidden columns.`}
        title={`${columns.length} hidden columns. Click to show hidden columns.`}
        onClick={() => {
          updatePosition();
          onOpenChange(!isOpen);
        }}
      >
        {columns.length}
      </button>
      {isOpen && position ? createPortal(
        <div
          ref={panelRef}
          className="hidden-columns-panel"
          style={{ top: position.top, left: position.left }}
        >
          <div className="filter-menu-title">
            <strong>{columns.length} hidden columns</strong>
            <span>Click a column to unhide it.</span>
          </div>
          <button className="secondary compact" type="button" onClick={onUnhideAll}>
            <Eye size={16} /> Unhide all
          </button>
          <div className="hidden-column-list">
            {columns.map((column) => (
              <button className="hidden-column-item" type="button" key={column} onClick={() => onUnhide(column)}>
                <Eye size={15} />
                <span>{column}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

interface ColumnFilterMenuProps {
  column: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  rows: Record<string, CellValue>[];
  selectedValues: Set<string> | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (values: Set<string> | null) => void;
}

function ColumnFilterMenu({
  column,
  isOpen,
  onOpenChange,
  rows,
  selectedValues,
  search,
  onSearchChange,
  onFilterChange,
}: ColumnFilterMenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const values = useMemo(() => {
    const unique = new Set(rows.map((row) => formatCell(row[column])));
    return [...unique].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  }, [column, rows]);
  const visibleValues = values.filter((value) => valueMatchesSearch(value, search));
  const displayedValues = visibleValues.slice(0, 500);
  const active = Boolean(selectedValues);
  const checkedCount = selectedValues?.size ?? values.length;

  function toggleValue(value: string, checked: boolean): void {
    const nextValues = new Set(selectedValues ?? values);
    if (checked) nextValues.add(value);
    else nextValues.delete(value);
    onFilterChange(nextValues.size === values.length ? null : nextValues);
  }

  function applyAndClose(): void {
    if (!selectedValues && search.trim()) {
      const nextValues = new Set(visibleValues);
      if (nextValues.size > 0) {
        onFilterChange(nextValues.size === values.length ? null : nextValues);
      }
    }
    onOpenChange(false);
  }

  function updatePosition(): void {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 300;
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
    });
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    updatePosition();
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false);
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`filter-menu ${active ? 'active' : ''}`}>
      <button
        ref={triggerRef}
        className="filter-menu-trigger"
        type="button"
        aria-label={active ? `${column} is filtered. ${checkedCount} of ${values.length} values selected.` : `Filter ${column}`}
        title={active ? `${column} is filtered. ${checkedCount} of ${values.length} values selected.` : `Filter ${column}`}
        onClick={() => {
          updatePosition();
          onOpenChange(!isOpen);
        }}
      >
        <ListFilter size={15} />
      </button>
      {isOpen && position ? createPortal(
        <div
          ref={panelRef}
          className="filter-menu-panel floating-filter-menu"
          style={{ top: position.top, left: position.left }}
        >
          <div className="filter-menu-title">
            <strong>{column}</strong>
            <span>{checkedCount.toLocaleString()} selected</span>
          </div>
          <input
            className="filter-search"
            type="text"
            value={search}
            placeholder="Search values"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <div className="filter-actions">
            <button className="secondary compact" type="button" onClick={() => {
              onSearchChange('');
              onFilterChange(null);
            }}>
              Select all
            </button>
            <button className="secondary compact" type="button" onClick={() => {
              onSearchChange('');
              onFilterChange(new Set());
            }}>
              Clear all
            </button>
            <button className="secondary compact" type="button" onClick={applyAndClose}>
              Done
            </button>
          </div>
          <div className="filter-values">
            {displayedValues.length === 0 ? (
              <div className="filter-empty">No values match your search.</div>
            ) : displayedValues.map((value) => (
              <label className="filter-value" key={value || '(blank)'}>
                <input
                  type="checkbox"
                  checked={selectedValues ? selectedValues.has(value) : true}
                  onChange={(event) => toggleValue(value, event.target.checked)}
                />
                <span>{value || '(blank)'}</span>
              </label>
            ))}
          </div>
          {visibleValues.length > displayedValues.length ? (
            <p className="muted">Showing the first {displayedValues.length.toLocaleString()} matching values.</p>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function nextSortState(current: SortState, column: string): SortState {
  if (current?.column !== column) return { column, direction: 'asc' };
  if (current.direction === 'asc') return { column, direction: 'desc' };
  return null;
}

function buildTableColumnItems(
  columns: string[],
  hiddenColumns: Set<string>,
  hiddenColumnGroups: Record<string, string>,
): TableColumnItem[] {
  const items: TableColumnItem[] = [];
  const renderedGroups = new Set<string>();

  columns.forEach((column, index) => {
    if (hiddenColumns.has(column)) {
      const groupId = hiddenColumnGroups[column] ?? `hidden-group-${index}`;
      if (!renderedGroups.has(groupId)) {
        const groupedColumns = columns.filter((candidate) =>
          hiddenColumns.has(candidate) && (hiddenColumnGroups[candidate] ?? `hidden-group-${columns.indexOf(candidate)}`) === groupId,
        );
        items.push({
          type: 'hidden',
          id: groupId,
          columns: groupedColumns,
        });
        renderedGroups.add(groupId);
      }
      return;
    }

    items.push({ type: 'visible', column });
  });

  return items;
}

function compareValues(left: CellValue | undefined, right: CellValue | undefined): number {
  const leftText = formatCell(left);
  const rightText = formatCell(right);
  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);

  if (leftText.trim() !== '' && rightText.trim() !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' });
}

function startColumnResize(
  event: ReactMouseEvent,
  column: string,
  startWidth: number,
  setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>,
): void {
  event.preventDefault();
  const startX = event.clientX;

  function handleMouseMove(moveEvent: globalThis.MouseEvent) {
    const nextWidth = Math.max(minColumnWidth, startWidth + moveEvent.clientX - startX);
    setColumnWidths((current) => ({ ...current, [column]: nextWidth }));
  }

  function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}
