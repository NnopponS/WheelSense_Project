"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

export type SearchableListboxOption = {
  id: string;
  title: string;
  subtitle?: string;
};

export interface SearchableListboxPickerProps {
  options: SearchableListboxOption[];
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  selectedOptionId: string | null;
  onSelectOption: (id: string) => void;
  disabled?: boolean;
  listboxAriaLabel: string;
  noMatchMessage: string;
  emptyStateMessage?: string | null;
  inputId: string;
  listboxId: string;
  /**
   * When true and `options` is empty, the listbox can still open to show `noMatchMessage`
   * (parent: active search yielded no results).
   */
  emptyNoMatch?: boolean;
  /** Renders the list in a fixed portal (use inside scrollable modals / overflow-hidden parents). */
  listPresentation?: "inline" | "portal";
  /** z-index for portal listbox (inline mode ignores this). */
  listboxZIndex?: number;
  /**
   * Controlled list visibility. When set, parent owns `listOpen` and must update via
   * `onListOpenChange` (e.g. modal Escape layering, opening from external tabs).
   */
  listOpen?: boolean;
  onListOpenChange?: (open: boolean) => void;
  inputType?: "search" | "text";
  enterKeyHint?: HTMLAttributes<HTMLInputElement>["enterKeyHint"];
  /** Optional `aria-labelledby` for the combobox (separate label element id). */
  ariaLabelledBy?: string;
  spellCheck?: boolean;
  /** Trailing clear control when `search` is non-empty (e.g. admin quick-find). */
  showTrailingClear?: boolean;
  trailingClearAriaLabel?: string;
  /** Fired after clearing the search field (parent can reset selection). */
  onTrailingClear?: () => void;
}

/**
 * Accessible combobox + listbox: search field filters options provided by the parent,
 * keyboard navigation and click-outside match admin patient device linking UX.
 */
