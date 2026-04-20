"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { canAccessAppRole } from "@/lib/permissions";
import { getRoleHome } from "@/lib/routes";
import RoleSidebar from "./RoleSidebar";
import TopBar from "./TopBar";
import AIChatPopup from "./ai/AIChatPopup";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface RoleShellProps {
  children: React.ReactNode;
  /** App root path for role guard (e.g., "/admin", "/head-nurse") */
  appRoot: "/admin" | "/head-nurse" | "/supervisor" | "/observer" | "/patient";
  /** Optional additional classes for main content area */
  mainClassName?: string;
}

/**
 * Unified Role Shell Component
 * Provides:
 * - Auth guard (redirects to /login if not authenticated)
 * - Role guard (redirects to role home if user cannot access appRoot)
 * - RoleSidebar + TopBar + AIChatPopup layout
 */
export default function RoleShell({ children, appRoot, mainClassName }: RoleShellProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const roleCheckDone = useRef(false);

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Role guard - redirect to role home if user doesn't have access to this app root
  // Only run once to prevent redirect loops
  useEffect(() => {
    if (!loading && user && !roleCheckDone.current) {
      roleCheckDone.current = true;
      if (!canAccessAppRole(user.role, appRoot)) {
        // Exception: allow staff to edit their own profile
        if (appRoot === "/admin" && pathname.startsWith("/admin/caregivers/") && user.caregiver_id) {
          const pathParts = pathname.split("/");
          const requestedId = pathParts[pathParts.length - 1];
          if (requestedId === String(user.caregiver_id)) {
            return;
          }
        }
        
        // Add small delay to prevent rapid redirects
        const timeout = setTimeout(() => {
          router.replace(getRoleHome(user.role));
        }, 100);
        return () => clearTimeout(timeout);
      }
    }
  }, [user, loading, router, pathname, appRoot]);

  // Show loading spinner while auth is loading or during hydration
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{t("shell.loadingWorkspace")}</p>
        </div>
      </div>
    );
  }

  // Return null if no user (will redirect)
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop fixed, Mobile Sheet */}
      <RoleSidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col lg:ml-[var(--sidebar-width)]">
        {/* Top Navigation Bar */}
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />

        {/* Main Content */}
        <main className={cn("min-w-0 flex-1 overflow-y-auto p-6 sm:p-8", mainClassName)}>{children}</main>
      </div>

      {/* AI Chat Popup */}
      <AIChatPopup />
    </div>
  );
}
