"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AiSettingsPanel from "@/components/admin/settings/AiSettingsPanel";
import ServerSettingsPanel from "@/components/admin/settings/ServerSettingsPanel";
import MlCalibrationClient from "@/app/admin/ml-calibration/MlCalibrationClient";
import { AppPage } from "@/components/layout/AppPage";

export type SettingsTabKey = "profile" | "ai" | "server" | "audit" | "system";

function tabFromSearch(search: string): SettingsTabKey {
  const value = new URLSearchParams(search).get("tab");
  if (value === "ml" || value === "system") return "system";
  if (value === "audit") return "audit";
  if (value === "ai" || value === "server") return value;
  return "profile";
}

export default function AdminSettingsClient() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = useMemo(
    () => tabFromSearch(searchParams.toString()),
    [searchParams],
  );

  const setTab = useCallback(
    (next: SettingsTabKey) => {
      const query = next === "profile" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [pathname, router],
  );

  if (!user) return null;

  const backendDocs = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"}/docs`;

  return (
    <AppPage
      width="content"
      title={t("settings.title")}
      description={t("settings.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/admin" },
        { label: t("nav.settings") },
      ]}
    >

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([
          ["profile", "settings.tabProfile"],
          ["ai", "settings.tabAi"],
          ["server", "settings.tabServer"],
          ["audit", "nav.auditLog"],
          ["system", "nav.mlCalibration"],
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
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm text-muted-foreground">{t("settings.profileRedirectBody")}</p>
              <Button type="button" onClick={() => router.push("/account")}>
                {t("settings.profileOpenAccount")}
              </Button>
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

      {tab === "server" ? <ServerSettingsPanel /> : null}

      {tab === "audit" ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">{t("admin.auditLog.recordsDesc")}</p>
            <Button type="button" onClick={() => router.push("/admin/audit")}>
              {t("nav.auditLog")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {tab === "system" ? <MlCalibrationClient embedded /> : null}
    </AppPage>
  );
}


