import { fireEvent, render, screen, within } from "@testing-library/react";
import FloorplanRoleViewer from "./FloorplanRoleViewer";

let mockGeometry = true;
let mockPresenceError = false;
let mockScopeError = false;
const mockQueries: Array<Record<string, unknown>> = [];
jest.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("./FloorplanCanvas", () => ({ __esModule: true, default: ({ rooms, readOnly, onSelect }: { rooms: Array<{id:string;label:string;x:number}>; readOnly: boolean; onSelect: (id:string)=>void }) =>
  <div data-testid="saved-map" data-readonly={String(readOnly)}>{rooms.map(room => <button key={room.id} data-x={room.x} onClick={()=>onSelect(room.id)}>{room.label}</button>)}</div> }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: {queryKey: string[]}) => {
  mockQueries.push(options);
  const key = options.queryKey[2];
  const data = key === "facilities" ? [{id:1,name:"Building A"}]
    : key === "floors" ? [{id:2,name:"Floor 2"},{id:3,name:"Floor 3"}]
    : key === "floor-rooms" ? [{id:10,name:"Room 10"},{id:11,name:"Room 11"}]
    : key === "layout" ? { layout_json: {version:3,rooms:mockGeometry ? [
      {id:"room-10",label:"Room 10",x:200,y:200,w:500,h:400},
      {id:"room-11",label:"Room 11",x:900,y:200,w:500,h:400}]:[]} }
    : key === "presence" ? {computed_at:"2026-10-18T05:00:00Z",rooms:[
      {room_id:10,room_name:"Room 10",node_status:"offline",staleness_seconds:900,alert_count:2,occupants:[{actor_type:"patient",actor_id:20,patient_id:20,display_name:"Real resident",source:"node"}]},
      {room_id:11,room_name:"Room 11",node_status:"stale",staleness_seconds:600,alert_count:0,prediction_hint:{device_id:"signal",confidence:0.5}},
    ]} : [];
  return {data, isLoading:false, error:(key==="presence"&&mockPresenceError)||(key==="facilities"&&mockScopeError) ? new Error("Unavailable") : null,refetch:jest.fn()};
} }));

beforeEach(()=>{mockGeometry=true;mockPresenceError=false;mockScopeError=false;mockQueries.length=0});

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
