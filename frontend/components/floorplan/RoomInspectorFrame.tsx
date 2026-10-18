"use client";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useTranslation } from "@/lib/i18n";
import styles from "./room-inspector.module.css";

const subscribe=(notify:()=>void)=>{window.addEventListener("resize",notify);return()=>window.removeEventListener("resize",notify)};
export function RoomInspectorFrame({title,selected,collapsed,onCollapsedChange,width,onWidthChange,onClose,children}:{
  title:string;selected:boolean;collapsed:boolean;onCollapsedChange:(value:boolean)=>void;width:number;onWidthChange:(value:number)=>void;onClose:()=>void;children:ReactNode;
}) {
  const {t}=useTranslation();
  const viewport=useSyncExternalStore(subscribe,()=>window.innerWidth,()=>0);
  const drag=useRef<{x:number;width:number}|null>(null);
  const resize=(value:number)=>onWidthChange(Math.round(Math.max(280,Math.min(520,window.innerWidth*.4,value))));
  if(viewport<1280) return <Sheet open={selected && !collapsed} onOpenChange={open=>{if(!open) onClose()}}>
    <SheetContent data-floorplan-inspector side={viewport<768 ? "bottom" : "right"} className={styles.sheet}>
      <SheetHeader className="pr-10"><SheetTitle>{title}</SheetTitle><SheetDescription>{t("facilityWorkspace.inspectorDescription")}</SheetDescription></SheetHeader>
      <div className={styles.content}>{children}</div>
    </SheetContent>
  </Sheet>;
  return <aside data-floorplan-inspector className={styles.frame} aria-label={t("floorplan.roomProps")} data-collapsed={collapsed}>
    {!collapsed ? <div role="separator" tabIndex={0} aria-label={t("facilityWorkspace.resizeInspector")} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={520} aria-valuenow={width}
      className={styles.resize} onDoubleClick={()=>resize(320)}
      onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,width}}}
      onPointerMove={event=>{if(drag.current) resize(drag.current.width+drag.current.x-event.clientX)}}
      onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}
      onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();event.stopPropagation();resize(event.key==="Home" ? 280 : event.key==="End" ? 520 : width+(event.key==="ArrowLeft" ? 16 : -16))}} /> : null}
    <div className={styles.header}>
      {!collapsed ? <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{title}</h2> : null}
      <Button type="button" size="icon" variant="ghost" onClick={()=>onCollapsedChange(!collapsed)} aria-label={t(collapsed ? "facilityWorkspace.expandInspector" : "facilityWorkspace.collapseInspector")} title={t(collapsed ? "facilityWorkspace.expandInspector" : "facilityWorkspace.collapseInspector")}>
        {collapsed ? <ChevronLeft /> : <ChevronRight />}
      </Button>
      {selected && !collapsed ? <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t("common.close")}><X /></Button> : null}
    </div>
    {!collapsed ? <div className={styles.content}>{children}</div> : null}
  </aside>;
}
