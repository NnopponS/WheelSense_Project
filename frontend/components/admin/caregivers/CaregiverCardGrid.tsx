"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { formatStaffRoleLabel } from "@/lib/staffRoleLabel";
import type { Caregiver, User } from "@/lib/types";
import { ChevronRight } from "lucide-react";

function linkedCount(users: User[] | null | undefined, caregiverId: number): number {
  if (!users?.length) return 0;
  return users.filter((u) => u.caregiver_id === caregiverId).length;
}

type Props = {
  caregivers: Caregiver[];
  users: User[] | null | undefined;
  basePath: string;
};

export default function CaregiverCardGrid({ caregivers, users, basePath }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 max-h-[min(72vh,52rem)] overflow-y-auto overscroll-contain pr-1">
      {caregivers.map((c) => {
        const fullName = `${c.first_name} ${c.last_name}`.trim() || `Staff #${c.id}`;
        const nLinked = linkedCount(users, c.id);
        return (
          <Link
            key={c.id}
            href={`${basePath}/${c.id}`}
            className="surface-card flex items-center gap-4 p-5 transition-smooth hover:shadow-elevated"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full gradient-cta text-sm font-bold text-white">
              {(c.first_name?.[0] || c.last_name?.[0] || "S").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-on-surface">{fullName}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {formatStaffRoleLabel(c.role, t)}
              </p>
              <p className="mt-1 text-[11px] text-outline">
                {nLinked > 0
                  ? `${nLinked} ${nLinked === 1 ? "linked account" : "linked accounts"}`
                  : t("caregivers.noLinkedAccountShort")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  c.is_active ? "care-normal" : "bg-surface-container text-outline"
                }`}
              >
                {c.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
              </span>
              <ChevronRight className="h-4 w-4 text-outline" aria-hidden />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
