"use client";

import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
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
  ChevronRight,
  Search,
  Home,
  DoorOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type FacilityTab = "facilities" | "floors" | "editor";

function FacilityManagementPageContent() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FacilityTab>("facilities");
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
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

  // Data fetching - using generic API methods
  const facilitiesQuery = useQuery({
    queryKey: ["admin", "facility-management", "facilities"],
    queryFn: () => api.get<Facility[]>("/facilities"),
  });

  const floorsQuery = useQuery({
    queryKey: ["admin", "facility-management", "floors", selectedFacilityId],
    queryFn: () => selectedFacilityId 
      ? api.get<Floor[]>(`/facilities/${selectedFacilityId}/floors`) 
      : Promise.resolve([]),
    enabled: !!selectedFacilityId,
  });

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data]);
  const floors = useMemo(() => floorsQuery.data ?? [], [floorsQuery.data]);
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

  // Stats
  const stats = useMemo(() => ({
    totalFacilities: facilities.length,
    totalFloors: floors.length,
    selectedFacilityName: selectedFacility?.name,
    selectedFloorName: selectedFloor?.name || (selectedFloor ? `Floor ${selectedFloor.floor_number}` : null),
  }), [facilities.length, floors.length, selectedFacility, selectedFloor]);

  // Facility CRUD handlers - using generic API methods
  const handleCreateFacility = async () => {
    const name = facilityForm.name.trim();
    if (!name) return;
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
      console.error("Failed to create facility:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFacility = async () => {
    if (!editingFacility) return;
    const name = facilityForm.name.trim();
    if (!name) return;
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
      console.error("Failed to update facility:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFacility = async (id: number) => {
    if (!window.confirm("Delete this facility and all its floors?")) return;
    try {
      await api.delete<void>(`/facilities/${id}`);
      await facilitiesQuery.refetch();
      if (selectedFacilityId === id) {
        setSelectedFacilityId(null);
        setSelectedFloorId(null);
      }
    } catch (e) {
      console.error("Failed to delete facility:", e);
    }
  };

  // Floor CRUD handlers - using generic API methods
  const handleCreateFloor = async () => {
    if (!selectedFacilityId) return;
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
      console.error("Failed to create floor:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFloor = async () => {
    if (!selectedFacilityId || !editingFloor) return;
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
      console.error("Failed to update floor:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFloor = async (id: number) => {
    if (!selectedFacilityId || !window.confirm("Delete this floor?")) return;
    try {
      await api.delete<void>(`/facilities/${selectedFacilityId}/floors/${id}`);
      await floorsQuery.refetch();
      if (selectedFloorId === id) {
        setSelectedFloorId(null);
      }
    } catch (e) {
      console.error("Failed to delete floor:", e);
    }
  };

  // Open dialogs
  const openCreateFacility = () => {
    setEditingFacility(null);
    setFacilityForm({ name: "", address: "", description: "" });
    setShowFacilityDialog(true);
  };

  const openEditFacility = (facility: Facility) => {
    setEditingFacility(facility);
    setFacilityForm({
      name: facility.name,
      address: facility.address || "",
      description: facility.description || "",
    });
    setShowFacilityDialog(true);
  };

  const openCreateFloor = () => {
    setEditingFloor(null);
    const nextNumber = floors.length > 0 ? Math.max(...floors.map((f: Floor) => f.floor_number)) + 1 : 1;
    setFloorForm({ floorNumber: nextNumber, name: "" });
    setShowFloorDialog(true);
  };

  const openEditFloor = (floor: Floor) => {
    setEditingFloor(floor);
    setFloorForm({ floorNumber: floor.floor_number, name: floor.name || "" });
    setShowFloorDialog(true);
  };

  const isLoading = facilitiesQuery.isLoading || floorsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Facility Management
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage buildings, floors, and floor plans in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedFacility && (
            <Badge variant="outline" className="text-sm">
              <MapPin className="mr-1 h-3 w-3" />
              {selectedFacility.name}
              {selectedFloor && (
                <>
                  <ChevronRight className="mx-1 h-3 w-3" />
                  {selectedFloor.name || `Floor ${selectedFloor.floor_number}`}
                </>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Facilities</p>
                <p className="text-3xl font-bold">{stats.totalFacilities}</p>
              </div>
              <div className="rounded-full bg-blue-50 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Building2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Floors</p>
                <p className="text-3xl font-bold">{stats.totalFloors}</p>
              </div>
              <div className="rounded-full bg-green-50 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Layers className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Selected</p>
                <p className="text-lg font-medium truncate max-w-[140px]">
                  {stats.selectedFacilityName || "None"}
                </p>
              </div>
              <div className="rounded-full bg-purple-50 p-3 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Home className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FacilityTab)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="floors" disabled={!selectedFacilityId}>
            Floors
          </TabsTrigger>
          <TabsTrigger value="editor" disabled={!selectedFloorId}>
            Floor Plan
          </TabsTrigger>
        </TabsList>

        {/* Facilities Tab */}
        <TabsContent value="facilities" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Facilities</CardTitle>
                <CardDescription>Select or manage your facilities</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search facilities..."
                    value={facilitySearch}
                    onChange={(e) => setFacilitySearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Button onClick={openCreateFacility}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Facility
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : filteredFacilities.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">No facilities found.</p>
                  <Button onClick={openCreateFacility} className="mt-4">
                    <Plus className="mr-1 h-4 w-4" />
                    Create your first facility
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredFacilities.map((facility) => (
                    <Card
                      key={facility.id}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedFacilityId === facility.id ? "border-primary ring-1 ring-primary" : ""
                      }`}
                      onClick={() => {
                        setSelectedFacilityId(facility.id);
                        setActiveTab("floors");
                      }}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{facility.name}</p>
                              {facility.address && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {facility.address}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
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
                              className="h-8 w-8 text-destructive"
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
                          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                            {facility.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floors Tab */}
        <TabsContent value="floors" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Floors
                  {selectedFacility && (
                    <span className="text-sm font-normal text-muted-foreground">
                      - {selectedFacility.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>Manage floors for the selected facility</CardDescription>
              </div>
              <Button onClick={openCreateFloor} disabled={!selectedFacilityId}>
                <Plus className="mr-1 h-4 w-4" />
                Add Floor
              </Button>
            </CardHeader>
            <CardContent>
              {!selectedFacilityId ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Select a facility first to manage floors.</p>
                  <Button onClick={() => setActiveTab("facilities")} className="mt-4">
                    Go to Facilities
                  </Button>
                </div>
              ) : floorsQuery.isLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : floors.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">No floors found for this facility.</p>
                  <Button onClick={openCreateFloor} className="mt-4">
                    <Plus className="mr-1 h-4 w-4" />
                    Add your first floor
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {floors.map((floor) => (
                    <Card
                      key={floor.id}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedFloorId === floor.id ? "border-primary ring-1 ring-primary" : ""
                      }`}
                      onClick={() => {
                        setSelectedFloorId(floor.id);
                        setActiveTab("editor");
                      }}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30">
                              <DoorOpen className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {floor.name || `Floor ${floor.floor_number}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Floor #{floor.floor_number}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
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
                              className="h-8 w-8 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFloor(floor.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floor plan — single implementation (shared FloorplansPanel) */}
        <TabsContent value="editor" className="space-y-6">
          {!selectedFacilityId ? (
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
            <FloorplansPanel embedded externalScope={floorplanExternalScope} />
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Facility Dialog */}
      <Dialog open={showFacilityDialog} onOpenChange={setShowFacilityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFacility ? "Edit Facility" : "Create Facility"}</DialogTitle>
            <DialogDescription>
              {editingFacility ? "Update facility details" : "Add a new facility to your workspace"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={facilityForm.name}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Facility name"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={facilityForm.address}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Street address"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={facilityForm.description}
                onChange={(e) => setFacilityForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFacilityDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingFacility ? handleUpdateFacility : handleCreateFacility}
              disabled={submitting || !facilityForm.name.trim()}
            >
              {submitting ? "Saving..." : editingFacility ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floor Dialog */}
      <Dialog open={showFloorDialog} onOpenChange={setShowFloorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFloor ? "Edit Floor" : "Create Floor"}</DialogTitle>
            <DialogDescription>
              {editingFloor ? "Update floor details" : "Add a new floor to the facility"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Floor Number *</Label>
              <Input
                type="number"
                min={0}
                value={floorForm.floorNumber}
                onChange={(e) =>
                  setFloorForm((prev) => ({ ...prev, floorNumber: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={floorForm.name}
                onChange={(e) => setFloorForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Ground Floor, First Floor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFloorDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingFloor ? handleUpdateFloor : handleCreateFloor}
              disabled={submitting}
            >
              {submitting ? "Saving..." : editingFloor ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FacilityManagementPage() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      }
    >
      <FacilityManagementPageContent />
    </Suspense>
  );
}
