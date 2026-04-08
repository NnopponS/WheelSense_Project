"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Cpu, ExternalLink, Key, Mail, Shield } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/hooks/useQuery";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AiSettingsPanel from "@/components/admin/settings/AiSettingsPanel";

export type SettingsTabKey = "profile" | "ai" | "ml";

function tabFromSearch(search: string): SettingsTabKey {
  const value = new URLSearchParams(search).get("tab");
  if (value === "ai" || value === "ml") return value;
  return "profile";
}

export default function AdminSettingsClient({ initialTab }: { initialTab: SettingsTabKey }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<SettingsTabKey>(initialTab);
  const { data: localization } = useQuery<Record<string, unknown>>("/localization");
  const { data: motion } = useQuery<Record<string, unknown>>("/motion/model");

  useEffect(() => {
    setTabState(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const onPopState = () => setTabState(tabFromSearch(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setTab = useCallback(
    (next: SettingsTabKey) => {
      setTabState(next);
      const query = next === "profile" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [pathname, router],
  );

  if (!user) return null;

  const backendDocs = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"}/docs`;

  return (
    <div className="max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("settings.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([
          ["profile", "settings.tabProfile"],
          ["ai", "settings.tabAi"],
          ["ml", "settings.tabMl"],
        ] as const).map(([key, labelKey]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {t(labelKey)}
          </Button>
        ))}
      </div>

      {tab === "profile" ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {user.username?.[0]?.toUpperCase() || "U"}
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{user.username}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="capitalize">
                      {t("profile.role")}: {user.role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-2">
                <InfoTile label="User ID" value={String(user.id)} icon={<Key className="h-4 w-4 text-primary" />} />
                {user.email ? (
                  <InfoTile label="Email" value={user.email} icon={<Mail className="h-4 w-4 text-primary" />} />
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <a
                href={backendDocs}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                {t("profile.apiDocs")}
              </a>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "ai" ? <AiSettingsPanel /> : null}

      {tab === "ml" ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Cpu className="h-7 w-7 text-primary" />
            <div>
              <h3 className="text-lg font-bold text-foreground">{t("admin.ml.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("admin.ml.subtitle")}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-semibold text-foreground">{t("admin.ml.knn")}</p>
                <pre className="overflow-x-auto rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(localization, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Train: POST /api/localization/train · Predict uses live RSSI vectors.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-semibold text-foreground">{t("admin.ml.motion")}</p>
                <pre className="overflow-x-auto rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(motion, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Train: POST /api/motion/train · Save/load: /api/motion/model/save|load
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
      {icon}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
