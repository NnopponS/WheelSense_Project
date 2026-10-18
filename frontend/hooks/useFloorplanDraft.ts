"use client";
import { useCallback, useEffect, useReducer, type SetStateAction } from "react";
import type { FloorplanRoomShape } from "@/lib/floorplanLayout";
import { equalFloorplanDraft, floorplanEditorReducer, type FloorplanDraft } from "@/lib/floorplanEditor";

export function useFloorplanDraft(scope: string, incoming: FloorplanDraft, locked = false) {
  const [state,dispatch]=useReducer(floorplanEditorReducer,{scope,value:incoming,saved:incoming,past:[],future:[]});
  useEffect(()=>{dispatch({type:"receive",scope,value:incoming,locked})},[scope,incoming,locked]);
  const change=useCallback((update:(value:FloorplanDraft)=>FloorplanDraft)=>dispatch({type:"change",update}),[]);
  const setRooms=useCallback((update:SetStateAction<FloorplanRoomShape[]>)=>change(value=>({...value,rooms:typeof update==="function" ? update(value.rooms) : update})),[change]);
  return {state,dispatch,change,setRooms,dirty:!equalFloorplanDraft(state.value,state.saved)};
}
