"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Eye, EyeOff, Activity, ArrowRight } from "lucide-react";
import { getRoleHome } from "@/lib/routes";

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
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      const next =
        typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("next");
      router.replace(getSafePostLoginPath(next, user.role));
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password.trim()) {
      setError(t("auth.required"));
      return;
    }
    setSubmitting(true);
    try {
      await login(username, password);
      // Wait for useAuth's fetchMe to populate `user` which will trigger the `if (user)` block.
      // But just in case, we don't immediately push here without knowing the role.
      // The `if (user)` effect at the top level handles it perfectly on next render.
    } catch {
      setError(t("auth.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Left — Hero panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-cta relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border border-white/20" />
          <div className="absolute bottom-32 right-16 w-96 h-96 rounded-full border border-white/15" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border border-white/10" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg">WheelSense</span>
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight">
              Smart Wheelchair
              <br />
              Care Platform
            </h2>
            <p className="text-white/80 text-base max-w-md leading-relaxed">
              Real-time health monitoring, fall detection, and location tracking
              for wheelchair patients. Designed for caregivers and healthcare
              professionals.
            </p>
          </div>

          <div className="flex gap-8 text-sm text-white/60">
            <div>
              <p className="text-2xl font-bold text-white">24/7</p>
              <p>Monitoring</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{"<"}3s</p>
              <p>Alert Response</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">99.9%</p>
              <p>Uptime</p>
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
            <div className="w-10 h-10 gradient-cta rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-on-surface">WheelSense</span>
          </div>

          <h1 className="text-2xl font-bold text-on-surface mb-1">
            {t("auth.signIn")}
          </h1>
          <p className="text-sm text-on-surface-variant mb-8">
            {t("auth.signInDesc")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="severity-critical px-4 py-3 rounded-lg text-sm font-medium animate-fade-in">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="login-user"
                className="text-sm font-medium text-on-surface"
              >
                {t("auth.username")}
              </label>
              <input
                id="login-user"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-pass"
                className="text-sm font-medium text-on-surface"
              >
                {t("auth.password")}
              </label>
              <div className="relative">
                <input
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full gradient-cta py-3 rounded-xl text-sm font-semibold
                         flex items-center justify-center gap-2
                         hover:opacity-90 disabled:opacity-50
                         transition-smooth cursor-pointer"
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
            WheelSense Smart Care Platform v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