export default function SearchableListboxPicker({
  options,
  search,
  onSearchChange,
  searchPlaceholder,
  selectedOptionId,
  onSelectOption,
  disabled = false,
  listboxAriaLabel,
  noMatchMessage,
  emptyStateMessage,
  inputId,
  listboxId,
  emptyNoMatch = false,
  listPresentation = "inline",
  listboxZIndex = 200,
  listOpen: listOpenProp,
  onListOpenChange,
  inputType = "search",
  enterKeyHint: enterKeyHintProp,
  ariaLabelledBy,
  spellCheck = false,
  showTrailingClear = false,
  trailingClearAriaLabel = "Clear",
  onTrailingClear,
}: SearchableListboxPickerProps) {
  const isListOpenControlled = listOpenProp !== undefined;
  const [internalListOpen, setInternalListOpen] = useState(false);
  const listOpen = isListOpenControlled ? listOpenProp! : internalListOpen;

  const setListOpen = useCallback(
    (next: boolean) => {
      if (!isListOpenControlled) {
        setInternalListOpen(next);
      }
      onListOpenChange?.(next);
    },
    [isListOpenControlled, onListOpenChange],
  );

  const [highlightIdx, setHighlightIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalListRef = useRef<HTMLDivElement>(null);
  /** After choosing an option, ignore the next input focus tick so the list stays closed (focus loop with portal options). */
  const suppressNextFocusOpenRef = useRef(false);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const maxIdx = Math.max(0, options.length - 1);
  const highlightIdxClamped = useMemo(
    () => Math.min(Math.max(0, highlightIdx), maxIdx),
    [highlightIdx, maxIdx],
  );

  const canInteract =
    !disabled &&
    (options.length > 0 || (emptyNoMatch && search.trim().length > 0));
  const showDropdown = listOpen && canInteract;

  const updatePlacement = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPlacement({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (listPresentation !== "portal" || !showDropdown) return;
    updatePlacement();
  }, [
    listPresentation,
    showDropdown,
    options.length,
    search,
    updatePlacement,
  ]);

  useEffect(() => {
    if (listPresentation !== "portal" || !showDropdown) return;
    const onResizeOrScroll = () => updatePlacement();
    window.addEventListener("resize", onResizeOrScroll);
    document.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      document.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [listPresentation, showDropdown, updatePlacement]);

  useEffect(() => {
    if (!showDropdown) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listPresentation === "portal" && portalListRef.current?.contains(t)) return;
      setListOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [showDropdown, listPresentation, setListOpen]);

  const enterKeyHint = enterKeyHintProp ?? (inputType === "search" ? "search" : "done");

  const listboxBody = (
    <>
      {options.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-on-surface-variant">
          {noMatchMessage}
        </div>
      ) : (
        options.map((opt, idx) => {
          const selected = selectedOptionId === opt.id;
          const highlighted = idx === highlightIdxClamped;
          const optDomId = `${listboxId}-opt-${idx}`;
          return (
            <button
              key={opt.id}
              id={optDomId}
              type="button"
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                suppressNextFocusOpenRef.current = true;
                onSelectOption(opt.id);
                setListOpen(false);
                requestAnimationFrame(() => {
                  suppressNextFocusOpenRef.current = false;
                });
              }}
              disabled={disabled}
              className={`flex w-full flex-col gap-0.5 border-b border-outline-variant/10 px-3 py-3 sm:py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-surface-container-high disabled:opacity-50 ${
                selected
                  ? "bg-primary/10 ring-1 ring-inset ring-primary/25"
                  : ""
              } ${highlighted && !selected ? "bg-surface-container-high/80" : ""}`}
            >
              <span className="truncate font-medium text-on-surface">{opt.title}</span>
              {opt.subtitle ? (
                <span className="truncate font-mono text-xs text-on-surface-variant">
                  {opt.subtitle}
                </span>
              ) : null}
            </button>
          );
        })
      )}
    </>
  );

  const listboxChrome =
    listPresentation === "portal" &&
    showDropdown &&
    placement &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={portalListRef}
            id={listboxId}
            role="listbox"
            aria-label={listboxAriaLabel}
            className="max-h-52 overflow-y-auto rounded-lg border border-outline-variant/25 bg-surface shadow-lg"
            style={{
              position: "fixed",
              top: placement.top,
              left: placement.left,
              width: placement.width,
              boxSizing: "border-box",
              zIndex: listboxZIndex,
            }}
          >
            {listboxBody}
          </div>,
          document.body,
        )
      : null;

  const activeDescendantId =
    showDropdown && options[highlightIdxClamped]
      ? `${listboxId}-opt-${highlightIdxClamped}`
      : undefined;

  const showClear =
    showTrailingClear && Boolean(search.trim()) && !disabled;

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="relative" ref={anchorRef}>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
          aria-hidden
        />
        <input
          id={inputId}
          type={inputType}
          enterKeyHint={enterKeyHint}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={activeDescendantId}
          className={`input-field input-field--leading-icon w-full py-2.5 text-sm ${showClear ? "pr-10" : ""}`}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setListOpen(true);
            setHighlightIdx(0);
          }}
          onFocus={() => {
            if (suppressNextFocusOpenRef.current) {
              suppressNextFocusOpenRef.current = false;
              return;
            }
            if (canInteract) setListOpen(true);
          }}
          onKeyDown={(e) => {
            if (!canInteract) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setListOpen(true);
              setHighlightIdx((i) =>
                Math.min(i + 1, Math.max(0, options.length - 1)),
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setListOpen(true);
              setHighlightIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              if (showDropdown && options.length > 0) {
                e.preventDefault();
                const opt = options[highlightIdxClamped];
                if (opt) {
                  suppressNextFocusOpenRef.current = true;
                  onSelectOption(opt.id);
                  setListOpen(false);
                  requestAnimationFrame(() => {
                    suppressNextFocusOpenRef.current = false;
                  });
                }
              }
            } else if (e.key === "Escape") {
              if (listOpen) {
                e.preventDefault();
                e.stopPropagation();
                setListOpen(false);
              }
            }
          }}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={spellCheck}
        />
        {showClear ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            aria-label={trailingClearAriaLabel}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSearchChange("");
              setListOpen(false);
              onTrailingClear?.();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {emptyStateMessage != null && options.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{emptyStateMessage}</p>
      ) : null}

      {listPresentation === "inline" && showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={listboxAriaLabel}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-lg border border-outline-variant/25 bg-surface shadow-lg"
        >
          {listboxBody}
        </div>
      ) : null}

      {listPresentation === "portal" ? listboxChrome : null}
    </div>
  );
}
