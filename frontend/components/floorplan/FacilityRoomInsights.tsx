"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListDeviceActivityResponse, FloorplanPresenceOut } from "@/lib/api/task-scope-types";
import type { Room } from "@/lib/types";
import type { FloorplanRoomShape } from "@/lib/floorplanLayout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { StatusBadge } from "@/components/shared/StatusBadge";

export function FacilityRoomInsights({room,shape,presence,presenceState,tab,layoutUpdatedAt,residentCount}:{
  room:Room|null;shape:FloorplanRoomShape;presence?:FloorplanPresenceOut["rooms"][number];presenceState:"pending"|"unavailable"|"ready";tab:"overview"|"alerts"|"history";layoutUpdatedAt:string|null|undefined;residentCount?:number;
}) {
 const {t}=useTranslation();const {user}=useAuth();
 const alerts=useQuery({queryKey:["floorplan-room-insights","alerts",room?.id],queryFn:()=>api.listAlerts({limit:100}),enabled:tab==="alerts" && room!=null,staleTime:15000,refetchInterval:15000});
 const activity=useQuery({queryKey:["floorplan-room-insights","activity",room?.id],queryFn:()=>api.get<ListDeviceActivityResponse>("/devices/activity?limit=100"),enabled:tab==="history" && room!=null && ["admin","head_caregiver"].includes(user?.role??""),staleTime:30000,refetchInterval:30000});
 const matches=(roomId:unknown,nodeId:unknown)=>room!=null && (String(roomId)===String(room.id) || Boolean(room.node_device_id && nodeId===room.node_device_id));
 const roomAlerts=(alerts.data??[]).filter(alert=>matches(alert.data?.room_id,alert.device_id)).sort((a,b)=>Number(b.severity==="critical")-Number(a.severity==="critical") || b.timestamp.localeCompare(a.timestamp));
 const events=(activity.data??[]).filter(event=>matches(event.details?.room_id,event.registry_device_id));
 const live=presenceState==="ready" && presence;
 const occupants=Array.isArray(presence?.occupants) ? presence.occupants : null;
 const unavailable=t(presenceState==="pending" ? "common.loading" : "redesign.unavailable");
 if(tab==="alerts") return <div className="space-y-3">
   <p className="text-sm text-muted-foreground">{t("facilityWorkspace.liveAlerts")}: <strong className="text-foreground">{live ? presence.alert_count : unavailable}</strong></p>
   {alerts.isError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p> : alerts.isPending && room ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : roomAlerts.length ? <ul className="divide-y divide-border">{roomAlerts.map(alert=><li key={alert.id} className="py-3">
     <div className="mb-1 flex flex-wrap gap-1"><StatusBadge tone={alert.severity==="critical" ? "critical" : alert.severity==="warning" ? "warning" : "info"} label={alert.severity}/><StatusBadge tone="neutral" label={alert.status}/></div>
     <Link className="text-sm font-semibold text-primary" href={`/admin/alerts?alert=${alert.id}`}>{alert.title || alert.alert_type}</Link><p className="mt-1 text-sm">{alert.description}</p><time dateTime={alert.timestamp} className="mt-1 block text-xs text-muted-foreground">{formatDateTime(alert.timestamp)}</time>
   </li>)}</ul> : <p className="text-sm text-muted-foreground">{t("facilityWorkspace.noAlertEvidence")}</p>}
   <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary" href="/admin/alerts">{t("nav.alerts")}</Link>
 </div>;
 if(tab==="history") return <div className="space-y-4">
   <dl className="space-y-3 text-sm">{[[t("facilityWorkspace.roomCreated"),room?.created_at],[t("facilityWorkspace.layoutSaved"),layoutUpdatedAt],[t("patient.roomControls.lastUpdated"),live ? presence.computed_at : null]].map(([label,date])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{date ? formatDateTime(date) : t("redesign.unavailable")}</dd></div>)}</dl>
   <h3 className="text-sm font-semibold">{t("admin.system.recentActivity")}</h3>
   {activity.isError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p> : activity.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : events.length ? <ul className="divide-y divide-border">{events.map(event=><li key={event.id} className="py-2"><p className="text-xs text-muted-foreground">{event.event_type}</p><p className="text-sm">{event.summary}</p><time dateTime={event.occurred_at} title={formatDateTime(event.occurred_at)} className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)} · {formatRelativeTime(event.occurred_at)}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("facilityWorkspace.noRoomHistory")}</p>}
   <Link href="/admin/audit" className="inline-flex min-h-11 items-center text-sm text-primary">{t("admin.system.viewAuditLog")}</Link>
 </div>;
 const maintenance=room?.config?.maintenance;
 return <div className="space-y-4">
   <div className="flex flex-wrap gap-1.5"><StatusBadge tone={live && presence.alert_count>0 ? "critical" : "neutral"} label={live ? `${presence.alert_count} ${t("overview.roomAlerts")}` : unavailable}/><StatusBadge tone={live && presence.node_status==="offline" ? "critical" : live && presence.node_status==="stale" ? "warning" : "neutral"} label={live ? t(`overview.node.${presence.node_status}`) : unavailable}/></div>
   <dl className="grid grid-cols-2 gap-3 text-sm">
     <div><dt className="text-xs text-muted-foreground">{t("facilityWorkspace.roomType")}</dt><dd>{room?.room_type || t("redesign.unavailable")}</dd></div>
     <div><dt className="text-xs text-muted-foreground">{t("facilityWorkspace.availability")}</dt><dd>{typeof room?.config?.availability==="string" ? room.config.availability : t("facilityWorkspace.notReported")}</dd></div>
     <div><dt className="text-xs text-muted-foreground">{t("facilityWorkspace.peoplePresent")}</dt><dd>{live && occupants ? occupants.length : unavailable}</dd></div>
     <div><dt className="text-xs text-muted-foreground">{t("facilityWorkspace.assignedResidents")}</dt><dd>{residentCount??t("redesign.unavailable")}</dd></div>
   </dl>
   {room?.description ? <p className="text-sm">{room.description}</p> : null}
   <div><h3 className="mb-2 text-sm font-semibold">{t("facilityWorkspace.reportedPresence")}</h3>
     {live && occupants ? occupants.length ? <ul className="divide-y divide-border">{occupants.map(person=><li key={`${person.actor_type}-${person.actor_id}`} className="py-2"><span className="block text-sm font-medium">{person.display_name}</span><span className="text-xs text-muted-foreground">{person.role || person.actor_type} · {person.source}{person.updated_at ? ` · ${formatRelativeTime(person.updated_at)}` : ""}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("overview.noOccupants")}</p> : <p role="status" className="text-sm text-muted-foreground">{unavailable}</p>}
   </div>
   <div><h3 className="mb-1 text-sm font-semibold">{t("facilityWorkspace.maintenance")}</h3><p className="text-sm text-muted-foreground">{typeof maintenance==="string" ? maintenance : maintenance && typeof maintenance==="object" && "status" in maintenance && typeof maintenance.status==="string" ? maintenance.status : t("facilityWorkspace.notReported")}</p></div>
   <p className="text-xs text-muted-foreground">{t("patient.roomControls.lastUpdated")}: {live ? formatDateTime(presence.computed_at) : unavailable}</p>
   <p className="text-xs text-muted-foreground">{shape.label} · {t("facilityWorkspace.geometrySource")}</p>
 </div>;
}
