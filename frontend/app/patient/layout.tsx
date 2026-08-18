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
      mainClassName="mx-auto w-full max-w-6xl [&_*]:focus-visible:outline-none [&_*]:focus-visible:ring-2 [&_*]:focus-visible:ring-ring [&_*]:focus-visible:ring-offset-2"
    >
      <div
        data-patient-shell
        className="space-y-8 md:space-y-10 [&_button]:min-h-12 [&_button]:px-5 [&_button]:text-base [&_button]:rounded-xl"
      >
        {children}
      </div>
    </RoleShell>
  );
}
