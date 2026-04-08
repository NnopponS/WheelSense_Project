"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  HardDrive,
  Loader2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AISettingsOut = {
  provider: "ollama" | "copilot";
  model: string;
  workspace_default_provider: "ollama" | "copilot";
  workspace_default_model: string;
  user_provider_override: string | null;
  user_model_override: string | null;
};

type CopilotModel = {
  id: string;
  name: string;
  supports_reasoning_effort?: boolean;
  supports_vision?: boolean;
};

type OllamaTag = { name: string; size?: number; digest?: string };

type OllamaModelsResponse = {
  models: OllamaTag[];
  reachable: boolean;
  origin?: string | null;
  message?: string | null;
};

type CopilotModelsResponse = {
  models: CopilotModel[];
  connected: boolean;
  message?: string | null;
};

const PULL_PRESETS = ["gemma4:e4b"] as const;
const PULL_OTHER = "__pull_other__";

function parseOllamaPullNdjson(raw: string): { error: string | null } {
  let error: string | null = null;

  for (const line of raw.split("\n").map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if ("error" in parsed && parsed.error != null) {
        error =
          typeof parsed.error === "string"
            ? parsed.error
            : JSON.stringify(parsed.error);
      }
    } catch {
      // ignore non-JSON fragments from stream boundaries
    }
  }

  return { error };
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

function providerLabel(provider: "ollama" | "copilot") {
  return provider === "ollama" ? "Ollama" : "GitHub Copilot";
}

function StatusRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function SectionMessage({
  tone,
  children,
}: {
  tone: "warning" | "error" | "success";
  children: ReactNode;
}) {
  const classes = {
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
    error:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  };

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes[tone]}`}>{children}</div>;
}

function ProviderModelSection({
  title,
  description,
  provider,
  onProviderChange,
  model,
  onModelChange,
  ollamaModels,
  copilotModels,
  disabled,
  saveLabel,
  onSave,
}: {
  title: string;
  description: string;
  provider: "ollama" | "copilot";
  onProviderChange: (value: "ollama" | "copilot") => void;
  model: string;
  onModelChange: (value: string) => void;
  ollamaModels: OllamaModelsResponse | null;
  copilotModels: CopilotModelsResponse | null;
  disabled: boolean;
  saveLabel: string;
  onSave: () => Promise<void>;
}) {
  const ollamaNames = useMemo(
    () => (ollamaModels?.models ?? []).map((entry) => entry.name).sort((a, b) => a.localeCompare(b)),
    [ollamaModels],
  );
  const copilotChoices = copilotModels?.models ?? [];
  const options = provider === "ollama"
    ? ollamaNames.map((value) => ({ value, label: value }))
    : copilotChoices.map((entry) => ({ value: entry.id, label: `${entry.name} (${entry.id})` }));
  const currentValueInList = options.some((option) => option.value === model);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(value) => onProviderChange(value as "ollama" | "copilot")}>
              <SelectTrigger>
                <SelectValue placeholder="Choose provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="copilot">GitHub Copilot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select
              value={currentValueInList ? model : "__empty__"}
              onValueChange={(value) => onModelChange(value === "__empty__" ? "" : value)}
              disabled={options.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={provider === "ollama" ? "No Ollama models available" : "No Copilot models available"} />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    {provider === "ollama" ? "No Ollama models available" : "No Copilot models available"}
                  </SelectItem>
                ) : (
                  options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {provider === "ollama" && ollamaModels?.reachable === false && ollamaModels.message ? (
          <SectionMessage tone="warning">{ollamaModels.message}</SectionMessage>
        ) : null}
        {provider === "copilot" && copilotModels?.message ? (
          <SectionMessage tone="warning">{copilotModels.message}</SectionMessage>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" onClick={() => void onSave()} disabled={disabled || !model}>
            {saveLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiSettingsPanel() {
  const { t } = useTranslation();

  const { data: aiSettings, refetch: refetchAi } = useQuery<AISettingsOut>("/settings/ai", {
    retry: false,
    staleTime: 60_000,
    refetchInterval: false,
  });
  const { data: ollamaModels, refetch: refetchOllamaModels } =
    useQuery<OllamaModelsResponse>("/settings/ai/ollama/models", {
      retry: false,
      staleTime: 30_000,
      refetchInterval: false,
    });
  const { data: copilotStatus, refetch: refetchCopilotStatus } =
    useQuery<{ connected: boolean }>("/settings/ai/copilot/status", {
      retry: false,
      staleTime: 30_000,
      refetchInterval: false,
    });
  const { data: copilotModels, refetch: refetchCopilotModels } =
    useQuery<CopilotModelsResponse>("/settings/ai/copilot/models", {
      retry: false,
      staleTime: 30_000,
      refetchInterval: false,
    });

  const [userProvider, setUserProvider] = useState<"ollama" | "copilot">("ollama");
  const [userModel, setUserModel] = useState("");
  const [workspaceProvider, setWorkspaceProvider] = useState<"ollama" | "copilot">("ollama");
  const [workspaceModel, setWorkspaceModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotSuccess, setCopilotSuccess] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [pollDc, setPollDc] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("copilot_poll_dc");
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [pullName, setPullName] = useState("gemma4:e4b");
  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const availableCopilotModels = copilotModels?.models ?? [];
  const availableOllamaModels = ollamaModels?.models ?? [];

  useEffect(() => {
    if (!aiSettings) return;
    setUserProvider((aiSettings.user_provider_override ?? aiSettings.provider) as "ollama" | "copilot");
    setUserModel(aiSettings.user_model_override ?? aiSettings.model);
    setWorkspaceProvider(aiSettings.workspace_default_provider);
    setWorkspaceModel(aiSettings.workspace_default_model);
  }, [aiSettings]);

  useEffect(() => {
    if (pollDc) {
      sessionStorage.setItem("copilot_poll_dc", pollDc);
      setCopilotOpen(true);
    } else {
      sessionStorage.removeItem("copilot_poll_dc");
    }
  }, [pollDc]);

  useEffect(() => {
    if (!pollDc) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.post<{ status: string }>("/settings/ai/copilot/poll-token", {
          device_code: pollDc,
        });
        if (response.status === "success") {
          setPollDc(null);
          setCopilotSuccess(true);
          await refetchCopilotStatus();
          await refetchCopilotModels();
          await refetchAi();
          setTimeout(() => {
            setCopilotSuccess(false);
            setCopilotOpen(false);
          }, 2500);
        }
      } catch {
        // pending or temporarily unavailable
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [pollDc, refetchAi, refetchCopilotModels, refetchCopilotStatus]);

  async function saveUserAi() {
    setSaving(true);
    try {
      await api.put("/settings/ai", {
        provider: userProvider,
        model: userModel,
      });
      await refetchAi();
    } finally {
      setSaving(false);
    }
  }

  async function saveWorkspaceAi() {
    setSaving(true);
    try {
      await api.put("/settings/ai/global", {
        default_provider: workspaceProvider,
        default_model: workspaceModel,
      });
      await refetchAi();
    } finally {
      setSaving(false);
    }
  }

  async function startCopilotDeviceFlow() {
    setCopilotBusy(true);
    setCopilotError(null);
    setCopilotSuccess(false);
    setUserCode(null);
    setVerificationUri(null);
    setPollDc(null);

    try {
      const response = await api.post<{
        device_code: string;
        user_code: string;
        verification_uri: string;
      }>("/settings/ai/copilot/device-code", {});
      setUserCode(response.user_code);
      setVerificationUri(response.verification_uri);
      setPollDc(response.device_code);
      setCopilotOpen(true);
    } catch (error) {
      setCopilotError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Copilot device flow failed",
      );
    } finally {
      setCopilotBusy(false);
    }
  }

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
      const response = await fetch("/api/settings/ai/ollama/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : {}),
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        setPullLog(await response.text());
        setPullProgress(null);
        return;
      }

      if (!response.body) {
        setPullLog(t("settings.ai.pullEmptyResponse"));
        setPullProgress(null);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const completeLines = raw.split("\n").slice(0, -1);
        for (const line of completeLines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed.completed && parsed.total) {
              setPullProgress(
                Math.round((Number(parsed.completed) / Number(parsed.total)) * 100),
              );
            }
            if (typeof parsed.status === "string") {
              setPullLog(parsed.status);
            }
          } catch {
            setPullLog(trimmed.slice(-200));
          }
        }
      }

      const { error } = parseOllamaPullNdjson(raw);
      if (error) {
        setPullLog(`${t("settings.ai.pullStreamError")}: ${error}`);
        setPullProgress(null);
        return;
      }

      setPullProgress(100);
      await refetchOllamaModels();
      setPullLog(t("settings.ai.pullDoneSuccess"));
    } catch (error) {
      setPullLog(error instanceof Error ? error.message : "Pull failed");
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
    } finally {
      setDeleteTarget(null);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WandSparkles className="h-4 w-4" />
            Active runtime summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusRow
            label="Current provider"
            value={
              <Badge variant={aiSettings?.provider === "copilot" ? "success" : "outline"}>
                {aiSettings ? providerLabel(aiSettings.provider) : "-"}
              </Badge>
            }
            hint="Resolved after user override + workspace default"
          />
          <StatusRow label="Current model" value={aiSettings?.model || "-"} />
          <StatusRow
            label="Copilot"
            value={
              <Badge variant={copilotStatus?.connected ? "success" : "warning"}>
                {copilotStatus?.connected ? "Connected" : "Unavailable"}
              </Badge>
            }
            hint={copilotModels?.message || "Model list comes from the backend bridge."}
          />
          <StatusRow
            label="Ollama origin"
            value={ollamaModels?.origin || "Host-native default"}
            hint={
              ollamaModels?.reachable === false
                ? ollamaModels.message
                : "Docker backend should point to host.docker.internal:11434."
            }
          />
        </CardContent>
      </Card>

      <ProviderModelSection
        title={t("settings.ai.userOverrides")}
        description="Personal AI preference used when you override the workspace default."
        provider={userProvider}
        onProviderChange={(value) => {
          setUserProvider(value);
          setUserModel(
            value === "ollama"
              ? availableOllamaModels[0]?.name ?? ""
              : availableCopilotModels[0]?.id ?? "",
          );
        }}
        model={userModel}
        onModelChange={setUserModel}
        ollamaModels={ollamaModels}
        copilotModels={copilotModels}
        disabled={saving}
        saveLabel={t("settings.ai.saveUser")}
        onSave={saveUserAi}
      />

      <ProviderModelSection
        title={t("settings.ai.workspaceDefaults")}
        description="Admin default applied when a user does not pin their own provider/model."
        provider={workspaceProvider}
        onProviderChange={(value) => {
          setWorkspaceProvider(value);
          setWorkspaceModel(
            value === "ollama"
              ? availableOllamaModels[0]?.name ?? ""
              : availableCopilotModels[0]?.id ?? "",
          );
        }}
        model={workspaceModel}
        onModelChange={setWorkspaceModel}
        ollamaModels={ollamaModels}
        copilotModels={copilotModels}
        disabled={saving}
        saveLabel={t("settings.ai.saveWorkspace")}
        onSave={saveWorkspaceAi}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            Copilot connection and models
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={copilotStatus?.connected ? "success" : "warning"}>
              {copilotStatus?.connected ? "Connected" : "Not connected"}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void startCopilotDeviceFlow()}
              disabled={copilotBusy}
            >
              {copilotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copilotStatus?.connected ? "Re-authenticate" : t("settings.ai.copilotConnect")}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Copilot model choices should come from the backend bridge, not from a hardcoded frontend list.
          </p>

          {copilotModels?.message ? (
            <SectionMessage tone="warning">{copilotModels.message}</SectionMessage>
          ) : null}
          {copilotError ? <SectionMessage tone="error">{copilotError}</SectionMessage> : null}

          <div className="flex flex-wrap gap-2">
            {availableCopilotModels.length > 0 ? (
              availableCopilotModels.map((model) => (
                <Badge key={model.id} variant="outline">
                  {model.name}
                </Badge>
              ))
            ) : (
              <Badge variant="warning">No Copilot models available</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            Host-native Ollama library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SectionMessage tone={ollamaModels?.reachable === false ? "warning" : "success"}>
            {ollamaModels?.reachable === false
              ? ollamaModels.message || "Ollama is not reachable."
              : `This workspace is configured for host-native Ollama at ${ollamaModels?.origin || "http://host.docker.internal:11434"}.`}
          </SectionMessage>

          <p className="text-sm text-muted-foreground">
            Use the Ollama app running on this computer. Only switch to `http://ollama:11434/v1` if you intentionally restore the optional Compose service.
          </p>

          <div className="space-y-2">
            {availableOllamaModels.length > 0 ? (
              availableOllamaModels.map((model) => (
                <div
                  key={model.name}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{model.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(model.size)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deleteTarget === model.name}
                    onClick={() => void deleteOllamaModel(model.name)}
                  >
                    {deleteTarget === model.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <Badge variant="warning">No Ollama models installed</Badge>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="ollama-pull-model">Model to pull</Label>
              <Select
                value={(PULL_PRESETS as readonly string[]).includes(pullName) ? pullName : PULL_OTHER}
                onValueChange={(value) => {
                  if (value === PULL_OTHER) {
                    setPullName((previous) =>
                      (PULL_PRESETS as readonly string[]).includes(previous) ? "" : previous,
                    );
                    return;
                  }
                  setPullName(value);
                }}
              >
                <SelectTrigger id="ollama-pull-model">
                  <SelectValue placeholder={t("settings.ai.pullPresetLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {PULL_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                  <SelectItem value={PULL_OTHER}>{t("settings.ai.pullOtherModel")}</SelectItem>
                </SelectContent>
              </Select>
              {!(PULL_PRESETS as readonly string[]).includes(pullName) ? (
                <Input
                  value={pullName}
                  onChange={(event) => setPullName(event.target.value)}
                  placeholder={t("settings.ai.pullPlaceholder")}
                />
              ) : null}
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => void runOllamaPull()}
                disabled={pulling || !pullName.trim()}
              >
                {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pulling ? "Pulling..." : t("settings.ai.pullModel")}
              </Button>
            </div>
          </div>

          {pulling && pullProgress !== null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{pullLog || "Downloading..."}</span>
                <span>{pullProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pullProgress}%` }} />
              </div>
            </div>
          ) : null}

          {!pulling && pullLog ? (
            <SectionMessage tone={pullLog === t("settings.ai.pullDoneSuccess") ? "success" : "warning"}>
              {pullLog}
            </SectionMessage>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={copilotOpen} onOpenChange={setCopilotOpen}>
        <DialogContent className="w-[min(100%-2rem,32rem)]">
          <DialogHeader>
            <DialogTitle>{t("settings.ai.enterCode")}</DialogTitle>
            <DialogDescription>
              Finish the GitHub device flow to attach Copilot models to this workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-6 pb-6">
            {userCode ? (
              <div className="rounded-3xl border border-border bg-muted/30 p-6 text-center">
                <p className="text-4xl font-extrabold tracking-[0.35em] text-primary">{userCode}</p>
              </div>
            ) : null}

            {userCode ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => copyToClipboard(userCode)}>
                {copiedCode ? (
                  <>
                    <CheckCheck className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy code
                  </>
                )}
              </Button>
            ) : null}

            {verificationUri ? (
              <a
                href={verificationUri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary underline"
              >
                <ExternalLink className="h-4 w-4" />
                Open GitHub to enter code
              </a>
            ) : null}

            {copilotSuccess ? (
              <SectionMessage tone="success">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Copilot connected successfully.
                </span>
              </SectionMessage>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Waiting for authorization...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
