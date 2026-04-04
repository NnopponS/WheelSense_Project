"use client";

import { useQuery } from "@/hooks/useQuery";
import { type PharmacyOrder } from "@/lib/types";
import { PackageCheck } from "lucide-react";

export default function PatientPharmacyPage() {
  const { data, isLoading } = useQuery<PharmacyOrder[]>("/future/pharmacy/orders");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">My Pharmacy Orders</h2>
        <p className="text-sm text-on-surface-variant">
          Track current medication fulfillment and refill status.
        </p>
      </div>

      <div className="surface-card p-4">
        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading orders...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No pharmacy orders are linked to your account yet.
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((order) => (
              <div key={order.id} className="rounded-lg border border-outline-variant/20 p-3">
                <p className="font-medium text-on-surface inline-flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-primary" />
                  {order.order_number} • {order.pharmacy_name}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Quantity {order.quantity} • Refills {order.refills_remaining} • {order.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
