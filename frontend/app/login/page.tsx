"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { getRoleHome } from "@/lib/routes";

function AuthLoadingShell({ label }: { label: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-8 w-8 rounded-full border-2 border-solid border-primary border-t-transparent animate-spin" />
      <span className="text-sm text-foreground-variant">{label}</span>
    </div>
  );
}

function getSafePostLoginPath(next: string | null, role: string): string {
  const roleHome = getRoleHome(role);
  if (!next || !next.startsWith("/") || next.startsWith("//")) return roleHome;

  try {
    const parsed = new URL(next, "http://wheelsense.local");
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (role === "admin") return path;
    return path === roleHome || path.startsWith(`${roleHome}/`) ? path : roleHome;
  } catch {
    return roleHome;
  }
}

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const { t, locale } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: boolean; password?: boolean }>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      const next =
        typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("next");
      router.replace(getSafePostLoginPath(next, user.role));
    }
  }, [user, router]);

  useEffect(() => {
    document.title = t("auth.documentTitle");
    return () => {
      document.title = "WheelSense — Smart Wheelchair Care Platform";
    };
  }, [locale, t]);

  if (loading) {
    return <AuthLoadingShell label={t("common.loading")} />;
  }

  if (user) {
    return <AuthLoadingShell label={t("common.loading")} />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const nextFieldErrors = {
      ...(!username.trim() ? { username: true } : {}),
      ...(!password.trim() ? { password: true } : {}),
    };
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      if (nextFieldErrors.username) usernameRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await login(username, password);
      // Wait for useAuth's fetchMe to populate `user` which will trigger the `if (user)` block.
      // But just in case, we don't immediately push here without knowing the role.
      // The `if (user)` effect at the top level handles it perfectly on next render.
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : t("auth.failed");
      setError(message);
      setPassword(""); // Clear password on failed login for security
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Left — Hero panel */}
      <div className="hidden lg:flex lg:w-[44%] bg-primary text-primary-foreground">
        <div className="flex w-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-foreground/20 bg-primary-foreground/10">
              <Logo size={28} className="text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">WheelSense</span>
          </div>

          <div className="space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              {t("auth.heroTitleLine1")}
              <br />
              {t("auth.heroTitleLine2")}
            </h2>
            <p className="max-w-md text-base leading-relaxed text-primary-foreground/80">
              {t("auth.heroDescription")}
            </p>
          </div>

          <div className="flex gap-8 text-sm text-primary-foreground/70">
            <div>
              <p className="text-2xl font-bold text-primary-foreground">24/7</p>
              <p>{t("auth.heroMetricMonitoring")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">{"<"}3s</p>
              <p>{t("auth.heroMetricAlertResponse")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">99.9%</p>
              <p>{t("auth.heroMetricUptime")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Language Switcher */}
          <div className="flex justify-end mb-8">
            <LanguageSwitcher />
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center dark:bg-white">
              <Logo size={28} className="text-white dark:text-black" />
            </div>
            <span className="font-bold text-lg text-foreground">WheelSense</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">
            {t("auth.signIn")}
          </h1>
          <p className="text-sm text-foreground-variant mb-8">
            {t("auth.signInDesc")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {Object.keys(fieldErrors).length > 0 ? (
              <div className="severity-critical rounded-lg px-4 py-3 text-sm font-medium" role="alert">
                {t("auth.validationSummary")}
              </div>
            ) : null}
            {error ? (
              <div className="severity-critical rounded-lg px-4 py-3 text-sm font-medium" role="alert">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="login-user"
                className="text-sm font-medium text-foreground"
              >
                {t("auth.username")}
              </label>
              <input
                ref={usernameRef}
                id="login-user"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) setFieldErrors((current) => ({ ...current, username: undefined }));
                }}
                className="input-field"
                placeholder="admin"
                autoComplete="username"
                aria-invalid={fieldErrors.username ? true : undefined}
                aria-describedby={fieldErrors.username ? "login-user-error" : undefined}
                autoFocus
              />
              {fieldErrors.username ? (
                <p id="login-user-error" className="text-sm text-critical-foreground">
                  {t("auth.usernameRequired")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-pass"
                className="text-sm font-medium text-foreground"
              >
                {t("auth.password")}
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  className="input-field pr-14"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? "login-pass-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-outline hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80"
                  aria-label={t("auth.togglePasswordVisibility")}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password ? (
                <p id="login-pass-error" className="text-sm text-critical-foreground">
                  {t("auth.passwordRequired")}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span>{t("auth.submitting")}</span>
              ) : (
                <>
                  <span>{t("auth.submit")}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-outline">
            {t("auth.platformVersion")}
          </p>
        </div>
      </div>
    </div>
  );
}
