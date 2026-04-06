"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import { ExternalLink, Shield, Mail, Key, Cpu, Bot, Loader2, HardDrive, Trash2, Check, Copy, CheckCheck, X } from "lucide-react";

export type SettingsTabKey = "profile" | "ai" | "ml";

type AISettingsOut = {
  provider: "ollama" | "copilot";
  model: string;
  workspace_default_provider: "ollama" | "copilot";
  workspace_default_model: string;
  user_provider_override: string | null;
  user_model_override: string | null;
};

type OllamaTag = { name: string; size?: number; digest?: string };

function tabFromSearch(search: string): SettingsTabKey {
  const v = new URLSearchParams(search).get("tab");
  if (v === "ai" || v === "ml") return v;
  return "profile";
}

/** Preset tags for Pull — only `gemma4:e4b` plus custom (Other). */
const PULL_PRESETS = ["gemma4:e4b"] as const;
const PULL_OTHER = "__pull_other__";

/** Copilot CLI chat models (fixed list; pick one after GitHub connect). */
const COPILOT_CHAT_MODELS: { value: string; label: string }[] = [
  { value: "gpt-4.1", label: "GPT-4.1 (GitHub Copilot)" },
  { value: "gpt-4o",  label: "GPT-4o (GitHub Copilot)" },
];

const COPILOT_MODEL_IDS = COPILOT_CHAT_MODELS.map((m) => m.value);

function isCopilotModelId(s: string): boolean {
  return COPILOT_MODEL_IDS.includes(s);
}

/** Parses Ollama NDJSON pull stream; surfaces `error` lines and our proxy errors. */
function parseOllamaPullNdjson(raw: string): { error: string | null; lastStatus: string } {
  let lastStatus = "";
  let error: string | null = null;
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if ("error" in obj && obj.error != null) {
        const e = obj.error;
        let msg =
          typeof e === "string"
            ? e
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message?: unknown }).message)
              : JSON.stringify(e);
        if (obj.detail != null) msg += ` — ${String(obj.detail)}`;
        error = msg;
      }
      if (typeof obj.status === "string") lastStatus = obj.status;
    } catch {
      /* non-JSON line */
    }
  }
  return { error, lastStatus };
}

