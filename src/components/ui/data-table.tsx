"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableColumn<T> = {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
};

export type DataTableBulkActionContext<T> = {
  ids: string[];
  rows: T[];
  clear: () => void;
};

export type DataTableBulkAction<T> = {
  label: string | ((count: number) => string);
  onClick: (ctx: DataTableBulkActionContext<T>) => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string | ((count: number) => string);
};

export type DataTableProps<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  pageSize?: number;
  empty?: React.ReactNode;
  selection?: boolean;
  bulkActions?: DataTableBulkAction<T>[];
  rowActions?: (row: T) => React.ReactNode;
  rowActionsHeader?: React.ReactNode;
  rowSelectionAriaLabel?: (row: T) => string;
};

const DEFAULT_PAGE_SIZE = 10;

// Compact page list with ellipses: 1, …, 4, 5, 6, …, 10. Always includes
// first + last + a window around the current page.
function pageNumbers(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "ellipsis"> = [1];
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);
  if (windowStart > 2) out.push("ellipsis");
  for (let p = windowStart; p <= windowEnd; p++) out.push(p);
  if (windowEnd < total - 1) out.push("ellipsis");
  out.push(total);
  return out;
}

function labelText(
  label: string | ((count: number) => string),
  count: number,
): string {
  return typeof label === "function" ? label(count) : label;
}

// Generic paginated table with optional row selection + bulk actions. Owns
// page and selection state internally; callers that need to reset (e.g. when a
// filter tab changes) should re-key the component. The selection toolbar
// surfaces inline above the table whenever ≥1 row is selected.
export function DataTable<T>({
  rows,
  rowKey,
  columns,
  pageSize = DEFAULT_PAGE_SIZE,
  empty = (
    <p className="text-sm text-muted-foreground">No results.</p>
  ),
  selection = false,
  bulkActions,
  rowActions,
  rowActionsHeader = "Actions",
  rowSelectionAriaLabel,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Derive safePage from current state — avoid setPage-in-effect churn. If the
  // user was on page 5 and rows shrank to fit in 3 pages, render page 3, but
  // keep state at 5 so they snap back if the dataset grows again.
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);

  const existingIds = useMemo(
    () => new Set(rows.map(rowKey)),
    [rows, rowKey],
  );
  const selectedIds = useMemo(
    () => Array.from(selected).filter((id) => existingIds.has(id)),
    [selected, existingIds],
  );
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );

  const pageIds = pageRows.map(rowKey);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allPageSelected =
    pageIds.length > 0 && selectedOnPage === pageIds.length;
  const headerState: boolean | "indeterminate" =
    selectedOnPage === 0 ? false : allPageSelected ? true : "indeterminate";

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected || selectedOnPage > 0) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedCount = selectedIds.length;
  const showToolbar =
    selection &&
    selectedCount > 0 &&
    bulkActions !== undefined &&
    bulkActions.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-sm">
            <span className="font-medium">{selectedCount}</span>{" "}
            {selectedCount === 1 ? "row" : "rows"} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            {bulkActions!.map((action, i) => {
              const Icon = action.icon;
              const label = action.pending
                ? labelText(
                    action.pendingLabel ?? action.label,
                    selectedCount,
                  )
                : labelText(action.label, selectedCount);
              return (
                <Button
                  key={i}
                  variant={action.variant ?? "default"}
                  size="sm"
                  disabled={action.disabled || action.pending}
                  onClick={() =>
                    action.onClick({
                      ids: selectedIds,
                      rows: selectedRows,
                      clear: clearSelection,
                    })
                  }
                >
                  {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          {empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {selection ? (
                  <TableHead className="w-[1%]">
                    <Checkbox
                      checked={headerState}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Select rows on this page"
                    />
                  </TableHead>
                ) : null}
                {columns.map((col, i) => (
                  <TableHead key={i} className={col.headerClassName}>
                    {col.header}
                  </TableHead>
                ))}
                {rowActions ? (
                  <TableHead className="w-[1%] text-right">
                    {rowActionsHeader}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const id = rowKey(row);
                const isSelected = selected.has(id);
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    {selection ? (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) =>
                            toggleRow(id, c === true)
                          }
                          aria-label={
                            rowSelectionAriaLabel
                              ? rowSelectionAriaLabel(row)
                              : "Select row"
                          }
                        />
                      </TableCell>
                    ) : null}
                    {columns.map((col, i) => (
                      <TableCell key={i} className={col.className}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {rowActions(row)}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <div>
            Showing {pageStart + 1}–{pageStart + pageRows.length} of{" "}
            {rows.length}
          </div>
          {totalPages > 1 ? (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={safePage === 1}
                    className={
                      safePage === 1
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage > 1) setPage(safePage - 1);
                    }}
                  />
                </PaginationItem>
                {pageNumbers(safePage, totalPages).map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === safePage}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={safePage === totalPages}
                    className={
                      safePage === totalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage < totalPages) setPage(safePage + 1);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
