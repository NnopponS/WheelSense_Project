"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, SwitchCamera } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";

export default function RoleSwitcher() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user || user.role !== "admin") return null;

  const roles = [
    { id: "admin", label: t("shell.roleAdmin"), path: "/admin" },
    { id: "head_nurse", label: t("shell.roleHeadNurse"), path: "/head-nurse" },
    { id: "supervisor", label: t("shell.roleSupervisor"), path: "/supervisor" },
    { id: "observer", label: t("shell.roleObserver"), path: "/observer" },
    { id: "patient", label: t("shell.rolePatient"), path: "/patient" },
  ];

  const currentRole = roles.find((r) => pathname.startsWith(r.path)) || roles[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-w-0 items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-left text-sm font-medium text-on-surface transition-smooth hover:bg-surface-container-high"
        title={t("shell.viewMode")}
      >
        <SwitchCamera className="w-4 h-4 text-primary" />
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="text-[10px] uppercase tracking-wider text-outline">{t("shell.viewMode")}</span>
          <span className="truncate text-sm font-medium text-on-surface">{currentRole.label}</span>
        </span>
        <span className="sm:hidden">{currentRole.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-lg shadow-black/5 animate-fade-in">
          <div className="border-b border-outline-variant/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-outline">
              {t("shell.viewMode")}
            </p>
          </div>
          <div className="py-1">
            {roles.map((role) => (
              <button
                type="button"
                key={role.id}
                onClick={() => {
                  setIsOpen(false);
                  router.push(role.path);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-smooth ${
                  currentRole.id === role.id
                    ? "bg-primary-container font-medium text-on-primary-container"
                    : "text-on-surface hover:bg-surface-container-low"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
