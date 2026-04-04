"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import PatientSidebar from "@/components/PatientSidebar";
import TopBar from "@/components/TopBar";
import AIChatPopup from "@/components/ai/AIChatPopup";
import { getRoleHome } from "@/lib/routes";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "patient" && user.role !== "admin") {
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
      <PatientSidebar />
      <div className="flex-1 ml-[var(--sidebar-width)] flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-6 md:p-8 lg:p-12 overflow-y-auto max-w-5xl mx-auto w-full">
          {children}
        </main>
      </div>
      <AIChatPopup />
    </div>
  );
}
