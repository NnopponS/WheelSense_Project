"use client";

import RoleShell from "@/components/RoleShell";

export default function ObserverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/caregiver">{children}</RoleShell>;
}
