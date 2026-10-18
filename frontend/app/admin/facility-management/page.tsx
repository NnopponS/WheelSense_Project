"use client";

import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { AppPage } from "@/components/layout/AppPage";
import { DataState } from "@/components/layout/DataState";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Facility, Floor } from "@/lib/types";
import FloorplansPanel from "@/components/admin/FloorplansPanel";
import {
  Building2,
  MapPin,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Search,
  DoorOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import styles from "@/components/admin/facility-workspace.module.css";

type FacilityTab = "facilities" | "floors" | "editor";

function FacilityManagementPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [layoutDirty,setLayoutDirty]=useState(false);
  const [layoutBusy,setLayoutBusy]=useState(false);
  const navigateWorkspace=(action:()=>void)=>{if(layoutBusy)return;if(layoutDirty && !window.confirm(t("facilityWorkspace.discardConfirm")))return;setLayoutDirty(false);action()};
  const [activeTab, setActiveTab] = useState<FacilityTab>("editor");
  const [facilitySelection, setSelectedFacilityId] = useState<number | null>(null);
  const [floorSelection, setSelectedFloorId] = useState<number | null>(null);
  const [facilitySearch, setFacilitySearch] = useState("");

  // Dialog states
  const [showFacilityDialog, setShowFacilityDialog] = useState(false);
  const [showFloorDialog, setShowFloorDialog] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);

  // Form states
  const [facilityForm, setFacilityForm] = useState({ name: "", address: "", description: "" });
  const [floorForm, setFloorForm] = useState({ floorNumber: 1, name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Data fetching - using generic API methods
  const facilitiesQuery = useQuery({
    queryKey: ["admin", "facility-management", "facilities"],
    queryFn: () => api.get<Facility[]>("/facilities"),
  });

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data]);
  const selectedFacilityId = facilities.some((facility) => facility.id === facilitySelection)
    ? facilitySelection : facilities[0]?.id ?? null;

  const floorsQuery = useQuery({
    queryKey: ["admin", "facility-management", "floors", selectedFacilityId],
    queryFn: () => selectedFacilityId 
      ? api.get<Floor[]>(`/facilities/${selectedFacilityId}/floors`) 
      : Promise.resolve([]),
    enabled: !!selectedFacilityId,
  });

  const floors = useMemo(() => floorsQuery.data ?? [], [floorsQuery.data]);
  const selectedFloorId = floors.some((floor) => floor.id === floorSelection)
    ? floorSelection : floors[0]?.id ?? null;
  const selectedFacility = facilities.find((f: Facility) => f.id === selectedFacilityId);
  const selectedFloor = floors.find((f: Floor) => f.id === selectedFloorId);

  const floorplanExternalScope = useMemo(() => {
    if (!selectedFacilityId || !selectedFloorId) return null;
    return { facilityId: selectedFacilityId, floorId: selectedFloorId };
  }, [selectedFacilityId, selectedFloorId]);

  // Filtered facilities
  const filteredFacilities = useMemo(() => {
    if (!facilitySearch.trim()) return facilities;
    const q = facilitySearch.toLowerCase();
    return facilities.filter(
      (f: Facility) =>
        f.name.toLowerCase().includes(q) ||
        f.address?.toLowerCase().includes(q)
    );
  }, [facilities, facilitySearch]);

  // Facility CRUD handlers - using generic API methods
  const handleCreateFacility = async () => {
    const name = facilityForm.name.trim();
    if (!name) return;
    setMutationError(null);
    setSubmitting(true);
    try {
      const created = await api.post<Facility>("/facilities", {
        name,
        address: facilityForm.address.trim(),
        description: facilityForm.description.trim(),
        config: {},
      });
      await facilitiesQuery.refetch();
      setSelectedFacilityId(created.id);
      setShowFacilityDialog(false);
      setFacilityForm({ name: "", address: "", description: "" });
      setActiveTab("floors");
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to create facility:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFacility = async () => {
    if (!editingFacility) return;
    const name = facilityForm.name.trim();
    if (!name) return;
    setMutationError(null);
    setSubmitting(true);
    try {
      await api.patch<Facility>(`/facilities/${editingFacility.id}`, {
        name,
        address: facilityForm.address.trim(),
        description: facilityForm.description.trim(),
      });
      await facilitiesQuery.refetch();
      setShowFacilityDialog(false);
      setEditingFacility(null);
      setFacilityForm({ name: "", address: "", description: "" });
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to update facility:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFacility = async (id: number) => {
    if (!window.confirm(t("facilityMgmt.deleteFacilityConfirm"))) return;
    try {
      await api.delete<void>(`/facilities/${id}`);
      await facilitiesQuery.refetch();
      if (selectedFacilityId === id) {
        setSelectedFacilityId(null);
        setSelectedFloorId(null);
      }
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to delete facility:", e);
    }
  };

  // Floor CRUD handlers - using generic API methods
  const handleCreateFloor = async () => {
    if (!selectedFacilityId) return;
    setMutationError(null);
    setSubmitting(true);
    try {
      const created = await api.post<Floor>(`/facilities/${selectedFacilityId}/floors`, {
        facility_id: selectedFacilityId,
        floor_number: floorForm.floorNumber,
        name: floorForm.name.trim(),
        map_data: {},
      });
      await floorsQuery.refetch();
      setSelectedFloorId(created.id);
      setShowFloorDialog(false);
      setFloorForm({ floorNumber: floorForm.floorNumber + 1, name: "" });
      setActiveTab("editor");
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to create floor:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFloor = async () => {
    if (!selectedFacilityId || !editingFloor) return;
    setMutationError(null);
    setSubmitting(true);
    try {
      await api.patch<Floor>(`/facilities/${selectedFacilityId}/floors/${editingFloor.id}`, {
        name: floorForm.name.trim(),
        floor_number: floorForm.floorNumber,
      });
      await floorsQuery.refetch();
      setShowFloorDialog(false);
      setEditingFloor(null);
      setFloorForm({ floorNumber: 1, name: "" });
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to update floor:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFloor = async (id: number) => {
    if (!selectedFacilityId || !window.confirm(t("facilityMgmt.deleteFloorConfirm"))) return;
    try {
      await api.delete<void>(`/facilities/${selectedFacilityId}/floors/${id}`);
      await floorsQuery.refetch();
      if (selectedFloorId === id) {
        setSelectedFloorId(null);
      }
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : t("common.error"));
      console.error("Failed to delete floor:", e);
    }
  };

  // Open dialogs
  const openCreateFacility = () => {
    setMutationError(null);
    setEditingFacility(null);
    setFacilityForm({ name: "", address: "", description: "" });
    setShowFacilityDialog(true);
  };

  const openEditFacility = (facility: Facility) => {
    setMutationError(null);
    setEditingFacility(facility);
    setFacilityForm({
      name: facility.name,
      address: facility.address || "",
      description: facility.description || "",
    });
    setShowFacilityDialog(true);
  };

  const openCreateFloor = () => {
    setMutationError(null);
    setEditingFloor(null);
    const nextNumber = floors.length > 0 ? Math.max(...floors.map((f: Floor) => f.floor_number)) + 1 : 1;
    setFloorForm({ floorNumber: nextNumber, name: "" });
    setShowFloorDialog(true);
  };

  const openEditFloor = (floor: Floor) => {
    setMutationError(null);
    setEditingFloor(floor);
    setFloorForm({ floorNumber: floor.floor_number, name: floor.name || "" });
    setShowFloorDialog(true);
  };

  const isLoading = facilitiesQuery.isLoading || floorsQuery.isLoading;

  const scopeControls = (
    <div className={styles.scopeControls}>
      <label className={styles.scopePicker}>
        <span className="sr-only">{t("floorplan.building")}</span>
        <select className="input-field text-sm" value={selectedFacilityId ?? ""}
          disabled={layoutBusy || facilitiesQuery.isLoading || facilities.length === 0}
          onChange={(event) => navigateWorkspace(()=>{ setSelectedFacilityId(Number(event.target.value)); setSelectedFloorId(null); })}>
          {facilities.length === 0 && <option value="">{t("floorplan.selectBuilding")}</option>}
          {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
        </select>
      </label>
      <Button variant="ghost" size="icon" aria-label={t("facilityMgmt.editFacility")} title={t("facilityMgmt.editFacility")}
        disabled={layoutBusy || !selectedFacility} onClick={() => selectedFacility && openEditFacility(selectedFacility)}><Pencil /></Button>
      <Button variant="outline" size="icon" aria-label={t("facilityMgmt.addFacility")} title={t("facilityMgmt.addFacility")} disabled={layoutBusy} onClick={openCreateFacility}><Building2 /></Button>
      <label className={styles.scopePicker}>
        <span className="sr-only">{t("floorplan.floor")}</span>
        <select className="input-field text-sm" value={selectedFloorId ?? ""}
          disabled={layoutBusy || floorsQuery.isLoading || floors.length === 0}
          onChange={(event) => navigateWorkspace(()=>setSelectedFloorId(Number(event.target.value)))}>
          {floors.length === 0 && <option value="">{t("floorplan.selectFloor")}</option>}
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name || `${t("floorplan.floor")} ${floor.floor_number}`}</option>)}
        </select>
      </label>
      <Button variant="ghost" size="icon" aria-label={t("facilityMgmt.editFloor")} title={t("facilityMgmt.editFloor")}
        disabled={layoutBusy || !selectedFloor} onClick={() => selectedFloor && openEditFloor(selectedFloor)}><Pencil /></Button>
      <Button variant="outline" size="icon" aria-label={t("facilityMgmt.addFloor")} title={t("facilityMgmt.addFloor")}
        disabled={layoutBusy || !selectedFacilityId} onClick={openCreateFloor}><Layers /></Button>
    </div>
  );

  return (
    <Tabs activationMode="manual" value={activeTab} onValueChange={(value) => navigateWorkspace(()=>setActiveTab(value as FacilityTab))} className={styles.tabs}>
    <AppPage
      workspace
      className={styles.page}
      title={t("facilityMgmt.title")}
      description={t("facilityMgmt.subtitle")}
      actions={
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="facilities" disabled={layoutBusy}>{t("facilityMgmt.tabFacilities")}</TabsTrigger>
          <TabsTrigger value="floors" disabled={layoutBusy}>{t("facilityMgmt.tabFloors")}</TabsTrigger>
          <TabsTrigger value="editor" disabled={layoutBusy}>{t("facilityMgmt.tabFloorPlan")}</TabsTrigger>
        </TabsList>
      }
      breadcrumbs={[
        {
          label: t("nav.dashboard"),
          href: user?.role ? `/${String(user.role).replace("_", "-")}` : "/admin",
        },
        { label: t("nav.facilities") },
      ]}
    >
      {mutationError && !showFacilityDialog && !showFloorDialog && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
      {(facilitiesQuery.isError || floorsQuery.isError) && (
        <DataState kind="error" title={t("common.error")} actionLabel={t("redesign.retry")}
          onAction={() => { void facilitiesQuery.refetch(); if (selectedFacilityId) void floorsQuery.refetch(); }} />
      )}

      {activeTab !== "editor" && scopeControls}

        {/* Facilities Tab */}
        <TabsContent value="facilities" className={styles.directory}>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{t("facilityMgmt.facilitiesTitle")}</CardTitle>
                <CardDescription>{t("facilityMgmt.facilitiesDescription")}</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    aria-label={t("facilityMgmt.searchFacilities")}
                    placeholder={t("facilityMgmt.searchFacilities")}
                    value={facilitySearch}
                    onChange={(e) => setFacilitySearch(e.target.value)}
                    className="w-full pl-9"
                  />
                </div>
                <Button onClick={openCreateFacility} className="sm:shrink-0">
                  <Plus className="mr-1 h-4 w-4" />
                  {t("facilityMgmt.addFacility")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <div className="h-11 w-11 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : filteredFacilities.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">{t("facilityMgmt.emptyFacilities")}</p>
                  <Button onClick={openCreateFacility} className="mt-4">
                    <Plus className="mr-1 h-4 w-4" />
                    {t("facilityMgmt.createFirstFacility")}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredFacilities.map((facility) => (
                    <div
                      key={facility.id}
                      className={cn(
                        "rounded-lg border border-border/70 bg-background/70 p-4 transition-colors hover:border-primary",
                        selectedFacilityId === facility.id ? "border-primary ring-1 ring-primary" : "",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left"
                          onClick={() => {
                            setSelectedFacilityId(facility.id);
                            setActiveTab("floors");
                          }}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{facility.name}</p>
                              {facility.address && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{facility.address}</span>
                                </p>
                              )}
                            </div>
                        </button>
                        <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
                              aria-label={t("facilityMgmt.editFacility")}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditFacility(facility);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive"
                              aria-label={t("facilityMgmt.deleteFacility")}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFacility(facility.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </div>
                      {facility.description && (
                        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{facility.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floors Tab */}
        <TabsContent value="floors" className={styles.directory}>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  {t("facilityMgmt.floorsTitle")}
                  {selectedFacility && (
                    <span className="text-sm font-normal text-muted-foreground">
                      - {selectedFacility.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>{t("facilityMgmt.floorsDescription")}</CardDescription>
              </div>
              <Button onClick={openCreateFloor} disabled={layoutBusy || !selectedFacilityId}>
                <Plus className="mr-1 h-4 w-4" />
                {t("facilityMgmt.addFloor")}
              </Button>
            </CardHeader>
            <CardContent>
              {!selectedFacilityId ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">{t("facilityMgmt.selectFacilityFirst")}</p>
                  <Button onClick={() => setActiveTab("facilities")} className="mt-4">
                    {t("facilityMgmt.goToFacilities")}
                  </Button>
                </div>
              ) : floorsQuery.isLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <div className="h-11 w-11 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : floors.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">{t("facilityMgmt.emptyFloors")}</p>
                  <Button onClick={openCreateFloor} className="mt-4">
                    <Plus className="mr-1 h-4 w-4" />
                    {t("facilityMgmt.addFirstFloor")}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {floors.map((floor) => (
                    <div
                      key={floor.id}
                      className={cn(
                        "rounded-lg border border-border/70 bg-background/70 p-4 transition-colors hover:border-primary",
                        selectedFloorId === floor.id ? "border-primary ring-1 ring-primary" : "",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left"
                          onClick={() => {
                            setSelectedFloorId(floor.id);
                            setActiveTab("editor");
                          }}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-bg text-success">
                              <DoorOpen className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {floor.name || `${t("floorplan.floor")} ${floor.floor_number}`}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {t("floorplan.floor")} #{floor.floor_number}
                              </p>
                            </div>
                        </button>
                        <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
                              aria-label={t("facilityMgmt.editFloor")}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditFloor(floor);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive"
                              aria-label={t("facilityMgmt.deleteFloor")}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFloor(floor.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floor plan — single implementation (shared FloorplansPanel) */}
        <TabsContent value="editor" className={styles.editorTab}>
          {(!selectedFacilityId || !selectedFloorId) && scopeControls}
          {isLoading ? (
            <DataState kind="loading" title={t("common.loading")} />
          ) : !selectedFacilityId ? (
            <Card>
              <CardContent className="space-y-4 py-12 text-center">
                <p className="text-muted-foreground">{t("floorplan.selectBuildingFirst")}</p>
                <Button type="button" variant="outline" onClick={() => setActiveTab("facilities")}>
                  {t("floorplan.building")}
                </Button>
              </CardContent>
            </Card>
          ) : !selectedFloorId ? (
            <Card>
              <CardContent className="space-y-4 py-12 text-center">
                <p className="text-muted-foreground">{t("floorplan.selectFloor")}</p>
                <Button type="button" variant="outline" onClick={() => setActiveTab("floors")}>
                  {t("floorplan.floor")}
                </Button>
              </CardContent>
            </Card>
          ) : floorplanExternalScope ? (
            <FloorplansPanel embedded workspace scopeControls={scopeControls} externalScope={floorplanExternalScope} onDirtyChange={setLayoutDirty} onBusyChange={setLayoutBusy} onFloorChange={id=>navigateWorkspace(()=>setSelectedFloorId(id))} />
          ) : null}
        </TabsContent>
      {/* Facility Dialog */}
      <Dialog open={showFacilityDialog} onOpenChange={setShowFacilityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFacility ? t("facilityMgmt.editFacility") : t("facilityMgmt.createFacility")}</DialogTitle>
            <DialogDescription>
              {editingFacility ? t("facilityMgmt.updateFacilityDetails") : t("facilityMgmt.createFacilityDetails")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="facility-name">{t("facilityMgmt.nameRequired")}</Label>
              <Input
                id="facility-name"
                value={facilityForm.name}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("facilityMgmt.namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facility-address">{t("facilityMgmt.addressLabel")}</Label>
              <Input
                id="facility-address"
                value={facilityForm.address}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder={t("facilityMgmt.addressPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facility-description">{t("facilityMgmt.descriptionLabel")}</Label>
              <Input
                id="facility-description"
                value={facilityForm.description}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t("facilityMgmt.descriptionPlaceholder")}
              />
            </div>
          </div>
          {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFacilityDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={editingFacility ? handleUpdateFacility : handleCreateFacility}
              disabled={submitting || !facilityForm.name.trim()}
            >
              {submitting ? t("common.saving") : editingFacility ? t("common.update") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floor Dialog */}
      <Dialog open={showFloorDialog} onOpenChange={setShowFloorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFloor ? t("facilityMgmt.editFloor") : t("facilityMgmt.createFloor")}</DialogTitle>
            <DialogDescription>
              {editingFloor ? t("facilityMgmt.updateFloorDetails") : t("facilityMgmt.createFloorDetails")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="floor-number">{t("facilityMgmt.floorNumberRequired")}</Label>
              <Input
                id="floor-number"
                type="number"
                min={0}
                value={floorForm.floorNumber}
                onChange={(e) =>
                  setFloorForm((prev) => ({ ...prev, floorNumber: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor-display-name">{t("facilityMgmt.floorDisplayName")}</Label>
              <Input
                id="floor-display-name"
                value={floorForm.name}
                onChange={(e) => setFloorForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("facilityMgmt.floorDisplayNamePlaceholder")}
              />
            </div>
          </div>
          {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFloorDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={editingFloor ? handleUpdateFloor : handleCreateFloor}
              disabled={submitting || !Number.isInteger(floorForm.floorNumber) || floorForm.floorNumber < 0}
            >
              {submitting ? t("common.saving") : editingFloor ? t("common.update") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
    </Tabs>
  );
}

export default function FacilityManagementPage() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <DataState kind="loading" title={t("common.loading")} />
      }
    >
      <FacilityManagementPageContent />
    </Suspense>
  );
}
