import { fireEvent, render, screen, within } from "@testing-library/react";
import FloorplanRoleViewer from "./FloorplanRoleViewer";
import { REFERENCE_BACKGROUND, type FloorplanBackground } from "@/lib/floorplanEditor";

let mockGeometry = true;
let mockPresenceError = false;
let mockScopeError = false;
let mockBackground: unknown = null;
let mockPresenceRooms: Array<Record<string, unknown>> | null = null;
const mockQueries: Array<Record<string, unknown>> = [];
jest.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => ({"overview.residentOne":"1 resident", "overview.residentCount":"{count} residents", "overview.residentUnknown":"Residents unknown", "overview.residentLastKnown":"Last known: {count}"}[key] ?? key) }) }));
jest.mock("./FloorplanCanvas", () => ({ __esModule: true, default: ({ rooms, readOnly, onSelect, background, roomMetaById }: { rooms: Array<{id:string;label:string;x:number}>; readOnly: boolean; onSelect: (id:string)=>void; background?: FloorplanBackground | null; roomMetaById?: Record<string,{tone?:string}> }) =>
  <div data-testid="saved-map" data-readonly={String(readOnly)} data-background={JSON.stringify(background??null)}>{rooms.map(room => <button key={room.id} data-x={room.x} data-tone={roomMetaById?.[room.id]?.tone} data-meta={JSON.stringify(roomMetaById?.[room.id])} onClick={()=>onSelect(room.id)}>{room.label}</button>)}</div> }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: {queryKey: string[]}) => {
  mockQueries.push(options);
  const key = options.queryKey[2];
  const data = key === "facilities" ? [{id:1,name:"Building A"}]
    : key === "floors" ? [{id:2,name:"Floor 2",map_data:{wheelsense_background:mockBackground}},{id:3,name:"Floor 3",map_data:{}}]
    : key === "floor-rooms" ? [{id:10,name:"Room 10"},{id:11,name:"Room 11"}]
    : key === "layout" ? { layout_json: {version:3,rooms:mockGeometry ? [
      {id:"room-10",label:"Room 10",x:200,y:200,w:500,h:400},
      {id:"room-11",label:"Room 11",x:900,y:200,w:500,h:400}]:[]} }
    : key === "presence" ? {computed_at:"2026-10-18T05:00:00Z",rooms:mockPresenceRooms ?? [
      {room_id:10,room_name:"Room 10",node_status:"offline",staleness_seconds:900,alert_count:2,occupants:[{actor_type:"patient",actor_id:20,patient_id:20,display_name:"Real resident",source:"node"}]},
      {room_id:11,room_name:"Room 11",node_status:"stale",staleness_seconds:600,alert_count:0,prediction_hint:{device_id:"signal",confidence:0.5}},
    ]} : [];
  return {data, isLoading:false, error:(key==="presence"&&mockPresenceError)||(key==="facilities"&&mockScopeError) ? new Error("Unavailable") : null,refetch:jest.fn()};
} }));

beforeEach(()=>{mockGeometry=true;mockPresenceError=false;mockScopeError=false;mockBackground=null;mockPresenceRooms=null;mockQueries.length=0});

it("counts unique residents without staff and distinguishes empty from missing presence",()=>{
 mockPresenceRooms=[{room_id:10,room_name:"Room 10",node_status:"online",occupants:[
  {actor_type:"patient",actor_id:20,patient_id:20,display_name:"Resident A",source:"node"},
  {actor_type:"patient",actor_id:21,patient_id:21,display_name:"Resident B",source:"node"},
  {actor_type:"patient",actor_id:22,patient_id:20,display_name:"Resident A",source:"hint"},
  {actor_type:"staff",actor_id:30,display_name:"Staff",source:"node"}
 ]},{room_id:11,room_name:"Room 11",node_status:"online",occupants:[]}];
 const {unmount}=render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByRole("button",{name:"Room 10"})).toHaveAttribute("data-meta",expect.stringContaining("2 residents"));
 expect(screen.getByRole("button",{name:"Room 11"})).toHaveAttribute("data-meta",expect.stringContaining("0 residents"));
 unmount();mockPresenceRooms=[];
 render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByRole("button",{name:"Room 10"})).toHaveAttribute("data-meta",expect.stringContaining("Residents unknown"));
});

it("labels stale resident counts as last known and retains legacy resident hints",()=>{
 mockPresenceRooms=[{room_id:10,room_name:"Room 10",node_status:"stale",staleness_seconds:600,
 patient_hint:{patient_id:20,first_name:"Resident",last_name:"A",source:"node"},
 patient_hints:[{patient_id:20,first_name:"Resident",last_name:"A",source:"node"}]}];
 render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByRole("button",{name:"Room 10"})).toHaveAttribute("data-meta",expect.stringContaining("Last known: 1 resident"));
});

