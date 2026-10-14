import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface DataTableServerPagination {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  total: number;
  onPageIndexChange: (index: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  toolbar?: (table: ReturnType<typeof useReactTable<TData>>) => React.ReactNode;
  getRowClassName?: (row: TData) => string | undefined;
  // Row-wide click (e.g. navigate to a detail page). Elements that should
  // not trigger it (checkboxes, row action menus) must carry
  // data-no-row-click, checked here the same way the click is dispatched.
  onRowClick?: (row: TData) => void;
  showSelectionCount?: boolean;
  // The rows in `data` are already one server page. The footer walks that
  // total instead of slicing the array again.
  serverPagination?: DataTableServerPagination;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  getRowClassName,
  onRowClick,
  showSelectionCount = true,
  serverPagination
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualPagination: !!serverPagination,
    pageCount: serverPagination?.pageCount,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      ...(serverPagination
        ? { pagination: { pageIndex: 0, pageSize: Math.max(data.length, serverPagination.pageSize, 1) } }
        : {})
    },
    initialState: { pagination: { pageSize: 10 } }
  });

  const pageSizeOptions = serverPagination?.pageSizeOptions ?? [10, 20, 30, 50];
  const pageIndex = serverPagination?.pageIndex ?? table.getState().pagination.pageIndex;
  const pageCount = serverPagination?.pageCount ?? (table.getPageCount() || 1);
  const pageSize = serverPagination?.pageSize ?? table.getState().pagination.pageSize;
  const canPrevious = serverPagination ? pageIndex > 0 : table.getCanPreviousPage();
  const canNext = serverPagination ? pageIndex + 1 < pageCount : table.getCanNextPage();

  return (
    <div className="flex flex-col gap-4">
      {toolbar?.(table)}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(onRowClick && 'cursor-pointer', getRowClassName?.(row.original))}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest('[data-no-row-click]')) return;
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Nenhum resultado encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground hidden flex-1 text-sm sm:block">
          {serverPagination
            ? `${serverPagination.total} nota(s)`
            : showSelectionCount
              ? `${table.getFilteredSelectedRowModel().rows.length} de ${table.getFilteredRowModel().rows.length} linha(s) selecionada(s).`
              : `${table.getFilteredRowModel().rows.length} registro(s)`}
        </div>
        <div className="flex w-full items-center gap-6 sm:w-fit sm:gap-8">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Linhas por página</p>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => {
                const next = Number(value);
                if (serverPagination) serverPagination.onPageSizeChange(next);
                else table.setPageSize(next);
              }}
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium">
            Página {pageIndex + 1} de {pageCount || 1}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden size-8 p-0 lg:flex"
              onClick={() => (serverPagination ? serverPagination.onPageIndexChange(0) : table.setPageIndex(0))}
              disabled={!canPrevious}
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              variant="outline"
              className="size-8 p-0"
              onClick={() =>
                serverPagination ? serverPagination.onPageIndexChange(pageIndex - 1) : table.previousPage()
              }
              disabled={!canPrevious}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              className="size-8 p-0"
              onClick={() =>
                serverPagination ? serverPagination.onPageIndexChange(pageIndex + 1) : table.nextPage()
              }
              disabled={!canNext}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 p-0 lg:flex"
              onClick={() =>
                serverPagination
                  ? serverPagination.onPageIndexChange(Math.max(pageCount - 1, 0))
                  : table.setPageIndex(table.getPageCount() - 1)
              }
              disabled={!canNext}
            >
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
