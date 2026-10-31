"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { canonicalizeRole } from "@/lib/roles";

export default function MapRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/map");
      return;
    }
    const role = canonicalizeRole(user.role);
    if (role === "caregiver" || role === "head_caregiver") {
      router.replace("/caregiver/floorplans");
    } else if (role === "patient") {
      router.replace("/patient/room-controls");
    } else {
      router.replace("/admin/facility-management");
    }
  }, [user, loading, router]);

  return null;
}
