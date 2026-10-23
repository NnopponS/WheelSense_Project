export type PatientListFilter = "all" | "critical" | "unassigned" | "recent";

const DEFAULT_FILTER: PatientListFilter = "all";
const SCROLL_STORAGE_PREFIX = "wheelsense:patient-list-scroll:";

export function parsePatientListFilter(value: string | null | undefined): PatientListFilter {
  return value === "critical" || value === "unassigned" || value === "recent"
    ? value
    : DEFAULT_FILTER;
}

export function buildPatientListHref(
  pathname: string,
  currentParams: URLSearchParams | Readonly<URLSearchParams>,
  search: string,
  filter: PatientListFilter,
): string {
  const params = new URLSearchParams(currentParams.toString());
  const normalizedSearch = search.trim();

  if (normalizedSearch) params.set("q", normalizedSearch);
  else params.delete("q");

  if (filter === DEFAULT_FILTER) params.delete("view");
  else params.set("view", filter);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function withPatientListReturnTo(detailHref: string, patientListHref: string): string {
  const hashIndex = detailHref.indexOf("#");
  const hash = hashIndex >= 0 ? detailHref.slice(hashIndex) : "";
  const hrefWithoutHash = hashIndex >= 0 ? detailHref.slice(0, hashIndex) : detailHref;
  const queryIndex = hrefWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;
  const params = new URLSearchParams(queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "");
  params.set("returnTo", patientListHref);

  return `${pathname}?${params.toString()}${hash}`;
}

export function getSafePatientListReturnTo(
  requestedHref: string | null | undefined,
  fallbackHref: string,
  additionalAllowedHrefs: string[] = [],
): string {
  if (!requestedHref) return fallbackHref;

  try {
    const base = "https://wheelsense.local";
    const requested = new URL(requestedHref, base);
    const fallback = new URL(fallbackHref, base);
    const allowedPathnames = new Set([
      fallback.pathname,
      ...additionalAllowedHrefs.map((href) => new URL(href, base).pathname),
    ]);

    if (requested.origin !== base || !allowedPathnames.has(requested.pathname)) {
      return fallbackHref;
    }

    return `${requested.pathname}${requested.search}${requested.hash}`;
  } catch {
    return fallbackHref;
  }
}

export function rememberPatientListScroll(patientListHref: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${SCROLL_STORAGE_PREFIX}${patientListHref}`, String(window.scrollY));
}

export function restorePatientListScroll(patientListHref: string): void {
  if (typeof window === "undefined") return;

  const key = `${SCROLL_STORAGE_PREFIX}${patientListHref}`;
  const savedPosition = window.sessionStorage.getItem(key);
  if (savedPosition === null) return;

  window.sessionStorage.removeItem(key);
  const top = Number(savedPosition);
  if (!Number.isFinite(top) || top < 0) return;

  window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
}