it("uses matching critical evidence and keeps stale rooms visually distinct",()=>{
 render(<FloorplanRoleViewer compact overview overviewAlerts={[{id:1,workspace_id:1,patient_id:null,device_id:null,timestamp:"2026-10-18T05:00:00Z",alert_type:"monitoring",severity:"critical",title:"Recorded alert",description:"Room evidence",data:{room_id:10},status:"active",acknowledged_by:null,acknowledged_at:null,resolved_at:null}]}/>);
 expect(screen.getByRole("button",{name:"Room 10"})).toHaveAttribute("data-tone","critical");
 expect(screen.getByRole("button",{name:"Room 11"})).toHaveAttribute("data-tone","warning");
});

it("shows the selected floor's saved background in Overview and clears it when switching to a floor without one",()=>{
 mockBackground=REFERENCE_BACKGROUND;render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByTestId("saved-map")).toHaveAttribute("data-background",JSON.stringify(REFERENCE_BACKGROUND));
 fireEvent.change(screen.getByLabelText("floorplan.floor"),{target:{value:"3"}});
 expect(screen.getByTestId("saved-map")).toHaveAttribute("data-background","null");
});

it("rejects invalid saved background metadata instead of rendering external image URLs",()=>{
 mockBackground={...REFERENCE_BACKGROUND,url:"https://external.invalid/floor.svg"};render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByTestId("saved-map")).toHaveAttribute("data-background","null");
});

it("uses saved geometry read-only, counts recorded occupants and keeps stale/offline distinct",()=>{
 const {container}=render(<FloorplanRoleViewer compact overview />);
 const metric=(label:string)=>within(screen.getByText(label).closest("div")!).getByText(/^[0-9]+$/).textContent;
 expect(metric("overview.occupied")).toBe("1");
 expect(metric("overview.offline")).toBe("1");
 expect(metric("overview.stale")).toBe("1");
 expect(metric("overview.roomAlerts")).toBe("2");
 expect(screen.getByTestId("saved-map")).toHaveAttribute("data-readonly","true");
 expect(within(screen.getByTestId("saved-map")).getByText("Room 10")).toHaveAttribute("data-x","200");
 fireEvent.change(screen.getByRole("combobox",{name:"overview.inspectRoom"}),{target:{value:"room-10"}});
 expect(screen.getByRole("link",{name:"Real resident"})).toHaveAttribute("href","/admin/patients/20");
 expect(screen.getByText(/overview.node.offline/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("floorplan.floor"),{target:{value:"3"}});
 expect(screen.queryByRole("link",{name:"Real resident"})).not.toBeInTheDocument();
 expect(mockQueries.some(q=>JSON.stringify(q.queryKey).includes("floor_id=3"))).toBe(true);
 expect(mockQueries.some(q=>q.refetchInterval===5000 && q.refetchIntervalInBackground===true)).toBe(true);
 expect(container.querySelector("[data-testid=saved-map]")).toBeTruthy();
});

it("shows a room directory instead of generating map geometry when no layout is saved",()=>{
 mockGeometry=false;render(<FloorplanRoleViewer compact overview />);
 expect(screen.queryByTestId("saved-map")).not.toBeInTheDocument();
 expect(screen.getByText("redesign.noGeometry")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:/Room 10/})).toBeInTheDocument();
});

it("does not show stale cached presence as healthy when its request fails",()=>{
 mockPresenceError=true;render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByText("overview.presenceUnavailable")).toBeInTheDocument();
 expect(screen.getAllByText("—").length).toBe(5);
 fireEvent.change(screen.getByRole("combobox",{name:"overview.inspectRoom"}),{target:{value:"room-10"}});
 expect(screen.queryByRole("link",{name:"Real resident"})).not.toBeInTheDocument();
});

it("distinguishes a failed facility source from an empty facility directory",()=>{
 mockScopeError=true;render(<FloorplanRoleViewer compact overview />);
 expect(screen.getByText("redesign.unavailable")).toBeInTheDocument();
 expect(screen.queryByTestId("saved-map")).not.toBeInTheDocument();
});

it("keeps the existing full viewer presentation outside the Overview opt-in",()=>{
 render(<FloorplanRoleViewer />);
 expect(screen.getByRole("heading",{name:"Live operations map"})).toBeInTheDocument();
 expect(screen.queryByRole("heading",{name:"overview.ward"})).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"List"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Floorplan"})).toBeInTheDocument();
});
