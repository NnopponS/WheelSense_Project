# components/RoleSwitcher.tsx

- RoleId · type · L19-L19 — type RoleId = (typeof ROLES)[number]["id"];
- RoleFilter · type · L20-L20 — type RoleFilter = "all" | RoleId;
- roleLabelKeyForUserRole · function · L22-L25 — function roleLabelKeyForUserRole(role: string): (typeof ROLES)[number]["labelKey"] | null
- RoleSwitcher · function · L27-L223 — function RoleSwitcher()
- handleClickOutside · function · L47-L51 — function handleClickOutside(event: MouseEvent)
- actAs · function · L90-L110 — async function actAs(target: UserSearchResult)
