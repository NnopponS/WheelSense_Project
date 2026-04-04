"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { SwitchCamera } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function RoleSwitcher() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
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
    { id: "admin", label: "Admin View", path: "/admin" },
    { id: "head_nurse", label: "Head Nurse View", path: "/head-nurse" },
    { id: "supervisor", label: "Supervisor View", path: "/supervisor" },
    { id: "observer", label: "Observer View", path: "/observer" },
    { id: "patient", label: "Patient View", path: "/patient" },
  ];

  const currentRole = roles.find(r => pathname.startsWith(r.path)) || roles[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-sm font-medium text-on-surface transition-smooth"
        title="Admin View Switcher"
      >
        <SwitchCamera className="w-4 h-4 text-primary" />
        <span className="hidden sm:inline">{currentRole.label}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-lg shadow-black/5 overflow-hidden z-50 animate-fade-in origin-top-right">
          <div className="px-3 py-2 border-b border-outline-variant/10">
            <p className="text-xs font-semibold text-outline tracking-wider uppercase">View Mode</p>
          </div>
          <div className="py-1">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => {
                  setIsOpen(false);
                  router.push(role.path);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-smooth ${
                  currentRole.id === role.id 
                    ? "bg-primary-container text-on-primary-container font-medium" 
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
