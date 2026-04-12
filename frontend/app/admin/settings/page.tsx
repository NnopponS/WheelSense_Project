"use client";

import { Suspense } from "react";
import AdminSettingsClient from "./SettingsClient";

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl animate-fade-in px-4 py-8 text-sm text-muted-foreground">
          Loading settings…
        </div>
      }
    >
      <AdminSettingsClient />
    </Suspense>
  );
}
