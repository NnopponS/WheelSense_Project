import { redirect } from "next/navigation";

export default function MlCalibrationRedirectPage() {
  redirect("/admin/settings?tab=ml");
}
