"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Loader2,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
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

type AIProvider = "copilot" | "openai" | "openrouter";

type AISettingsOut = {
  provider: AIProvider;
  model: string;
  workspace_default_provider: AIProvider;
  workspace_default_model: string;
  openai_configured: boolean;
  openrouter_configured: boolean;
};

type CopilotModel = {
  id: string;
  name: string;
  supports_reasoning_effort?: boolean;
  supports_vision?: boolean;
};

type CopilotModelsResponse = {
  models: CopilotModel[];
  connected: boolean;
  message?: string | null;
  source?: "sdk" | "fallback";
};

type CopilotDeviceFlow = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_at: number;
  interval: number;
};

type CopilotFlowStatus =
  | "idle"
  | "pending"
  | "slow_down"
  | "expired"
  | "denied"
  | "backend_error"
  | "success"
  | "connected_unavailable";

const COPILOT_FLOW_KEY = "copilot_device_flow";
const COPILOT_CLOSE_DELAY_MS = 2500;

function readStoredCopilotFlow(): CopilotDeviceFlow | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(COPILOT_FLOW_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CopilotDeviceFlow>;
    if (
      typeof parsed.device_code === "string" &&
      typeof parsed.user_code === "string" &&
      typeof parsed.verification_uri === "string" &&
      typeof parsed.expires_at === "number" &&
      typeof parsed.interval === "number"
    ) {
      return parsed as CopilotDeviceFlow;
    }
  } catch {
    // ignore stale storage
  }
  return null;
}

function writeStoredCopilotFlow(flow: CopilotDeviceFlow | null): void {
  if (typeof window === "undefined") return;
  if (!flow) {
    sessionStorage.removeItem(COPILOT_FLOW_KEY);
    return;
  }
  sessionStorage.setItem(COPILOT_FLOW_KEY, JSON.stringify(flow));
}

