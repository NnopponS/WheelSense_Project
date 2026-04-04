"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import { ExternalLink, Shield, Mail, Key, Cpu, Bot, Loader2 } from "lucide-react";

type TabKey = "profile" | "ai" | "ml";

type AISettingsOut = {
  provider: "ollama" | "copilot";
  model: string;
  workspace_default_provider: "ollama" | "copilot";
  workspace_default_model: string;
  user_provider_override: string | null;
  user_model_override: string | null;
};

type OllamaTag = { name: string; size?: number; digest?: string };

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab: TabKey = useMemo(() => {
    const v = searchParams.get("tab");
    if (v === "ai" || v === "ml") return v;
    return "profile";
  }, [searchParams]);

  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "profile") params.delete("tab");
      else params.set("tab", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data: aiSettings, refetch: refetchAi } = useQuery<AISettingsOut>("/settings/ai");
  const { data: loc } = useQuery<Record<string, unknown>>("/localization");
  const { data: motion } = useQuery<Record<string, unknown>>("/motion/model");
  const { data: ollamaModels, refetch: refetchOllamaModels } = useQuery<{
    models: OllamaTag[];
  }>("/settings/ai/ollama/models");
  const { data: copilotStatus, refetch: refetchCopilot } = useQuery<{
    connected: boolean;
  }>("/settings/ai/copilot/status");

  const [userProvider, setUserProvider] = useState<"ollama" | "copilot">("ollama");
  const [userModel, setUserModel] = useState("");
  const [wsProvider, setWsProvider] = useState<"ollama" | "copilot">("ollama");
  const [wsModel, setWsModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pullName, setPullName] = useState("gemma3:4b");
  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string | null>(null);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [pollDc, setPollDc] = useState<string | null>(null);
  const [copilotBusy, setCopilotBusy] = useState(false);

  useEffect(() => {
    if (!aiSettings) return;
    const up = (aiSettings.user_provider_override ?? aiSettings.provider) as "ollama" | "copilot";
    const wp = aiSettings.workspace_default_provider as "ollama" | "copilot";
    setUserProvider(up);
    setUserModel(aiSettings.user_model_override ?? aiSettings.model);
    setWsProvider(wp);
    setWsModel(aiSettings.workspace_default_model);
  }, [aiSettings]);

  async function saveUserAi() {
    setSaving(true);
    try {
      await api.put<AISettingsOut>("/settings/ai", {
        provider: userProvider,
        model: userModel,
      });
      await refetchAi();
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  async function saveWorkspaceAi() {
    setSaving(true);
    try {
      await api.put<AISettingsOut>("/settings/ai/global", {
        default_provider: wsProvider,
        default_model: wsModel,
      });
      await refetchAi();
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  }

  async function startCopilotDeviceFlow() {
    setCopilotBusy(true);
    setUserCode(null);
    setVerificationUri(null);
    setPollDc(null);
    try {
      const res = await api.post<{
        device_code: string;
        user_code: string;
        verification_uri: string;
      }>("/settings/ai/copilot/device-code", {});
      setUserCode(res.user_code);
      setVerificationUri(res.verification_uri);
      setPollDc(res.device_code);
      setCopilotOpen(true);
    } catch (e) {
      setPullLog(e instanceof ApiError ? e.message : "Device flow failed");
    } finally {
      setCopilotBusy(false);
    }
  }

  useEffect(() => {
    if (!pollDc || !copilotOpen) return;
    const id = window.setInterval(async () => {
      try {
        const res = await api.post<{
          status: string;
          access_token?: string | null;
        }>("/settings/ai/copilot/poll-token", { device_code: pollDc });
        if (res.status === "success") {
          setPollDc(null);
          setCopilotOpen(false);
          await refetchCopilot();
        }
      } catch {
        /* pending */
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [pollDc, copilotOpen, refetchCopilot]);

  async function runOllamaPull() {
    setPulling(true);
    setPullLog("");
    try {
      const res = await fetch(`/api/settings/ai/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pullName }),
        credentials: "include",
      });
      if (!res.ok) {
        setPullLog(await res.text());
        return;
      }
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
        }
      }
      setPullLog(acc.slice(-2000) || "Done.");
      await refetchOllamaModels();
    } catch (e) {
      setPullLog(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  }

  if (!user) return null;

  const backendDocs =
    `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"}/docs`;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("settings.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-outline-variant/20 pb-3">
        {(
          [
            ["profile", "settings.tabProfile"],
            ["ai", "settings.tabAi"],
            ["ml", "settings.tabMl"],
          ] as const
        ).map(([k, labelKey]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
              tab === k
                ? "bg-primary-fixed text-primary"
                : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-5 mb-6">
              <div className="w-16 h-16 rounded-full gradient-cta flex items-center justify-center text-white text-2xl font-bold">
                {user.username?.[0]?.toUpperCase() || "U"}
              </div>
              <div>
                <p className="text-xl font-bold text-on-surface">{user.username}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-sm text-on-surface-variant capitalize">
                    {t("profile.role")}: {user.role}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-4 border-t border-outline-variant/20 pt-5">
              <div className="flex items-center gap-3">
                <Key className="w-4 h-4 text-outline" />
                <div>
                  <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                    User ID
                  </p>
                  <p className="text-sm font-mono text-on-surface">{user.id}</p>
                </div>
              </div>
              {user.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-outline" />
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                      Email
                    </p>
                    <p className="text-sm text-on-surface">{user.email}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="surface-card p-6">
            <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
              Quick Links
            </h3>
            <a
              href={backendDocs}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-container-low transition-smooth"
            >
              <ExternalLink className="w-4 h-4 text-primary" />
              <span className="text-sm text-on-surface font-medium">{t("profile.apiDocs")}</span>
            </a>
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-6">
          <div className="surface-card p-6 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-on-surface">
              <Bot className="w-4 h-4 text-primary" />
              {t("settings.ai.userOverrides")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-on-surface-variant">{t("settings.ai.provider")}</label>
                <select
                  className="input-field mt-1 w-full text-sm"
                  value={userProvider}
                  onChange={(e) =>
                    setUserProvider(e.target.value as "ollama" | "copilot")
                  }
                >
                  <option value="ollama">Ollama</option>
                  <option value="copilot">GitHub Copilot</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant">{t("settings.ai.model")}</label>
                <input
                  className="input-field mt-1 w-full text-sm"
                  value={userModel}
                  onChange={(e) => setUserModel(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveUserAi()}
              className="gradient-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {t("settings.ai.saveUser")}
            </button>
          </div>

          <div className="surface-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.ai.workspaceDefaults")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-on-surface-variant">{t("settings.ai.provider")}</label>
                <select
                  className="input-field mt-1 w-full text-sm"
                  value={wsProvider}
                  onChange={(e) =>
                    setWsProvider(e.target.value as "ollama" | "copilot")
                  }
                >
                  <option value="ollama">Ollama</option>
                  <option value="copilot">GitHub Copilot</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant">{t("settings.ai.model")}</label>
                <input
                  className="input-field mt-1 w-full text-sm"
                  value={wsModel}
                  onChange={(e) => setWsModel(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveWorkspaceAi()}
              className="gradient-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {t("settings.ai.saveWorkspace")}
            </button>
          </div>

          <div className="surface-card p-6 space-y-3">
            <p className="text-sm font-semibold text-on-surface">{t("settings.ai.copilotStatus")}</p>
            <p className="text-sm text-on-surface-variant">
              {copilotStatus?.connected
                ? t("settings.ai.copilotConnected")
                : t("settings.ai.copilotDisconnected")}
            </p>
            <button
              type="button"
              disabled={copilotBusy}
              onClick={() => void startCopilotDeviceFlow()}
              className="px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium hover:bg-surface-container-low inline-flex items-center gap-2"
            >
              {copilotBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("settings.ai.copilotConnect")}
            </button>
          </div>

          <div className="surface-card p-6 space-y-3">
            <p className="text-sm font-semibold text-on-surface">{t("settings.ai.ollamaModels")}</p>
            <div className="max-h-40 overflow-y-auto text-xs font-mono bg-surface-container-low rounded-lg p-2">
              {(ollamaModels?.models ?? []).map((m) => (
                <div key={m.name}>{m.name}</div>
              ))}
              {!ollamaModels?.models?.length && (
                <span className="text-on-surface-variant">—</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-on-surface-variant">{t("settings.ai.pullPlaceholder")}</label>
                <input
                  className="input-field mt-1 w-full text-sm"
                  value={pullName}
                  onChange={(e) => setPullName(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={pulling}
                onClick={() => void runOllamaPull()}
                className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {pulling ? "…" : t("settings.ai.pullModel")}
              </button>
            </div>
            {pullLog && (
              <pre className="text-xs bg-surface-container-low rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                {pullLog}
              </pre>
            )}
          </div>

          {copilotOpen && userCode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="surface-card max-w-md w-full p-6 space-y-4">
                <p className="text-sm font-semibold text-on-surface">{t("settings.ai.enterCode")}</p>
                <p className="text-3xl font-mono tracking-widest text-center text-primary">{userCode}</p>
                {verificationUri && (
                  <a
                    href={verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-sm text-primary underline"
                  >
                    {verificationUri}
                  </a>
                )}
                <button
                  type="button"
                  className="w-full py-2 rounded-xl border border-outline-variant/30 text-sm"
                  onClick={() => {
                    setCopilotOpen(false);
                    setPollDc(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "ml" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Cpu className="w-7 h-7 text-primary" />
            <div>
              <h3 className="text-lg font-bold text-on-surface">{t("admin.ml.title")}</h3>
              <p className="text-sm text-on-surface-variant">{t("admin.ml.subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-card p-4 space-y-2">
              <p className="text-sm font-semibold text-on-surface">{t("admin.ml.knn")}</p>
              <pre className="text-xs bg-surface-container-low rounded-lg p-3 overflow-x-auto text-on-surface-variant">
                {JSON.stringify(loc, null, 2)}
              </pre>
              <p className="text-xs text-on-surface-variant">
                Train: POST /api/localization/train · Predict uses live RSSI vectors.
              </p>
            </div>
            <div className="surface-card p-4 space-y-2">
              <p className="text-sm font-semibold text-on-surface">{t("admin.ml.motion")}</p>
              <pre className="text-xs bg-surface-container-low rounded-lg p-3 overflow-x-auto text-on-surface-variant">
                {JSON.stringify(motion, null, 2)}
              </pre>
              <p className="text-xs text-on-surface-variant">
                Train: POST /api/motion/train · Save/load: /api/motion/model/save|load
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
