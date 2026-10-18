import type { FloorplanRoomShape } from "./floorplanLayout";
import { matchFloorRoomFromLayoutLabel } from "./floorplanRoomResolve";

export interface FloorplanBackground {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  reference: boolean;
}
export interface FloorplanDraft { rooms: FloorplanRoomShape[]; background: FloorplanBackground | null }
export interface FloorplanEditorState { scope: string; value: FloorplanDraft; saved: FloorplanDraft; past: FloorplanDraft[]; future: FloorplanDraft[] }
export type FloorplanEditorAction =
  | { type: "receive"; scope: string; value: FloorplanDraft; locked?: boolean }
  | { type: "change"; update: (value: FloorplanDraft) => FloorplanDraft }
  | { type: "saved"; value: FloorplanDraft }
  | { type: "undo" } | { type: "redo" } | { type: "discard" };

export const REFERENCE_BACKGROUND: FloorplanBackground = {
  url: "/floorplans/wheelsense_floorplan_level4.svg", x: 0, y: 0, width: 5000, height: 3125, opacity: 0.8, reference: true,
};
export function equalFloorplanDraft(a: FloorplanDraft, b: FloorplanDraft) { return JSON.stringify(a) === JSON.stringify(b); }
export function floorplanEditorReducer(state: FloorplanEditorState, action: FloorplanEditorAction): FloorplanEditorState {
  if (action.type === "receive") {
    if (action.scope === state.scope && action.locked) return state;
    if (action.scope === state.scope && !equalFloorplanDraft(state.value, state.saved)) return state;
    if (action.scope === state.scope && equalFloorplanDraft(state.value, action.value)) return state;
    return {scope:action.scope,value:action.value,saved:action.value,past:[],future:[]};
  }
  if (action.type === "saved") return {...state,value:action.value,saved:action.value,past:[],future:[]};
  if (action.type === "discard") return {...state,value:state.saved,past:[],future:[]};
  if (action.type === "undo") {
    const previous = state.past.at(-1); if (!previous) return state;
    return {...state,value:previous,past:state.past.slice(0,-1),future:[state.value,...state.future]};
  }
  if (action.type === "redo") {
    const next = state.future[0]; if (!next) return state;
    return {...state,value:next,past:[...state.past,state.value],future:state.future.slice(1)};
  }
  const next = action.update(state.value);
  if (equalFloorplanDraft(next,state.value)) return state;
  return {...state,value:next,past:[...state.past.slice(-49),state.value],future:[]};
}

export function readFloorplanBackground(value: unknown): FloorplanBackground | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Record<string,unknown>;
  // Background URLs are app-local assets; no external document or script navigation.
  if (typeof b.url !== "string" || !b.url.startsWith("/") || b.url.startsWith("//") || b.url.includes("\\")) return null;
  if (![b.x,b.y,b.width,b.height,b.opacity].every(v=>typeof v === "number" && Number.isFinite(v))) return null;
  if (Number(b.x)<0 || Number(b.y)<0 || Number(b.width)<=0 || Number(b.height)<=0 || Number(b.x)+Number(b.width)>5000 || Number(b.y)+Number(b.height)>5000 || Number(b.opacity)<0 || Number(b.opacity)>1) return null;
  return {url:b.url,x:Number(b.x),y:Number(b.y),width:Number(b.width),height:Number(b.height),opacity:Number(b.opacity),reference:b.reference===true};
}

export function validateFloorplanRooms(rooms: FloorplanRoomShape[]): boolean {
  const ids = new Set<string>(), nodes = new Set<string>(), devices = new Set<number>();
  return rooms.every(room=>{
    if (!room.id || ids.has(room.id) || !room.label.trim() || room.label.length>128) return false;
    ids.add(room.id);
    if (![room.x,room.y,room.w,room.h].every(Number.isFinite) || room.x<0 || room.y<0 || room.w<=0 || room.h<=0 || room.x+room.w>5000 || room.y+room.h>5000) return false;
    const node=room.node_device_id?.trim();
    if(node && nodes.has(node)) return false; if(node) nodes.add(node);
    if(room.device_id!=null && devices.has(room.device_id)) return false; if(room.device_id!=null) devices.add(room.device_id);
    return true;
  });
}

export function applyReferenceCoordinates(rooms: FloorplanRoomShape[], reference: {coordinateSystem:{width:number;height:number};rooms:Array<{label:string;x:number;y:number;width:number;height:number}>}): FloorplanRoomShape[] {
  if (!Number.isFinite(reference.coordinateSystem.width) || !Number.isFinite(reference.coordinateSystem.height) || reference.coordinateSystem.width<=0 || reference.coordinateSystem.height<=0) return rooms;
  const scale=5000/reference.coordinateSystem.width;
  return rooms.map(room=>{
    const match=matchFloorRoomFromLayoutLabel(room.label,reference.rooms.map((r,index)=>({id:index,name:r.label})));
    const rect=match ? reference.rooms[match.id] : null;
    if(!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.x<0 || rect.y<0 || rect.width<=0 || rect.height<=0 || rect.x+rect.width>reference.coordinateSystem.width || rect.y+rect.height>reference.coordinateSystem.height || (rect.y+rect.height)*scale>5000) return room;
    return {...room,x:rect.x*scale,y:rect.y*scale,w:rect.width*scale,h:rect.height*scale};
  });
}
