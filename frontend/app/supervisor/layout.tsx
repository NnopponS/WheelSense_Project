"use client";

import RoleShell from "@/components/RoleShell";

export default function SupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/supervisor">{children}</RoleShell>;
}