function classifyCopilotError(error: unknown): CopilotFlowStatus {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("expired") || lower.includes("device code expired")) return "expired";
  if (lower.includes("access_denied") || lower.includes("denied")) return "denied";
  return "backend_error";
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
    <div className="min-w-0 rounded-2xl border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 min-w-0 break-all text-sm font-medium text-foreground">{value}</div>
      {hint ? (
        <div className="mt-1 min-w-0 break-words text-xs text-muted-foreground">{hint}</div>
      ) : null}
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
  copilotModels,
  disabled,
  saveLabel,
  onSave,
  apiKey,
  onApiKeyChange,
  keyConfigured,
}: {
  title: string;
  description: string;
  provider: AIProvider;
  onProviderChange: (value: AIProvider) => void;
  model: string;
  onModelChange: (value: string) => void;
  copilotModels: CopilotModelsResponse | null;
  disabled: boolean;
  saveLabel: string;
  onSave: () => Promise<void>;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  keyConfigured: boolean;
}) {
  const { t } = useTranslation();
  const cloudProvider = provider === "openai" || provider === "openrouter";
  const copilotChoices = copilotModels?.models ?? [];
  const options = copilotChoices.map((entry) => ({ value: entry.id, label: `${entry.name} (${entry.id})` }));
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
            <Label htmlFor="ai-provider">{t("settings.ai.providerField")}</Label>
            <Select value={provider} onValueChange={(value) => onProviderChange(value as AIProvider)} disabled={disabled}>
              <SelectTrigger id="ai-provider">
                <SelectValue placeholder={t("settings.ai.chooseProviderPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="copilot">{t("settings.ai.providerCopilot")}</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model">{t("settings.ai.modelField")}</Label>
            {cloudProvider ? (
              <Input id="ai-model" value={model} onChange={(event) => onModelChange(event.target.value)}
                placeholder={provider === "openai" ? "gpt-4.1" : "openai/gpt-4.1"}
                maxLength={128} disabled={disabled} autoComplete="off" />
            ) : <Select
              value={currentValueInList ? model : "__empty__"}
              onValueChange={(value) => onModelChange(value === "__empty__" ? "" : value)}
              disabled={disabled || options.length === 0}
            >
              <SelectTrigger id="ai-model">
                <SelectValue
                  placeholder={t("settings.ai.noCopilotModelsAvailable")}
                />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    {t("settings.ai.noCopilotModelsAvailable")}
                  </SelectItem>
                ) : (
                  options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>}
          </div>
        </div>

        {cloudProvider ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-api-key">{t("settings.ai.apiKey")}</Label>
            <Input id="ai-api-key" type="password" value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={keyConfigured ? t("settings.ai.savedKeyPlaceholder") : t("settings.ai.enterApiKey")}
              autoComplete="new-password" spellCheck={false} maxLength={4096} disabled={disabled}
              aria-describedby="ai-key-hint" />
            <p id="ai-key-hint" className="text-sm text-muted-foreground">
              {keyConfigured ? t("settings.ai.keySaved") : t("settings.ai.keyRequired")}
            </p>
          </div>
        ) : null}

        {provider === "copilot" && copilotModels?.message ? (
          <SectionMessage tone="warning">{copilotModels.message}</SectionMessage>
        ) : null}
        {provider === "copilot" && copilotModels?.source ? (
          <Badge variant={copilotModels.source === "sdk" ? "success" : "warning"}>
            {copilotModels.source === "sdk"
              ? t("settings.ai.copilotSourceSdk")
              : t("settings.ai.copilotSourceFallback")}
          </Badge>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" onClick={() => void onSave()} disabled={disabled || !model.trim() || (cloudProvider && !keyConfigured && !apiKey.trim())}>
            {saveLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiSettingsPanel() {
  const { t } = useTranslation();

  const { data: aiSettings, refetch: refetchAiBase } = useQuery({
    queryKey: ["admin", "settings", "ai", "settings"],
    queryFn: () => api.get<AISettingsOut>("/settings/ai"),
    retry: false,
    staleTime: 60_000,
    refetchInterval: false,
  });
  const { data: copilotStatus, refetch: refetchCopilotStatusBase } = useQuery({
    queryKey: ["admin", "settings", "ai", "copilot-status"],
    queryFn: () => api.get<{ connected: boolean }>("/settings/ai/copilot/status"),
    retry: false,
    staleTime: 30_000,
    refetchInterval: false,
  });
  const { data: copilotModels, refetch: refetchCopilotModelsBase } = useQuery({
    queryKey: ["admin", "settings", "ai", "copilot-models"],
    queryFn: () => api.get<CopilotModelsResponse>("/settings/ai/copilot/models"),
    retry: false,
    staleTime: 30_000,
    refetchInterval: false,
  });

  const refetchAi = useCallback(() => refetchOrThrow(refetchAiBase), [refetchAiBase]);
  const refetchCopilotStatus = useCallback(() => refetchOrThrow(refetchCopilotStatusBase), [refetchCopilotStatusBase]);
  const refetchCopilotModels = useCallback(() => refetchOrThrow(refetchCopilotModelsBase), [refetchCopilotModelsBase]);

  const [workspaceProvider, setWorkspaceProvider] = useState<AIProvider>("copilot");
  const [workspaceModel, setWorkspaceModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotFlow, setCopilotFlow] = useState<CopilotDeviceFlow | null>(() => readStoredCopilotFlow());
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotFlowStatus, setCopilotFlowStatus] = useState<CopilotFlowStatus>(
    () => (readStoredCopilotFlow() ? "pending" : "idle"),
  );
  const [copilotFlowMessage, setCopilotFlowMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const flowRef = useRef<CopilotDeviceFlow | null>(copilotFlow);
  const copilotPollRef = useRef({
    refetchAi,
    refetchCopilotModels,
    refetchCopilotStatus,
    t,
  });

  const sanitizedCopilotModels =
    copilotStatus?.connected && copilotModels?.message === "GitHub Copilot is not connected for this workspace"
      ? { ...copilotModels, connected: true, message: null }
      : copilotModels;
  const availableCopilotModels = sanitizedCopilotModels?.models ?? [];
  const activeProvider = aiSettings?.provider ?? "copilot";
  const runtimeRowLabel = activeProvider === "copilot" ? t("settings.ai.copilotRowLabel") : activeProvider.toUpperCase();
  const runtimeProviderState = useMemo(() => {
    if (activeProvider === "openai" || activeProvider === "openrouter") {
      const configured = Boolean(aiSettings?.[`${activeProvider}_configured`]);
      return {
        badge: configured ? "success" as const : "warning" as const,
        text: configured ? t("settings.ai.keySaved") : t("settings.ai.runtimeUnavailable"),
        hint: t("settings.ai.cloudProviderHint"),
      };
    }
    const connected = Boolean(copilotStatus?.connected);
    if (!connected) {
      return {
        badge: "warning" as const,
        text: t("settings.ai.runtimeUnavailable"),
        hint: sanitizedCopilotModels?.message || t("settings.ai.copilotDisconnected"),
      };
    }
    if (availableCopilotModels.length === 0) {
      return {
        badge: "warning" as const,
        text: t("settings.ai.runtimeUnavailable"),
        hint: t("settings.ai.noCopilotModelsAvailable"),
      };
    }
    return {
      badge: "success" as const,
      text: t("settings.ai.runtimeConnected"),
      hint: t("settings.ai.copilotModelsBridgeHint"),
    };
  }, [
    activeProvider,
    aiSettings,
    availableCopilotModels.length,
    copilotStatus?.connected,
    sanitizedCopilotModels?.message,
    t,
  ]);

  useEffect(() => {
    if (!aiSettings) return;
    setWorkspaceProvider(aiSettings.workspace_default_provider);
    setWorkspaceModel(aiSettings.workspace_default_model);
  }, [aiSettings]);

  useEffect(() => {
    copilotPollRef.current = {
      refetchAi,
      refetchCopilotModels,
      refetchCopilotStatus,
      t,
    };
  });

  useEffect(() => {
    flowRef.current = copilotFlow;
    writeStoredCopilotFlow(copilotFlow);
    if (copilotFlow) {
      setCopilotOpen(true);
    }
  }, [copilotFlow]);

  useEffect(() => {
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (!flowRef.current) return;

    let cancelled = false;

    const finish = (status: CopilotFlowStatus, message?: string | null) => {
      if (cancelled) return;
      setCopilotFlowStatus(status);
      setCopilotFlowMessage(message ?? null);
      if (status === "success" || status === "connected_unavailable") {
        if (closeTimeoutRef.current) {
          window.clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
          setCopilotOpen(false);
          setCopilotFlow(null);
        }, COPILOT_CLOSE_DELAY_MS);
      }
    };

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      pollTimeoutRef.current = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      const current = flowRef.current;
      if (!current || cancelled) return;
      if (Date.now() >= current.expires_at) {
        finish("expired", copilotPollRef.current.t("settings.ai.copilotExpired"));
        return;
      }

      try {
        const response = await api.post<{ status: string; access_token?: string | null }>(
          "/settings/ai/copilot/poll-token",
          { device_code: current.device_code },
        );
        if (cancelled) return;
        if (response.status === "success") {
          const { refetchAi, refetchCopilotModels, refetchCopilotStatus, t } = copilotPollRef.current;
          void refetchCopilotModels();
          void refetchCopilotStatus();
          void refetchAi();
          finish("success", t("settings.ai.copilotSuccess"));
          return;
        }
        if (response.status === "slow_down") {
          const nextInterval = Math.min(current.interval + 5000, 30_000);
          setCopilotFlow({ ...current, interval: nextInterval });
          finish("slow_down", copilotPollRef.current.t("settings.ai.copilotSlowDown"));
          scheduleNext(nextInterval);
          return;
        }
        setCopilotFlowStatus("pending");
        setCopilotFlowMessage(copilotPollRef.current.t("settings.ai.copilotPending"));
        scheduleNext(current.interval);
      } catch (error) {
        const status = classifyCopilotError(error);
        const { t } = copilotPollRef.current;
        if (status === "backend_error") {
          finish(status, error instanceof ApiError ? error.message : t("settings.ai.copilotBackendError"));
        } else if (status === "expired") {
          finish(status, t("settings.ai.copilotExpired"));
        } else {
          finish(status, t("settings.ai.copilotDenied"));
        }
      }
    };

    setCopilotFlowStatus("pending");
    setCopilotFlowMessage(copilotPollRef.current.t("settings.ai.copilotPending"));
    void poll();

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [copilotFlow?.device_code]);

  useEffect(
    () => () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  function handleCopilotOpenChange(open: boolean) {
    setCopilotOpen(open);
    if (open) return;
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setCopilotFlow(null);
    setCopilotFlowStatus("idle");
    setCopilotFlowMessage(null);
    setCopiedCode(false);
  }

  async function saveWorkspaceAi() {
    setSaving(true);
    try {
      await api.put("/settings/ai/global", {
        default_provider: workspaceProvider,
        default_model: workspaceModel.trim(),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setApiKey("");
      await refetchAi();
      toast.success(t("settings.ai.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function startCopilotDeviceFlow() {
    setCopilotBusy(true);
    setCopilotFlowStatus("pending");
    setCopilotFlowMessage(null);
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setCopilotFlow(null);

    try {
      const response = await api.post<{
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      }>("/settings/ai/copilot/device-code", {});
      const flow: CopilotDeviceFlow = {
        device_code: response.device_code,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        expires_at: Date.now() + response.expires_in * 1000,
        interval: response.interval * 1000,
      };
      setCopilotFlow(flow);
      setCopilotOpen(true);
    } catch (error) {
      setCopilotFlowStatus("backend_error");
      setCopilotFlowMessage(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("settings.ai.copilotBackendError"),
      );
      setCopilotOpen(true);
    } finally {
      setCopilotBusy(false);
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
            {t("settings.ai.runtimeSummaryTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <StatusRow
            label={t("settings.ai.currentProvider")}
            value={
              <Badge variant={aiSettings?.provider === "copilot" ? "success" : "outline"}>
                {aiSettings
                  ? aiSettings.provider === "copilot"
                    ? t("settings.ai.providerCopilot")
                    : aiSettings.provider === "openai" ? "OpenAI" : "OpenRouter"
                  : "-"}
              </Badge>
            }
            hint={t("settings.ai.currentProviderHint")}
          />
          <StatusRow label={t("settings.ai.currentModel")} value={aiSettings?.model || "-"} />
          <StatusRow
            label={runtimeRowLabel}
            value={
              <Badge variant={runtimeProviderState.badge}>
                {runtimeProviderState.text}
              </Badge>
            }
            hint={runtimeProviderState.hint}
          />
        </CardContent>
      </Card>

      <ProviderModelSection
        title={t("settings.ai.workspaceDefaults")}
        description={t("settings.ai.workspaceProviderDescription")}
        provider={workspaceProvider}
        onProviderChange={(value) => {
          setWorkspaceProvider(value);
          setApiKey("");
          setWorkspaceModel(
            value === "copilot"
              ? availableCopilotModels[0]?.id ?? ""
              : "",
          );
        }}
        model={workspaceModel}
        onModelChange={setWorkspaceModel}
        copilotModels={sanitizedCopilotModels ?? null}
        disabled={saving}
        saveLabel={t("settings.ai.saveWorkspace")}
        onSave={saveWorkspaceAi}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        keyConfigured={Boolean(workspaceProvider === "openai" ? aiSettings?.openai_configured
          : workspaceProvider === "openrouter" ? aiSettings?.openrouter_configured : false)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            {t("settings.ai.copilotSectionTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={copilotStatus?.connected ? "success" : "warning"}>
              {copilotStatus?.connected
                ? t("settings.ai.copilotConnected")
                : t("settings.ai.copilotDisconnected")}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void startCopilotDeviceFlow()}
              disabled={copilotBusy}
            >
              {copilotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copilotStatus?.connected
                ? t("settings.ai.copilotReconnect")
                : t("settings.ai.copilotConnect")}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t("settings.ai.copilotModelsHint")}
          </p>

          {sanitizedCopilotModels?.message ? (
            <SectionMessage tone="warning">{sanitizedCopilotModels.message}</SectionMessage>
          ) : null}
          {copilotFlowStatus !== "idle" && copilotFlowMessage ? (
            <SectionMessage
              tone={
                copilotFlowStatus === "success" || copilotFlowStatus === "connected_unavailable"
                  ? "success"
                  : copilotFlowStatus === "backend_error" || copilotFlowStatus === "denied" || copilotFlowStatus === "expired"
                    ? "error"
                    : "warning"
              }
            >
              {copilotFlowMessage}
            </SectionMessage>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {sanitizedCopilotModels?.source ? (
              <Badge variant={sanitizedCopilotModels.source === "sdk" ? "success" : "warning"}>
                {sanitizedCopilotModels.source === "sdk"
                  ? t("settings.ai.copilotSourceSdk")
                  : t("settings.ai.copilotSourceFallback")}
              </Badge>
            ) : null}
            {availableCopilotModels.length > 0 ? (
              availableCopilotModels.map((model) => (
                <Badge key={model.id} variant="outline">
                  {model.name}
                </Badge>
              ))
            ) : (
              <Badge variant="warning">{t("settings.ai.noCopilotModelsAvailable")}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={copilotOpen} onOpenChange={handleCopilotOpenChange}>
        <DialogContent className="w-[min(100%-2rem,32rem)]">
          <DialogHeader>
            <DialogTitle>{t("settings.ai.enterCode")}</DialogTitle>
            <DialogDescription>
              {t("settings.ai.copilotDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-6 pb-6">
            {!copilotFlow && copilotFlowStatus !== "idle" && copilotFlowMessage ? (
              <SectionMessage
                tone={
                  copilotFlowStatus === "success" || copilotFlowStatus === "connected_unavailable"
                    ? "success"
                    : copilotFlowStatus === "backend_error" ||
                        copilotFlowStatus === "denied" ||
                        copilotFlowStatus === "expired"
                      ? "error"
                      : "warning"
                }
              >
                {copilotFlowMessage}
              </SectionMessage>
            ) : null}

            {copilotFlow ? (
              <div className="rounded-3xl border border-border bg-muted/30 p-6 text-center">
                <p className="text-4xl font-extrabold tracking-[0.35em] text-primary">
                  {copilotFlow.user_code}
                </p>
              </div>
            ) : null}

            {copilotFlow ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => copyToClipboard(copilotFlow.user_code)}
              >
                {copiedCode ? (
                  <>
                    <CheckCheck className="h-4 w-4" />
                    {t("settings.ai.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    {t("settings.ai.copyCode")}
                  </>
                )}
              </Button>
            ) : null}

            {copilotFlow ? (
              <a
                href={copilotFlow.verification_uri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary underline"
              >
                <ExternalLink className="h-4 w-4" />
                {t("settings.ai.openGitHub")}
              </a>
            ) : null}

            {copilotFlow ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatusRow
                  label={t("settings.ai.expiresAt")}
                  value={new Date(copilotFlow.expires_at).toLocaleTimeString()}
                  hint={t("settings.ai.expiresAtHint")}
                />
                <StatusRow
                  label={t("settings.ai.intervalSeconds")}
                  value={Math.max(1, Math.round(copilotFlow.interval / 1000))}
                  hint={t("settings.ai.intervalHint")}
                />
                <StatusRow
                  label={t("settings.ai.deviceCode")}
                  value={copilotFlowStatus}
                  hint={t("settings.ai.deviceCodeHint")}
                />
              </div>
            ) : null}

            {copilotFlowStatus === "success" ? (
              <SectionMessage tone="success">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {t("settings.ai.copilotSuccess")}
                </span>
              </SectionMessage>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
