"use client";

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

export type MessagingRecipientRow = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  /** From API: patient-linked accounts may still carry a non-patient `role` in edge cases. */
  kind?: "staff" | "patient" | "unlinked";
  employee_code?: string | null;
  linked_name?: string | null;
};

/** Aligns with workspace user search: patient inbox uses `kind`, staff rows use `role`. */
export function matchesRecipientRoleFilter(
  r: MessagingRecipientRow,
  filterRole: string,
): boolean {
  if (filterRole === "patient") {
    return r.kind === "patient" || r.role === "patient";
  }
  if (r.kind === "patient") {
    return false;
  }
  return r.role === filterRole;
}

export function matchesRecipientSearch(r: MessagingRecipientRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (/^\d+$/.test(q.trim()) && Number(q.trim()) === r.id) return true;
  const hay = [
    r.display_name,
    r.username,
    r.role,
    r.employee_code ?? "",
    r.linked_name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

type Props = {
  idPrefix: string;
  value: string;
  onChange: (userId: string) => void;
  allRecipients: MessagingRecipientRow[];
  candidates: MessagingRecipientRow[];
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  disabled?: boolean;
  label: string;
  searchPlaceholderKey: TranslationKey;
  hintWhenHasMatchesKey: TranslationKey;
  emptyRoleKey: TranslationKey;
  noMatchKey: TranslationKey;
  t: (key: TranslationKey) => string;
};

export function MessagingRecipientPicker({
  idPrefix,
  value,
  onChange,
  allRecipients,
  candidates,
  search,
  onSearchChange,
  loading,
  disabled,
  label,
  searchPlaceholderKey,
  hintWhenHasMatchesKey,
  emptyRoleKey,
  noMatchKey,
  t,
}: Props) {
  const selected = value ? allRecipients.find((r) => String(r.id) === value) : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-recipient-search`}>{label}</Label>
      {selected ? (
        <p className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">{selected.display_name}</span>
          <span className="text-muted-foreground"> (@{selected.username})</span>
        </p>
      ) : null}
      <Input
        id={`${idPrefix}-recipient-search`}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t(searchPlaceholderKey)}
        className="h-9"
        disabled={disabled || loading}
        autoComplete="off"
        aria-label={t(searchPlaceholderKey)}
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : allRecipients.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t(emptyRoleKey)}</p>
      ) : candidates.length === 0 && search.trim() ? (
        <p className="text-xs text-muted-foreground">{t(noMatchKey)}</p>
      ) : candidates.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t(hintWhenHasMatchesKey)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t(emptyRoleKey)}</p>
      )}
      {!loading && candidates.length > 0 ? (
        <div
          role="listbox"
          aria-label={label}
          className="max-h-[min(280px,45vh)] overflow-y-auto rounded-lg border border-border/80 bg-background"
        >
          {candidates.map((r) => {
            const isSel = value === String(r.id);
            return (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={isSel}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60",
                  isSel && "bg-primary/10",
                )}
                onClick={() => onChange(String(r.id))}
              >
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {isSel ? <Check className="h-4 w-4 text-primary" /> : <span className="inline-block h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{r.display_name}</span>
                  <span className="text-muted-foreground"> (@{r.username})</span>
                  {r.linked_name && r.linked_name !== r.display_name ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{r.linked_name}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
