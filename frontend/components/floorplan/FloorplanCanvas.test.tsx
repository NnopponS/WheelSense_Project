import { act, fireEvent, render, screen } from "@testing-library/react";
import FloorplanCanvas from "./FloorplanCanvas";

jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it("keeps workspace room labels readable after viewport and zoom changes without changing geometry", () => {
  let scale = 0.25;
  let resize: (() => void) | undefined;
  const observer = jest.fn().mockImplementation((callback: () => void) => {
    resize = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  const originalObserver = global.ResizeObserver;
  const originalMatrix = SVGSVGElement.prototype.getScreenCTM;
  global.ResizeObserver = observer;
  SVGSVGElement.prototype.getScreenCTM = jest.fn(() => ({ a: scale, b: 0 }) as DOMMatrix);
  const onRoomsChange = jest.fn();
  const rooms = [{ id: "one", label: "Room 101", x: 100, y: 150, w: 300, h: 200, device_id: null, power_kw: null }];

  try {
    const { container, unmount } = render(<FloorplanCanvas rooms={rooms} onRoomsChange={onRoomsChange}
      selectedId={null} onSelect={jest.fn()} fillViewport />);
    const labelContainer = screen.getByText("Room 101").parentElement?.parentElement;
    expect(labelContainer).toHaveStyle({ transform: "scale(4)", width: "70px", height: "45px" });
    expect(container.querySelector("rect[x='100']")).toHaveAttribute("width", "300");

    scale = 0.5;
    fireEvent.click(screen.getByRole("button", { name: "floorplan.zoomIn" }));
    expect(labelContainer).toHaveStyle({ transform: "scale(2)" });
    expect(resize).toBeDefined();
    expect(onRoomsChange).not.toHaveBeenCalled();
    unmount();
  } finally {
    global.ResizeObserver = originalObserver;
    SVGSVGElement.prototype.getScreenCTM = originalMatrix;
  }
});

it.each([[600, 200], [200, 600]])("fits saved geometry to a %i × %i viewport without a square camera", (width, height) => {
  jest.useFakeTimers();
  const originalObserver = global.ResizeObserver;
  let resize: (() => void) | undefined;
  global.ResizeObserver = jest.fn().mockImplementation((callback: () => void) => {
    resize = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  const originalMatrix = SVGSVGElement.prototype.getScreenCTM;
  SVGSVGElement.prototype.getScreenCTM = jest.fn(() => ({ a: 0.25, b: 0 }) as DOMMatrix);
  let viewportHeight = height;
  const bounds = jest.spyOn(SVGSVGElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => ({ width, height: viewportHeight } as DOMRect));
  const rooms = [{ id: "one", label: "Room 101", x: 150, y: 150, w: 300, h: 900, device_id: null, power_kw: null }];
  const onRoomsChange = jest.fn();

  try {
    const { container, unmount } = render(<FloorplanCanvas rooms={rooms} onRoomsChange={onRoomsChange}
      selectedId={null} onSelect={jest.fn()} fillViewport fitContentOnMount />);
    act(() => jest.runOnlyPendingTimers());
    const [x, y, cameraWidth, cameraHeight] = container.querySelector("svg[preserveAspectRatio]")!.getAttribute("viewBox")!.split(" ").map(Number);
    expect(cameraWidth / cameraHeight).toBeCloseTo(width / height);
    expect(x).toBeLessThanOrEqual(rooms[0].x);
    expect(y).toBeLessThanOrEqual(rooms[0].y);
    expect(x + cameraWidth).toBeGreaterThanOrEqual(rooms[0].x + rooms[0].w);
    expect(y + cameraHeight).toBeGreaterThanOrEqual(rooms[0].y + rooms[0].h);
    expect(container.querySelector("rect[x='150']")).toHaveAttribute("height", "900");
    viewportHeight = Math.max(60, height / 3);
    act(() => resize?.());
    act(() => jest.runOnlyPendingTimers());
    const [resizedX, resizedY, resizedWidth, resizedHeight] = container.querySelector("svg[preserveAspectRatio]")!.getAttribute("viewBox")!.split(" ").map(Number);
    expect(resizedWidth / resizedHeight).toBeCloseTo(width / viewportHeight);
    expect(resizedX).toBeLessThanOrEqual(rooms[0].x);
    expect(resizedY).toBeLessThanOrEqual(rooms[0].y);
    expect(resizedX + resizedWidth).toBeGreaterThanOrEqual(rooms[0].x + rooms[0].w);
    expect(resizedY + resizedHeight).toBeGreaterThanOrEqual(rooms[0].y + rooms[0].h);
    expect(onRoomsChange).not.toHaveBeenCalled();
    unmount();
  } finally {
    global.ResizeObserver = originalObserver;
    SVGSVGElement.prototype.getScreenCTM = originalMatrix;
    bounds.mockRestore();
    jest.useRealTimers();
  }
});

it("selects rooms in View mode without moving geometry, and supports opt-in keyboard editing",()=>{
 const room={id:"room-10",label:"Room 10",x:100,y:100,w:300,h:300,device_id:null,power_kw:null};
 const change=jest.fn(),select=jest.fn();
 const {rerender}=render(<FloorplanCanvas rooms={[room]} onRoomsChange={change} selectedId={null} onSelect={select} readOnly workspaceTools/>);
 const boundary=screen.getByRole("button",{name:"Room 10"});fireEvent.keyDown(boundary,{key:"Enter"});fireEvent.keyDown(boundary,{key:"ArrowRight"});expect(select).toHaveBeenCalledWith("room-10");expect(change).not.toHaveBeenCalled();
 rerender(<FloorplanCanvas rooms={[room]} onRoomsChange={change} selectedId={room.id} onSelect={select} workspaceTools/>);
 fireEvent.keyDown(boundary,{key:"ArrowRight"});expect(change).toHaveBeenLastCalledWith([{...room,x:150}]);
 fireEvent.keyDown(boundary,{key:"ArrowDown",altKey:true});expect(change).toHaveBeenLastCalledWith([{...room,h:350}]);
});
it("keeps image registration in canvas units and hidden rooms in edit commits",()=>{
 const room={id:"room-10",label:"Room 10",x:100,y:100,w:300,h:300,device_id:null,power_kw:null};
 const hidden={...room,id:"room-11",label:"Room 11",x:1000};const change=jest.fn();
 const {container}=render(<FloorplanCanvas rooms={[room,hidden]} onRoomsChange={change} selectedId={room.id} onSelect={jest.fn()} visibleRoomIds={[room.id]} showGrid={false} snapToGrid={false} background={{url:"/floorplans/test.svg",x:50,y:100,width:1600,height:1000,opacity:.5,reference:false}}/>);
 expect(container.querySelector("image")).toHaveAttribute("x","50");expect(container.querySelector("image")).toHaveAttribute("width","1600");expect(container.querySelector("rect[fill='url(#ws-grid)']")).not.toBeInTheDocument();
 fireEvent.keyDown(screen.getByRole("button",{name:"Room 10"}),{key:"ArrowRight"});expect(change).toHaveBeenLastCalledWith([{...room,x:110},hidden]);
});

it("keeps status evidence accessible when compact room labels omit detail",()=>{
 const room={id:"room-10",label:"Room 10",x:100,y:100,w:300,h:300,device_id:null,power_kw:null};
 render(<FloorplanCanvas rooms={[room]} onRoomsChange={jest.fn()} selectedId={null} onSelect={jest.fn()} readOnly workspaceTools roomMetaById={{[room.id]:{tone:"critical",chips:[{label:"1 active alert"}],detailLines:["Node stale"]}}}/>);
 expect(screen.getByRole("button",{name:"Room 10"})).toHaveAccessibleDescription("1 active alert · Node stale");
});
