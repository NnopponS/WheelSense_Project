"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { MapPin, Users } from "lucide-react";
import FloorplansPanel from "@/components/admin/FloorplansPanel";

interface Room {
  id: number;
  name: string;
  room_number: string;
  floor: number;
  capacity: number;
  facility_id: number;
}

type TabKey = "rooms" | "floorplans";

export default function MonitoringPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab: TabKey = useMemo(() => {
    const v = searchParams.get("tab");
    return v === "floorplans" ? "floorplans" : "rooms";
  }, [searchParams]);

  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "rooms") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data: rooms, isLoading } = useQuery<Room[]>("/rooms");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("nav.roomsMap")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("monitoring.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-outline-variant/20 pb-3">
        <button
          type="button"
          onClick={() => setTab("rooms")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
            tab === "rooms"
              ? "bg-primary-fixed text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          {t("monitoring.tabRooms")}
        </button>
        <button
          type="button"
          onClick={() => setTab("floorplans")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
            tab === "floorplans"
              ? "bg-primary-fixed text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          {t("monitoring.tabFloorplans")}
        </button>
      </div>

      {tab === "rooms" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !rooms || rooms.length === 0 ? (
            <EmptyState icon={MapPin} message={t("monitoring.noRooms")} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="surface-card p-4 text-center hover:shadow-elevated transition-smooth"
                >
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary-fixed flex items-center justify-center mb-3">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-semibold text-on-surface text-sm">{room.name}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Room {room.room_number} · Floor {room.floor}
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-2 text-xs text-outline">
                    <Users className="w-3 h-3" />
                    {room.capacity} capacity
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "floorplans" && <FloorplansPanel embedded />}
    </div>
  );
}
