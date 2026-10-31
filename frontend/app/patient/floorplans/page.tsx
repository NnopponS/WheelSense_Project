import { redirect } from "next/navigation";

export default function PatientFloorplansRedirect() {
  redirect("/patient/room-controls");
}
