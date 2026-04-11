"use client";

import RoleShell from "@/components/RoleShell";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell
      appRoot="/patient"
      mainClassName="md:p-8 lg:p-12 max-w-5xl mx-auto w-full rounded-2xl bg-gradient-to-b from-sky-50/85 via-background to-background dark:from-sky-950/25 dark:via-background ring-1 ring-border/45 shadow-sm [&_*]:focus-visible:outline-none [&_*]:focus-visible:ring-2 [&_*]:focus-visible:ring-ring [&_*]:focus-visible:ring-offset-2"
    >
      <div
        data-patient-shell
        className="space-y-8 md:space-y-10 [&_button]:min-h-11 [&_button]:px-5 [&_button]:text-base [&_button]:rounded-xl"
      >
        {children}
      </div>
    </RoleShell>
  );
}
