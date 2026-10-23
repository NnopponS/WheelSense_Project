"use client";

import RoleShell from "@/components/RoleShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell appRoot="/admin">{children}</RoleShell>;
}
