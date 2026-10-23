# app/admin/facility-management/page.tsx

- FacilityTab · type · L38-L38 — type FacilityTab = "facilities" | "floors" | "editor";
- MetricTone · type · L40-L40 — type MetricTone = "blue" | "green" | "violet";
- FacilityMetric · function · L48-L73 — function FacilityMetric({ label, value, icon: Icon, tone, detail, }: { label: string; value: string | number; icon: LucideIcon; tone: MetricTone; detail?: string | null; })
- FacilityManagementPageContent · function · L75-L686 — function FacilityManagementPageContent()
- handleCreateFacility · function · L137-L158 — handleCreateFacility = async ()
- handleUpdateFacility · function · L160-L180 — handleUpdateFacility = async ()
- handleDeleteFacility · function · L182-L194 — handleDeleteFacility = async (id: number)
- handleCreateFloor · function · L197-L217 — handleCreateFloor = async ()
- handleUpdateFloor · function · L219-L236 — handleUpdateFloor = async ()
- handleDeleteFloor · function · L238-L249 — handleDeleteFloor = async (id: number)
- openCreateFacility · function · L252-L256 — openCreateFacility = ()
- openEditFacility · function · L258-L266 — openEditFacility = (facility: Facility)
- openCreateFloor · function · L268-L273 — openCreateFloor = ()
- openEditFloor · function · L275-L279 — openEditFloor = (floor: Floor)
- FacilityManagementPage · function · L688-L703 — function FacilityManagementPage()