function OllamaInstalledSelect({
  id,
  label,
  value,
  onChange,
  installedNames,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  installedNames: string[];
  hint?: string;
}) {
  const { t } = useTranslation();
  const inList = installedNames.includes(value);
  const selectValue = inList ? value : "";

  return (
    <div>
      <label htmlFor={id} className="text-xs text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        className="input-field mt-1 w-full text-sm"
        disabled={installedNames.length === 0}
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
      >
        {installedNames.length === 0 ? (
          <option value="">{t("settings.ai.noOllamaInstalledSelect")}</option>
        ) : (
          <>
            <option value="">{t("settings.ai.pickInstalledPlaceholder")}</option>
            {installedNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </>
        )}
      </select>
      {!inList && value ? (
        <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          {t("settings.ai.savedOllamaNotInstalled")}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}

function CopilotModelSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const inList = isCopilotModelId(value);

  return (
    <div>
      <label htmlFor={id} className="text-xs text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        className="input-field mt-1 w-full text-sm"
        value={inList ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("settings.ai.pickCopilotPlaceholder")}</option>
        {COPILOT_CHAT_MODELS.map(({ value: v, label: l }) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {!inList && value ? (
        <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          {t("settings.ai.savedCopilotNotInList")}
        </p>
      ) : null}
    </div>
  );
}

export default function AdminSettingsClient({ initialTab }: { initialTab: SettingsTabKey }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<SettingsTabKey>(initialTab);

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
      const q = next === "profile" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${q}`, { scroll: false });
    },
    [pathname, router],
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
  const [pullName, setPullName] = useState("gemma4:e4b");
  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [pollDc, setPollDc] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("copilot_poll_dc");
  });
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotSuccess, setCopilotSuccess] = useState(false);

  const installedOllamaNames = useMemo(() => {
    const names = (ollamaModels?.models ?? []).map((m) => m.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [ollamaModels]);

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
    setCopilotSuccess(false);
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
      // Show the server error clearly — most common is 503 when GITHUB_OAUTH_CLIENT_ID is not set
      const msg = e instanceof ApiError ? e.message : "Device flow failed";
      setPullLog(`GitHub Copilot: ${msg}`);
    } finally {
      setCopilotBusy(false);
    }
  }

  // Persist pollDc to sessionStorage so a page refresh doesn't break polling
  useEffect(() => {
    if (pollDc) {
      sessionStorage.setItem("copilot_poll_dc", pollDc);
    } else {
      sessionStorage.removeItem("copilot_poll_dc");
    }
  }, [pollDc]);

  // Restore copilotOpen if we have a persisted device code (e.g. after a hard refresh)
  useEffect(() => {
    if (pollDc && !copilotOpen) setCopilotOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pollDc) return;
    const id = window.setInterval(async () => {
      try {
        const res = await api.post<{
          status: string;
          access_token?: string | null;
        }>("/settings/ai/copilot/poll-token", { device_code: pollDc });
        if (res.status === "success") {
          setPollDc(null);
          setCopilotSuccess(true);
          await refetchCopilot();
          // Auto-switch the workspace provider to copilot so AI chat works immediately
          try {
            await api.put("/settings/ai/global", {
              default_provider: "copilot",
              default_model: wsModel || "gpt-4.1",
            });
            setWsProvider("copilot");
            if (!wsModel) setWsModel("gpt-4.1");
            await refetchAi();
          } catch { /* non-critical */ }
          setTimeout(() => {
            setCopilotOpen(false);
            setCopilotSuccess(false);
          }, 2500);
        }
      } catch {
        /* pending */
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [pollDc, wsModel, refetchCopilot, refetchAi]);

  async function runOllamaPull() {
    const name = pullName.trim();
    if (!name) {
      setPullLog(t("settings.ai.pullNameRequired"));
      return;
    }
    setPulling(true);
    setPullLog("");
    setPullProgress(0);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("ws_token") ??
            document.cookie.match(/(?:^|;\s*)ws_token=([^;]*)/)?.[1]
          : null;
      const res = await fetch(`/api/settings/ai/ollama/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setPullLog(await res.text());
        setPullProgress(null);
        return;
      }
      if (!res.body) {
        setPullLog(t("settings.ai.pullEmptyResponse"));
        setPullProgress(null);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        // Live progress from complete lines so far
        const complete = raw.split("\n").slice(0, -1);
        for (const line of complete) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed) as Record<string, unknown>;
            if (obj.completed && obj.total) {
              setPullProgress(
                Math.round((Number(obj.completed) / Number(obj.total)) * 100),
              );
            }
            if (typeof obj.status === "string") {
              setPullLog(obj.status);
            }
          } catch {
            setPullLog(trimmed.slice(-200));
          }
        }
      }
      const { error: streamError } = parseOllamaPullNdjson(raw);
      if (streamError) {
        setPullLog(`${t("settings.ai.pullStreamError")}: ${streamError}`);
        setPullProgress(null);
        return;
      }
      setPullProgress(100);
      const listed = await api.get<{ models: { name: string }[] }>(
        "/settings/ai/ollama/models",
      );
      await refetchOllamaModels();
      if (!listed.models?.length) {
        setPullLog(t("settings.ai.pullSucceededButEmpty"));
      } else {
        setPullLog(t("settings.ai.pullDoneSuccess"));
      }
    } catch (e) {
      setPullLog(e instanceof Error ? e.message : "Pull failed");
      setPullProgress(null);
    } finally {
      setPulling(false);
    }
  }

  async function deleteOllamaModel(name: string) {
    setDeleteTarget(name);
    try {
      await api.delete(`/settings/ai/ollama/models/${encodeURIComponent(name)}`);
      await refetchOllamaModels();
    } catch {
      setPullLog(`Failed to delete ${name}`);
    } finally {
      setDeleteTarget(null);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return "";
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 ** 2);
    return `${mb.toFixed(0)} MB`;
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
                  onChange={(e) => {
                    const next = e.target.value as "ollama" | "copilot";
                    setUserProvider(next);
                    if (next === "copilot") {
                      setUserModel((m) => (isCopilotModelId(m) ? m : "gpt-4.1"));
                    } else {
                      setUserModel((m) =>
                        installedOllamaNames.includes(m)
                          ? m
                          : (installedOllamaNames[0] ?? ""),
                      );
                    }
                  }}
                >
                  <option value="ollama">Ollama</option>
                  <option value="copilot">GitHub Copilot</option>
                </select>
              </div>
              {userProvider === "ollama" ? (
                <OllamaInstalledSelect
                  id="user-ai-model"
                  label={t("settings.ai.model")}
                  value={userModel}
                  onChange={setUserModel}
                  installedNames={installedOllamaNames}
                  hint={t("settings.ai.ollamaModelHintShort")}
                />
              ) : (
                <CopilotModelSelect
                  id="user-copilot-model"
                  label={t("settings.ai.model")}
                  value={userModel}
                  onChange={setUserModel}
                />
              )}
            </div>
            <button
              type="button"
              disabled={
                saving ||
                (userProvider === "ollama" &&
                  (!installedOllamaNames.length ||
                    !installedOllamaNames.includes(userModel))) ||
                (userProvider === "copilot" && !isCopilotModelId(userModel))
              }
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
                  onChange={(e) => {
                    const next = e.target.value as "ollama" | "copilot";
                    setWsProvider(next);
                    if (next === "copilot") {
                      setWsModel((m) => (isCopilotModelId(m) ? m : "gpt-4.1"));
                    } else {
                      setWsModel((m) =>
                        installedOllamaNames.includes(m)
                          ? m
                          : (installedOllamaNames[0] ?? ""),
                      );
                    }
                  }}
                >
                  <option value="ollama">Ollama</option>
                  <option value="copilot">GitHub Copilot</option>
                </select>
              </div>
              {wsProvider === "ollama" ? (
                <OllamaInstalledSelect
                  id="ws-ai-model"
                  label={t("settings.ai.model")}
                  value={wsModel}
                  onChange={setWsModel}
                  installedNames={installedOllamaNames}
                />
              ) : (
                <CopilotModelSelect
                  id="ws-copilot-model"
                  label={t("settings.ai.model")}
                  value={wsModel}
                  onChange={setWsModel}
                />
              )}
            </div>
            <button
              type="button"
              disabled={
                saving ||
                (wsProvider === "ollama" &&
                  (!installedOllamaNames.length ||
                    !installedOllamaNames.includes(wsModel))) ||
                (wsProvider === "copilot" && !isCopilotModelId(wsModel))
              }
              onClick={() => void saveWorkspaceAi()}
              className="gradient-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {t("settings.ai.saveWorkspace")}
            </button>
          </div>

          <div className="surface-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface">{t("settings.ai.copilotStatus")}</p>
              {copilotStatus?.connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  <span className="h-1.5 w-1.5 rounded-full bg-outline" />
                  Not connected
                </span>
              )}
            </div>
            <p className="text-sm text-on-surface-variant">
              {copilotStatus?.connected
                ? "GitHub Copilot is authenticated for this workspace. You can now use Copilot models in the AI chat."
                : "Connect your GitHub account to use Copilot (GPT-4.1, Claude, etc.) as the AI backend."}
            </p>
            {!copilotStatus?.connected && (
              <button
                type="button"
                disabled={copilotBusy}
                onClick={() => void startCopilotDeviceFlow()}
                className="px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium hover:bg-surface-container-low inline-flex items-center gap-2"
              >
                {copilotBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t("settings.ai.copilotConnect")}
              </button>
            )}
            {copilotStatus?.connected && (
              <button
                type="button"
                disabled={copilotBusy}
                onClick={() => void startCopilotDeviceFlow()}
                className="px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium hover:bg-surface-container-low inline-flex items-center gap-2 text-on-surface-variant"
              >
                {copilotBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Re-authenticate
              </button>
            )}
          </div>

          <div className="surface-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" aria-hidden />
                  {t("settings.ai.ollamaLibraryTitle")}
                </p>
                <p className="mt-1 text-[11px] text-on-surface-variant max-w-md">
                  {t("settings.ai.ollamaLibrarySubtitle")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                {ollamaModels?.models?.length ?? 0}{" "}
                {t("settings.ai.ollamaModelCountSuffix")}
              </span>
            </div>

            {/* ── Model cards ────────── */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(ollamaModels?.models ?? []).map((m) => (
                <div
                  key={m.name}
                  className="flex items-center gap-3 rounded-xl bg-surface-container-low px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed/60">
                    <Bot className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {m.name}
                    </p>
                    {m.size && (
                      <p className="text-[11px] text-on-surface-variant">
                        {formatBytes(m.size)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={deleteTarget === m.name}
                    className="rounded-lg p-1.5 text-outline hover:text-critical hover:bg-critical/10 transition-smooth disabled:opacity-50"
                    onClick={() => void deleteOllamaModel(m.name)}
                    aria-label={`Delete model ${m.name}`}
                  >
                    {deleteTarget === m.name
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      : <Trash2 className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              ))}
              {!ollamaModels?.models?.length && (
                <p className="text-sm text-on-surface-variant py-3 text-center">No models installed.</p>
              )}
            </div>

            {/* ── Pull model ──────────── */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                <label className="text-xs text-on-surface-variant" htmlFor="ollama-pull-preset">
                  {t("settings.ai.pullPresetLabel")}
                </label>
                <select
                  id="ollama-pull-preset"
                  className="input-field w-full text-sm"
                  value={
                    (PULL_PRESETS as readonly string[]).includes(pullName)
                      ? pullName
                      : PULL_OTHER
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === PULL_OTHER) {
                      setPullName((prev) =>
                        (PULL_PRESETS as readonly string[]).includes(prev) ? "" : prev,
                      );
                    } else {
                      setPullName(v);
                    }
                  }}
                >
                  {PULL_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value={PULL_OTHER}>{t("settings.ai.pullOtherModel")}</option>
                </select>
                {!(PULL_PRESETS as readonly string[]).includes(pullName) ? (
                  <input
                    className="input-field w-full text-sm"
                    value={pullName}
                    onChange={(e) => setPullName(e.target.value)}
                    placeholder={t("settings.ai.pullPlaceholder")}
                    aria-label={t("settings.ai.pullPlaceholder")}
                  />
                ) : null}
              </div>
              <button
                type="button"
                disabled={pulling || !pullName.trim()}
                onClick={() => void runOllamaPull()}
                className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pulling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {pulling ? "Pulling…" : t("settings.ai.pullModel")}
              </button>
            </div>

            {/* ── Progress bar ──────── */}
            {pulling && pullProgress !== null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                  <span>{pullLog || "Downloading…"}</span>
                  <span className="font-mono">{pullProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${pullProgress}%` }}
                  />
                </div>
              </div>
            )}
            {!pulling && pullLog && (
              <p
                className={`text-xs px-3 py-2 rounded-lg ${
                  pullLog === t("settings.ai.pullDoneSuccess")
                    ? "bg-primary-fixed/40 text-primary"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                {pullLog}
              </p>
            )}
          </div>

          {copilotOpen && userCode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="surface-card max-w-md w-full p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">{t("settings.ai.enterCode")}</p>
                  <button
                    type="button"
                    className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                    onClick={() => {
                      setCopilotOpen(false);
                      setPollDc(null);
                    }}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>

                {/* Large device code display */}
                <div className="rounded-2xl bg-surface-container-low p-6 text-center">
                  <p className="text-5xl font-mono font-extrabold tracking-[.3em] text-primary select-all">
                    {userCode}
                  </p>
                </div>

                {/* Copy button */}
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2.5 text-sm font-medium hover:bg-surface-container-low transition-smooth"
                  onClick={() => copyToClipboard(userCode)}
                >
                  {copiedCode
                    ? <><CheckCheck className="h-4 w-4 text-primary" aria-hidden /> Copied!</>
                    : <><Copy className="h-4 w-4" aria-hidden /> Copy Code</>}
                </button>

                {verificationUri && (
                  <a
                    href={verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 text-sm text-primary font-medium underline hover:opacity-80"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Open GitHub to enter code
                  </a>
                )}

                {/* Polling / success indicator */}
                {copilotSuccess ? (
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                    <Check className="h-5 w-5" aria-hidden />
                    Connected! Switching to Copilot…
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs text-on-surface-variant">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Waiting for authorization…
                  </div>
                )}
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
