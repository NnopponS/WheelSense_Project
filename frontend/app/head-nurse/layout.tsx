"use client";

import RoleShell from "@/components/RoleShell";

export default function HeadNurseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/head-nurse">{children}</RoleShell>;
}
