import { applyReferenceCoordinates, equalFloorplanDraft, floorplanEditorReducer, readFloorplanBackground, REFERENCE_BACKGROUND, validateFloorplanRooms, type FloorplanDraft, type FloorplanEditorState } from "./floorplanEditor";
import { provisionRoomsForUnmappedFloorplanNodes } from "./floorplanSaveProvision";
const room={id:"room-1",label:"Room 401",x:100,y:100,w:300,h:200,device_id:1,node_device_id:"node-1",power_kw:null,room_type:"resident"};
const value:FloorplanDraft={rooms:[room],background:null};
const initial=():FloorplanEditorState=>({scope:"1:4",value,saved:value,past:[],future:[]});

it("keeps a dirty draft and undo history across polling while accepting new floor snapshots",()=>{
 const changed=floorplanEditorReducer(initial(),{type:"change",update:v=>({...v,rooms:[{...room,x:200}]})});
 expect(floorplanEditorReducer(changed,{type:"receive",scope:"1:4",value})).toBe(changed);
 const next=floorplanEditorReducer(changed,{type:"receive",scope:"1:5",value:{rooms:[],background:null}});
 expect(next.value.rooms).toEqual([]);expect(next.past).toEqual([]);
});
it("undoes/redoes geometry and image registration atomically and clears history on save/discard",()=>{
 const changed=floorplanEditorReducer(initial(),{type:"change",update:v=>({...v,background:REFERENCE_BACKGROUND,rooms:[{...room,x:200}]})});
 const undo=floorplanEditorReducer(changed,{type:"undo"});expect(equalFloorplanDraft(undo.value,value)).toBe(true);
 const redo=floorplanEditorReducer(undo,{type:"redo"});expect(redo.value).toEqual(changed.value);
 const saved=floorplanEditorReducer(redo,{type:"saved",value:redo.value});expect(saved.past).toEqual([]);expect(saved.saved).toEqual(saved.value);
 expect(floorplanEditorReducer(changed,{type:"discard"}).value).toEqual(value);
});
it("keeps redo after polling an unchanged clean baseline and limits undo memory",()=>{
 let state=initial();for(let i=1;i<=70;i++)state=floorplanEditorReducer(state,{type:"change",update:v=>({...v,rooms:[{...room,x:100+i}]})});
 expect(state.past).toHaveLength(50);
 const undo=floorplanEditorReducer(floorplanEditorReducer(initial(),{type:"change",update:v=>({...v,rooms:[{...room,x:200}]})}),{type:"undo"});
 expect(floorplanEditorReducer(undo,{type:"receive",scope:"1:4",value}).future).toHaveLength(1);
});
it("rejects unsafe background URLs and out-of-bounds registration",()=>{
 expect(readFloorplanBackground(REFERENCE_BACKGROUND)).toEqual(REFERENCE_BACKGROUND);
 for(const url of ['https://example.com/image.svg','//example.com/a','javascript:alert(1)','/\\evil/a'])expect(readFloorplanBackground({...REFERENCE_BACKGROUND,url})).toBeNull();
 for(const patch of [{width:0},{height:Infinity},{opacity:2},{x:1,width:5000},{y:-1}])expect(readFloorplanBackground({...REFERENCE_BACKGROUND,...patch})).toBeNull();
});
it("validates boundary and identity invariants before backend writes",()=>{
 expect(validateFloorplanRooms([room])).toBe(true);
 for(const patch of [{x:NaN},{w:0},{x:4900},{label:" "}])expect(validateFloorplanRooms([{...room,...patch}])).toBe(false);
 expect(validateFloorplanRooms([room,{...room,id:"room-2"}])).toBe(false);
 expect(validateFloorplanRooms([room,{...room,id:"room-2",device_id:null,node_device_id:null,label:"402"}])).toBe(true);
});
it("imports only matched schematic coordinates while preserving real identities, types and node links",()=>{
 const other={...room,id:"room-2",label:"Unmatched",device_id:null,node_device_id:null};
 const result=applyReferenceCoordinates([room,other],{coordinateSystem:{width:1600,height:1000},rooms:[{label:"Room 401",x:149,y:101,width:319,height:149}]});
 expect(result[0]).toEqual({...room,x:149*3.125,y:101*3.125,w:319*3.125,h:149*3.125});expect(result[1]).toBe(other);
 expect(applyReferenceCoordinates([room],{coordinateSystem:{width:0,height:1000},rooms:[]})).toEqual([room]);
});
it("can create a real unlinked room for the manager without changing legacy provisioning defaults",async()=>{
 const shape={...room,id:"new-room",node_device_id:null,device_id:null};const post=jest.fn(async()=>({id:20,name:shape.label}));
 const legacy=await provisionRoomsForUnmappedFloorplanNodes(post,[shape],[],4);expect(post).not.toHaveBeenCalled();expect(legacy.workingShapes[0].id).toBe("new-room");
 const result=await provisionRoomsForUnmappedFloorplanNodes(post,[shape],[],4,true);
 expect(post).toHaveBeenCalledWith(expect.objectContaining({floor_id:4,room_type:"resident",node_device_id:null}));expect(result.workingShapes[0].id).toBe("room-20");
});

it("keeps partial-save recovery state from being replaced by polling even after undo",()=>{
 expect(floorplanEditorReducer(initial(),{type:"receive",scope:"1:4",value:{rooms:[],background:null},locked:true})).toEqual(initial());
});
