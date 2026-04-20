# Accessibility Refactor for Older Caregivers

**Date:** 2026-04-20  
**Scope:** Frontend UI text sizes, button heights, icon sizes for improved readability and accessibility

---

## Overview

Systematic refactor of the WheelSense frontend to meet WCAG AA accessibility standards for older caregivers, focusing on minimum text sizes (14px), touch target heights (44px), and icon sizes (24px).

## Standards Applied

| Element | Minimum Size | Tailwind Class |
|---------|--------------|----------------|
| Body text | 16px | `text-base` |
| UI text | 14px | `text-sm` |
| Button height | 44px | `h-11` |
| Input height | 48px | `h-12` |
| Action icons | 24px | `h-5 w-5` |
| Card titles | 18px | `text-lg` |

## Files Modified

### Core Components

| File | Changes |
|------|---------|
| `frontend/components/LanguageSwitcher.tsx` | Added inline style `fontSize: '14px'` to "EN/TH" text span |
| `frontend/components/TopBar.tsx` | Changed role label from `text-xs` to `text-sm` |
| `frontend/components/RoleSwitcher.tsx` | Updated `text-xs` → `text-sm`, `text-[10px]` → `text-sm`, icons `h-4 w-4` → `h-5 w-5` |
| `frontend/components/shared/UserAvatar.tsx` | Ensured minimum 14px font size via `Math.max(14, sizePx / 2.5)` |

### Notification Components

| File | Changes |
|------|---------|
| `frontend/components/notifications/AlertToastCard.tsx` | Buttons: `h-8` → `h-11`, `text-xs` → `text-sm` |
| `frontend/components/NotificationDrawer.tsx` | Buttons: `h-8` → `h-11`, icons `h-3.5 w-3.5` → `h-5 w-5` |

### Task Components

| File | Changes |
|------|---------|
| `frontend/components/tasks/CreateTaskDialog.tsx` | SelectTrigger: `h-8` → `h-11`, `text-xs` → `text-sm` |
| `frontend/components/tasks/RichReportEditor.tsx` | Toolbar buttons: `h-8 w-8` → `h-11 w-11`, icons `h-4 w-4` → `h-5 w-5` |
| `frontend/components/tasks/TaskReportAttachmentsBar.tsx` | Button: `h-8` → `h-11`, icons `h-3.5 w-3.5` → `h-5 w-5` |

### Workflow Components

| File | Changes |
|------|---------|
| `frontend/components/workflow/WorkflowJobCreateDialog.tsx` | Preset buttons: `h-8` → `h-11`, `text-xs` → `text-sm` |

## Key Patterns

### Text Size
```tsx
// Before
<span className="text-xs">Label</span>

// After
<span className="text-sm">Label</span>
```

### Button Height
```tsx
// Before
<Button className="h-8 text-xs">Action</Button>

// After
<Button className="h-11 text-sm">Action</Button>
```

### Icon Size
```tsx
// Before
<Icon className="h-4 w-4" />

// After
<Icon className="h-5 w-5" />
```

## Verification

### Build Status
```bash
cd frontend
npm run build
# Status: Successful (no TypeScript or build errors)
```

### Test Status
Playwright accessibility tests have configuration issues with `@playwright/test` version conflicts that need to be resolved separately.

## i18n Impact

All text changes use existing translation keys. No new i18n keys were added. Text size changes are purely CSS/Tailwind class updates that maintain the same content.

## Accessibility Benefits

1. **Older Caregivers**: Larger text (minimum 14px) improves readability for users with presbyopia
2. **Touch Targets**: 44px minimum button height meets WCAG 2.5.5 Target Size (AAA)
3. **Motor Control**: Larger touch targets reduce mis-taps for users with tremors or limited dexterity
4. **Visual Hierarchy**: Consistent sizing creates clearer information hierarchy

## Rollback Notes

All changes are CSS class modifications. To rollback, revert to previous Tailwind classes:
- `text-sm` → `text-xs`
- `h-11` → `h-8`
- `h-5 w-5` → `h-4 w-4`

## Related Documentation

- `docs/adr/0006-accessibility-standards.md` (if exists)
- `e2e/accessibility.spec.ts` - Playwright test definitions
- `frontend/app/globals.css` - Base font size definitions
