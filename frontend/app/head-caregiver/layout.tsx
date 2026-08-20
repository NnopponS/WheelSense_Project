"use client";

import RoleShell from "@/components/RoleShell";

export default function HeadCaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/head-caregiver">{children}</RoleShell>;
}
