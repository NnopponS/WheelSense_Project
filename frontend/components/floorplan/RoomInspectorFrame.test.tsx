import { fireEvent,render,screen } from "@testing-library/react";
import { RoomInspectorFrame } from "./RoomInspectorFrame";
jest.mock("@/lib/i18n",()=>({useTranslation:()=>({t:(key:string)=>key})}));
it("exposes keyboard resizing and collapse/expand controls on desktop",()=>{
 const original=window.innerWidth;Object.defineProperty(window,"innerWidth",{configurable:true,value:1440});
 const resize=jest.fn(),collapse=jest.fn();const {rerender}=render(<RoomInspectorFrame title="Room 401" selected collapsed={false} onCollapsedChange={collapse} width={320} onWidthChange={resize} onClose={jest.fn()}><p>Inspector fields</p></RoomInspectorFrame>);
 fireEvent.keyDown(screen.getByRole("separator"),{key:"ArrowLeft"});expect(resize).toHaveBeenCalledWith(336);
 fireEvent.keyDown(screen.getByRole("separator"),{key:"Home"});expect(resize).toHaveBeenCalledWith(280);
 fireEvent.click(screen.getByRole("button",{name:"facilityWorkspace.collapseInspector"}));expect(collapse).toHaveBeenCalledWith(true);
 rerender(<RoomInspectorFrame title="Room 401" selected collapsed onCollapsedChange={collapse} width={320} onWidthChange={resize} onClose={jest.fn()}><p>Inspector fields</p></RoomInspectorFrame>);
 expect(screen.queryByText("Inspector fields")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"facilityWorkspace.expandInspector"}));expect(collapse).toHaveBeenCalledWith(false);
 Object.defineProperty(window,"innerWidth",{configurable:true,value:original});
});
