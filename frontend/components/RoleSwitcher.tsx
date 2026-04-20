"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search, SwitchCamera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError, type UserSearchResult } from "@/lib/api";
import { getRoleHome } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n";

const ROLES = [
  { id: "admin", labelKey: "shell.roleAdmin", path: "/admin" },
  { id: "head_nurse", labelKey: "shell.roleHeadNurse", path: "/head-nurse" },
  { id: "supervisor", labelKey: "shell.roleSupervisor", path: "/supervisor" },
  { id: "observer", labelKey: "shell.roleObserver", path: "/observer" },
  { id: "patient", labelKey: "shell.rolePatient", path: "/patient" },
] as const;

type RoleId = (typeof ROLES)[number]["id"];
type RoleFilter = "all" | RoleId;

function roleLabelKeyForUserRole(role: string): (typeof ROLES)[number]["labelKey"] | null {
  const found = ROLES.find((r) => r.id === role);
  return found?.labelKey ?? null;
}

export default function RoleSwitcher() {
  const { user, startImpersonation } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingUserId, setActingUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentRole = useMemo(
    () => ROLES.find((role) => pathname.startsWith(role.path)) ?? ROLES[0],
    [pathname],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || user?.role !== "admin") return;
    let cancelled = false;
    const limit = selectedRole === "all" ? 18 : 12;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const params =
        selectedRole === "all"
          ? { q: query.trim(), limit }
          : { q: query.trim(), roles: selectedRole, limit };
      api
        .searchUsers(params)
        .then((items) => {
          if (!cancelled) setResults(items.filter((item) => item.is_active));
        })
        .catch((err) => {
          if (!cancelled) {
            setResults([]);
            setError(err instanceof ApiError ? err.message : "Could not load users.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isOpen, query, selectedRole, user?.role]);

  if (!user || user.role !== "admin") return null;

  async function actAs(target: UserSearchResult) {
    if (!target.id || target.id <= 0) {
      setError("Invalid user selected.");
      return;
    }
    if (target.id === user?.id) {
      setError("Cannot impersonate yourself.");
      return;
    }
    setActingUserId(target.id);
    setError(null);
    try {
      await startImpersonation(target.id);
      setIsOpen(false);
      router.push(getRoleHome(target.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start impersonation.");
    } finally {
      setActingUserId(null);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-w-0 items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-left text-sm font-medium text-foreground transition-smooth hover:bg-surface-container-high"
        title={t("shell.viewMode")}
      >
        <SwitchCamera className="h-5 w-5 text-primary" />
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="text-sm uppercase tracking-wider text-outline">{t("shell.actAsButtonLabel")}</span>
          <span className="truncate text-sm font-medium text-foreground">{t(currentRole.labelKey)}</span>
        </span>
        <span className="sm:hidden">{t(currentRole.labelKey)}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-lg shadow-black/5 animate-fade-in">
          <div className="border-b border-outline-variant/10 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-outline">
              {t("shell.actAsPanelTitle")}
            </p>
            <p className="mt-1 text-sm text-foreground-variant">{t("shell.actAsPanelHint")}</p>
          </div>

          <div className="flex flex-wrap gap-2 p-3">
            <button
              type="button"
              onClick={() => {
                setSelectedRole("all");
                setQuery("");
              }}
              className={`min-w-[5.5rem] flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-smooth sm:min-w-0 sm:flex-none ${
                selectedRole === "all"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-foreground-variant hover:bg-surface-container-high"
              }`}
            >
              {t("shell.actAsAllRoles")}
            </button>
            {ROLES.map((role) => (
              <button
                type="button"
                key={role.id}
                onClick={() => {
                  setSelectedRole(role.id);
                  setQuery("");
                }}
                className={`min-w-[5.5rem] flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-smooth sm:min-w-0 sm:flex-none ${
                  selectedRole === role.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-foreground-variant hover:bg-surface-container-high"
                }`}
              >
                {t(role.labelKey)}
              </button>
            ))}
          </div>

          <div className="border-t border-outline-variant/10 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="input-field input-field--leading-icon w-full py-2.5 text-sm"
                placeholder={t("shell.actAsSearchPlaceholder")}
                autoComplete="off"
              />
            </div>
            {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}

            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {loading ? (
                <p className="px-2 py-3 text-sm text-foreground-variant">{t("shell.actAsLoading")}</p>
              ) : results.length ? (
                results.map((result) => {
                  const rk = roleLabelKeyForUserRole(result.role);
                  const roleBit = rk ? t(rk) : result.role;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      disabled={actingUserId === result.id}
                      onClick={() => void actAs(result)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-smooth hover:bg-surface-container disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {result.display_name || result.username}
                        </span>
                        <span className="block truncate text-sm text-foreground-variant">
                          {result.username} · {roleBit} · #{result.id}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-sm font-medium text-primary">
                        {actingUserId === result.id ? t("shell.actAsStarting") : t("shell.actAsAct")}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-3 text-sm text-foreground-variant">{t("shell.actAsEmpty")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
