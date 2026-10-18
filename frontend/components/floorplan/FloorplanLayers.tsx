"use client";
import { useEffect,useRef,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { FloorplanAsset } from "@/lib/types";
import { REFERENCE_BACKGROUND,type FloorplanBackground } from "@/lib/floorplanEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover,PopoverContent,PopoverTrigger } from "@/components/ui/popover";

export function FloorplanLayers({facilityId,floorId,editing,background,onBackgroundChange,showGrid,onShowGridChange,showStatus,onShowStatusChange,showBackground,onShowBackgroundChange,snapEnabled,onSnapChange,onImportReference,importing=false}:{
 facilityId:number;floorId:number;editing:boolean;background:FloorplanBackground|null;onBackgroundChange:(value:FloorplanBackground|null)=>void;
 showGrid:boolean;onShowGridChange:(value:boolean)=>void;showStatus:boolean;onShowStatusChange:(value:boolean)=>void;showBackground:boolean;onShowBackgroundChange:(value:boolean)=>void;snapEnabled:boolean;onSnapChange:(value:boolean)=>void;onImportReference:()=>void;importing?:boolean;
}){
 const{t}=useTranslation();const [message,setMessage]=useState<string|null>(null);const[uploading,setUploading]=useState(false);const fileInput=useRef<HTMLInputElement>(null);
 const assets=useQuery({queryKey:["floorplan-assets",floorId],queryFn:()=>api.get<FloorplanAsset[]>(`/floorplans?floor_id=${floorId}`),enabled:floorId>0,staleTime:30000});
 const activeScope=useRef(floorId);
 useEffect(()=>{activeScope.current=floorId},[floorId]);
 const imageAssets=(assets.data??[]).filter(asset=>["image/png","image/jpeg","image/webp","image/svg+xml"].includes(asset.mime_type));
 const choose=(url:string)=>{
   if(!url){onBackgroundChange(null);onShowBackgroundChange(false);return}
   if(url===REFERENCE_BACKGROUND.url){onBackgroundChange(REFERENCE_BACKGROUND);onShowBackgroundChange(true);return}
   const asset=imageAssets.find(item=>item.file_url===url);if(!asset)return;
   const ratio=asset.width && asset.height ? asset.height/asset.width : .625;
   const width=Math.min(5000,5000/ratio);
   onBackgroundChange({url,x:0,y:0,width,height:width*ratio,opacity:.8,reference:false});onShowBackgroundChange(true);
 };
 async function upload(file:File){
   if(!["image/png","image/jpeg","image/webp","image/svg+xml"].includes(file.type) || file.size>20*1024*1024){setMessage(t("facilityWorkspace.invalidImage"));return}
   const uploadFloor=floorId;
   setUploading(true);setMessage(null);
   try{
     const form=new FormData();form.append("name",file.name);form.append("file",file);form.append("facility_id",String(facilityId));form.append("floor_id",String(floorId));
     const source=URL.createObjectURL(file),image=new Image();
     try{image.src=source;await image.decode();form.append("width",String(image.naturalWidth));form.append("height",String(image.naturalHeight))}finally{URL.revokeObjectURL(source)}
     const asset=await api.postForm<FloorplanAsset>("/floorplans/upload",form);
     if(activeScope.current!==uploadFloor)return;
     await assets.refetch();if(activeScope.current!==uploadFloor)return;
     const ratio=image.naturalHeight/image.naturalWidth,width=Math.min(5000,5000/ratio);
     onBackgroundChange({url:asset.file_url,x:0,y:0,width,height:width*ratio,opacity:.8,reference:false});onShowBackgroundChange(true);
   }catch{setMessage(t("facilityWorkspace.uploadFailed"))}finally{setUploading(false);if(fileInput.current)fileInput.current.value=""}
 }
 return <Popover><PopoverTrigger asChild><Button type="button" variant="outline"><Layers className="size-4"/>{t("facilityWorkspace.layers")}</Button></PopoverTrigger>
 <PopoverContent align="end" className="max-h-[min(80dvh,40rem)] w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto">
   <h3 className="text-sm font-semibold">{t("facilityWorkspace.layers")}</h3>
   <div className="space-y-2">{[
     ["floor-grid",t("facilityWorkspace.grid"),showGrid,onShowGridChange,false],
     ["floor-status",t("facilityWorkspace.statusLayer"),showStatus,onShowStatusChange,false],
     ["floor-background",t("facilityWorkspace.background"),showBackground,onShowBackgroundChange,!background],
     ["floor-snap",t("facilityWorkspace.snap"),snapEnabled,onSnapChange,!editing],
   ].map(([id,label,checked,change,disabled])=><label key={String(id)} htmlFor={String(id)} className="flex min-h-10 items-center gap-2 text-sm"><Checkbox id={String(id)} checked={Boolean(checked)} disabled={Boolean(disabled)} onCheckedChange={value=>(change as (value:boolean)=>void)(value===true)}/><span>{String(label)}</span></label>)}</div>
   <label className="block text-xs font-medium text-muted-foreground">{t("facilityWorkspace.background")}<select className="input-field mt-1 w-full text-sm" value={background?.url??""} disabled={!editing || uploading} onChange={event=>choose(event.target.value)}>
     <option value="">{t("facilityWorkspace.noBackground")}</option><option value={REFERENCE_BACKGROUND.url}>{t("facilityWorkspace.referenceAsset")}</option>
     {imageAssets.map(asset=><option key={asset.id} value={asset.file_url}>{asset.name}</option>)}
     {background && background.url!==REFERENCE_BACKGROUND.url && !imageAssets.some(asset=>asset.file_url===background.url) ? <option value={background.url}>{t("facilityWorkspace.savedBackground")}</option> : null}
   </select></label>
   {assets.isError ? <p className="text-xs text-muted-foreground">{t("redesign.unavailable")}</p> : null}
   {background ? <fieldset disabled={!editing} className="space-y-3"><legend className="mb-2 text-xs font-semibold">{t("facilityWorkspace.registration")}</legend>
     <div className="grid grid-cols-2 gap-2">{(["x","y","width","height"] as const).map(key=><label key={key} className="text-xs text-muted-foreground">{t(`facilityWorkspace.registration.${key}`)}<Input className="mt-1" type="number" min={key==="width"||key==="height" ? 1 : 0} max={5000} value={Number(background[key].toFixed(2))} onChange={event=>{if(event.target.value!=="")onBackgroundChange({...background,[key]:Number(event.target.value)})}}/></label>)}</div>
     <label className="block text-xs text-muted-foreground">{t("facilityWorkspace.opacity")} {Math.round(background.opacity*100)}%<input className="mt-2 w-full accent-primary" type="range" min="0" max="1" step=".05" value={background.opacity} onChange={event=>onBackgroundChange({...background,opacity:Number(event.target.value)})}/></label>
   </fieldset> : null}
   <p className="text-xs text-muted-foreground">{t("facilityWorkspace.registrationHint")}</p>
   {background?.reference ? <p className="text-xs text-warning">{t("facilityWorkspace.referenceNotice")}</p> : null}
   <Button type="button" variant="outline" className="w-full" disabled={!editing || importing} onClick={onImportReference}>{t(importing ? "common.loading" : "facilityWorkspace.importReference")}</Button>
   <label className="block text-xs text-muted-foreground">{t("facilityWorkspace.uploadImage")}<input ref={fileInput} className="mt-2 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!editing || uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file)}}/></label>
   {uploading ? <p role="status" className="text-xs">{t("common.saving")}</p> : null}{message ? <p role="alert" className="text-xs text-destructive">{message}</p> : null}
 </PopoverContent></Popover>;
}
