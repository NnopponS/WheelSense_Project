"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PatientSidebar from "@/components/PatientSidebar";
import TopBar from "@/components/TopBar";
import AIChatPopup from "@/components/ai/AIChatPopup";
import { canAccessAppRole } from "@/lib/permissions";
import { getRoleHome } from "@/lib/routes";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && !canAccessAppRole(user.role, "/patient")) {
      router.replace(getRoleHome(user.role));
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface flex">
      <PatientSidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />
      <div className="flex min-h-screen flex-1 flex-col lg:ml-[var(--sidebar-width)]">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-12 max-w-5xl mx-auto w-full">
          {children}
        </main>
      </div>
      <AIChatPopup />
    </div>
  );
}
