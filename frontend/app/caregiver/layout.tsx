"use client";

import RoleShell from "@/components/RoleShell";

export default function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/caregiver">{children}</RoleShell>;
}
