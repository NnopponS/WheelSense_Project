"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { formatRelativeTime, formatDateTime } from "@/lib/datetime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TicketStatus = "open" | "in-progress" | "resolved";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: number;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  senderName: string;
  recipientName: string | null;
  isRead: boolean;
}

interface SupportTicketListProps {
  tickets: SupportTicket[];
  onTicketClick?: (ticket: SupportTicket) => void;
}

export function SupportTicketList({ tickets, onTicketClick }: SupportTicketListProps) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const columns = useMemo<ColumnDef<SupportTicket>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.subject}</span>
            {!row.original.isRead && (
              <Badge variant="default" className="h-2 w-2 rounded-full p-0" />
            )}
          </div>
        ),
      },
      {
        accessorKey: "senderName",
        header: "From",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.senderName}</span>
        ),
      },
      {
        accessorKey: "priority",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Priority
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const priority = row.original.priority;
          const variants: Record<TicketPriority, { variant: "default" | "destructive" | "warning" | "outline"; label: string }> = {
            low: { variant: "outline", label: "Low" },
            medium: { variant: "default", label: "Medium" },
            high: { variant: "warning", label: "High" },
            urgent: { variant: "destructive", label: "Urgent" },
          };
          const config = variants[priority];

          return (
            <Badge variant={config.variant}>
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Status
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const status = row.original.status;
          const config = {
            open: { icon: AlertCircle, variant: "warning" as const, label: "Open" },
            "in-progress": { icon: Clock, variant: "default" as const, label: "In Progress" },
            resolved: { icon: CheckCircle, variant: "success" as const, label: "Resolved" },
          }[status];
          const Icon = config.icon;

          return (
            <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {formatRelativeTime(row.original.createdAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(row.original.createdAt)}
            </span>
          </div>
        ),
      },
    ],
    []
  );

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (priorityFilter !== "all" && ticket.priority !== priorityFilter) return false;
      if (globalFilter) {
        const search = globalFilter.toLowerCase();
        return (
          ticket.subject.toLowerCase().includes(search) ||
          ticket.body.toLowerCase().includes(search) ||
          ticket.senderName.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, globalFilter]);

  const table = useReactTable({
    data: filteredTickets,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("admin.support.searchPlaceholder")}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder={t("admin.support.filterStatusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.support.filterStatusAll")}</SelectItem>
            <SelectItem value="open">{t("admin.support.statusOpen")}</SelectItem>
            <SelectItem value="in-progress">{t("admin.support.statusInProgress")}</SelectItem>
            <SelectItem value="resolved">{t("admin.support.statusResolved")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <AlertCircle className="mr-2 h-4 w-4" />
            <SelectValue placeholder={t("admin.support.filterPriorityPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.support.filterPriorityAll")}</SelectItem>
            <SelectItem value="low">{t("admin.support.priorityLow")}</SelectItem>
            <SelectItem value="medium">{t("admin.support.priorityMedium")}</SelectItem>
            <SelectItem value="high">{t("admin.support.priorityHigh")}</SelectItem>
            <SelectItem value="urgent">{t("admin.support.priorityUrgent")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {tickets.length} tickets
        </div>
      </div>

      <div className="rounded-md border">
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer"
                  onClick={() => onTicketClick?.(row.original)}
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
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {tickets.length === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <MessageSquare className="h-8 w-8 opacity-50" />
                      <p>{t("admin.support.noTickets")}</p>
                      <p className="text-sm">{t("admin.support.noTicketsDesc")}</p>
                    </div>
                  ) : (
                    "No tickets match your filters."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
      </div>
    </div>
  );
}
