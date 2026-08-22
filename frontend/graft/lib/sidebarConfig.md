# lib/sidebarConfig.ts

- NavItem · interface · L27-L58 — interface NavItem
- NavGroup · interface · L60-L65 — interface NavGroup
- RoleNavConfig · type · L67-L67 — type RoleNavConfig = NavGroup[];
- getNavConfig · function · L338-L340 — function getNavConfig(role: string): RoleNavConfig
- filterNavItemsByCapability · function · L345-L357 — function filterNavItemsByCapability( config: RoleNavConfig, hasCapabilityFn: (capability: Capability) => boolean, ): RoleNavConfig
- partitionNavByGroup · function · L364-L379 — function partitionNavByGroup(config: RoleNavConfig): { primary: RoleNavConfig; more: NavItem[]; }
