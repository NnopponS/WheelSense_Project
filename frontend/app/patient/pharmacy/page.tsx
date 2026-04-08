"use client";
"use no memo";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { PackageCheck } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { ListPharmacyOrdersResponse } from "@/lib/api/task-scope-types";

type PharmacyOrderRow = {
  id: number;
  orderNumber: string;
  pharmacyName: string;
  quantity: number;
  refillsRemaining: number;
  status: string;
  requestedAt: string;
  fulfilledAt: string | null;
};

export default function PatientPharmacyPage() {
  const { user } = useAuth();

  const ordersQuery = useQuery({
    queryKey: ["patient", "pharmacy", "orders", user?.patient_id],
    queryFn: () =>
      api.listPharmacyOrders({ patient_id: user?.patient_id ?? undefined }),
  });

  const rows = useMemo<PharmacyOrderRow[]>(() => {
    const source = (ordersQuery.data ?? []) as ListPharmacyOrdersResponse;
    return source
      .map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        pharmacyName: order.pharmacy_name,
        quantity: order.quantity,
        refillsRemaining: order.refills_remaining,
        status: order.status,
        requestedAt: order.requested_at,
        fulfilledAt: order.fulfilled_at ?? null,
      }))
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }, [ordersQuery.data]);

  const columns = useMemo<ColumnDef<PharmacyOrderRow>[]>(
    () => [
      {
        accessorKey: "orderNumber",
        header: "Order",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{row.original.pharmacyName}</p>
          </div>
        ),
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
      },
      {
        accessorKey: "refillsRemaining",
        header: "Refills",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "requestedAt",
        header: "Requested",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.requestedAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.requestedAt)}</p>
          </div>
        ),
      },
      {
        accessorKey: "fulfilledAt",
        header: "Fulfilled",
        cell: ({ row }) => formatDateTime(row.original.fulfilledAt),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">My Pharmacy Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track current medication fulfillment and refill status.
        </p>
      </div>

      <DataTableCard
        title="Pharmacy Orders"
        description="Orders linked to your patient profile."
        data={rows}
        columns={columns}
        isLoading={ordersQuery.isLoading}
        emptyText="No pharmacy orders are linked to your account yet."
        rightSlot={<PackageCheck className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
