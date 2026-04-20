# Accessibility Redesign for Older Caregivers

**Date**: 2026-04-20  
**Priority**: High  
**Target Users**: Older caregivers (head nurses, supervisors, observers)  
**Goal**: Improve readability, usability, and accessibility for users with age-related vision and motor control changes

## Problem Statement

The current WheelSense interface uses small text sizes and compact layouts that are difficult for older caregivers to read and interact with. Key issues:

- Extensive use of 12px-14px text throughout the interface
- Small touch targets that are hard to use with reduced motor control
- Insufficient contrast on muted text
- Small icons that are hard to recognize
- Dense information layouts

## Design Principles for Older Users

1. **Larger base font sizes**: Minimum 16px for body text, 18px+ for key content
2. **Larger touch targets**: Minimum 44px height for interactive elements
3. **Higher contrast**: WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
4. **Generous spacing**: Reduce cognitive load and prevent accidental clicks
5. **Clear visual hierarchy**: Use size and weight, not just color
6. **Larger icons**: Minimum 24px for actionable icons
7. **Simplified layouts**: Reduce density, increase white space

## Proposed Changes

### 1. Typography Scale Update

**Current problematic sizes:**
- `text-xs` (12px) → used for table headers, metadata, badges
- `text-sm` (14px) → used for body text, buttons, navigation
- `text-[10px]`, `text-[11px]` → used for sidebar labels

**New recommended scale:**
- Replace `text-xs` (12px) with `text-sm` (14px) minimum
- Replace `text-sm` (14px) with `text-base` (16px) for body text
- Use `text-lg` (18px) for important labels
- Eliminate `text-[10px]` and `text-[11px]` entirely
- Set base HTML font size to 16px explicitly

### 2. Component-Specific Changes

#### Buttons
- `sm`: h-9 → h-11 (44px minimum touch target)
- `default`: h-10 → h-12 (48px)
- `lg`: h-11 → h-14 (56px)
- Button text: `text-sm` → `text-base`

#### Inputs
- Height: h-10 → h-12 (48px)
- Text: `text-sm` → `text-base`
- Padding: px-3 py-2 → px-4 py-3

#### Table
- Header text: `text-xs` → `text-sm` or `text-base`
- Remove `uppercase tracking-wide` from headers (harder to read)
- Cell padding: p-4 → p-5
- Row height: increase for easier scanning

#### Cards
- CardTitle: `text-lg` → `text-xl`
- CardDescription: `text-sm` → `text-base`
- CardContent padding: p-6 pt-0 → p-8 pt-0

#### Sidebar Navigation
- Nav items: `text-sm` → `text-base`
- Padding: `px-3 py-2.5` → `px-4 py-3`
- Category labels: `text-[10px]` → `text-xs` (12px) minimum
- Icons: h-5 w-5 → h-6 w-6

#### Badges
- Badge text: `text-xs` → `text-sm`
- Padding: increase for better readability
- Minimum height: 28px

#### Icons
- Action icons: h-4 w-4 → h-5 w-5 minimum
- Status icons: h-5 w-5 → h-6 w-6
- Hero icons: h-5 w-5 → h-8 w-8

### 3. Color Contrast Improvements

- Review `muted-foreground` color for WCAG AA compliance
- Increase contrast on secondary text
- Ensure all interactive states (hover, focus) have sufficient contrast
- Consider adding a "high contrast" theme option

### 4. Spacing Improvements

- Increase gap between sections: `gap-3` → `gap-4`, `gap-4` → `gap-6`
- Increase padding in dense lists
- Add more vertical space in cards
- Increase margin between related but distinct elements

### 5. Responsive Considerations

- On mobile, ensure touch targets remain 44px minimum
- Consider larger breakpoints for tablet users
- Ensure text reflows properly at larger sizes

## Implementation Plan

### Phase 1: Foundation Changes (High Impact, Low Risk)
1. Update `globals.css` base typography
2. Update core UI components (Button, Input, Card, Badge)
3. Update Table component
4. Test with sample pages

**Files to modify:**
- `frontend/app/globals.css`
- `frontend/components/ui/button.tsx`
- `frontend/components/ui/input.tsx`
- `frontend/components/ui/card.tsx`
- `frontend/components/ui/badge.tsx`
- `frontend/components/ui/table.tsx`

### Phase 2: Layout Components (Medium Impact, Medium Risk)
1. Update RoleSidebar navigation
2. Update dashboard layouts
3. Update shared chrome components
4. Test across all role dashboards

**Files to modify:**
- `frontend/components/RoleSidebar.tsx`
- `frontend/components/RoleShell.tsx`
- `frontend/components/TopBar.tsx`
- Dashboard pages for each role

### Phase 3: Page-Specific Updates (High Impact, High Risk)
1. Update admin pages
2. Update head-nurse pages
3. Update supervisor pages
4. Update observer pages
5. Update patient portal

**Files to modify:**
- All page components in `frontend/app/*/page.tsx`
- Feature-specific components

### Phase 4: Validation & Refinement
1. WCAG accessibility audit
2. User testing with older caregivers
3. Performance testing (larger fonts may affect layout)
4. Responsive testing across devices
5. Dark mode validation

## Testing Strategy

### Automated Testing
- Run existing build to ensure no TypeScript errors
- Visual regression tests for key pages
- Lighthouse accessibility audit

### Manual Testing Checklist
- [ ] All text is readable at 16px base size
- [ ] Touch targets are minimum 44px on mobile
- [ ] Color contrast meets WCAG AA standards
- [ ] No horizontal scrolling at 1024px width
- [ ] All interactive elements have clear focus states
- [ ] Tables are readable with larger fonts
- [ ] Navigation is easily clickable
- [ ] Forms are easy to fill out
- [ ] Alerts and notifications are prominent
- [ ] Emergency buttons (SOS) are very prominent

### User Testing
- Recruit 3-5 older caregivers (50+ years)
- Have them perform common tasks:
  - View patient alerts
  - Complete care tasks
  - Check patient vitals
  - Navigate between sections
  - Use emergency features
- Collect feedback on readability and usability

## Risk Mitigation

### Layout Breakage
- Larger fonts may break layouts
- **Mitigation**: Test incrementally, use responsive containers
- **Fallback**: CSS max-width constraints on text containers

### Information Density
- Larger fonts reduce information density
- **Mitigation**: Reorganize layouts, use progressive disclosure
- **Trade-off**: Accept fewer items per viewport for better readability

### Performance
- Larger fonts may affect render time
- **Mitigation**: Minimal impact expected with system fonts
- **Monitoring**: Check Lighthouse scores after changes

## Success Metrics

1. **Accessibility**: WCAG AA compliance on all pages
2. **Usability**: Older caregivers can complete tasks without assistance
3. **Readability**: No text smaller than 14px (except legal disclaimers)
4. **Touch Targets**: All interactive elements ≥44px on mobile
5. **User Satisfaction**: Positive feedback from older caregiver testing

## Rollback Plan

If changes cause significant issues:
1. Revert changes in reverse order (Phase 4 → 1)
2. Keep git history for easy rollback
3. Document which specific changes caused issues
4. Iterate with smaller increments

## References

- WCAG 2.1 Guidelines: https://www.w3.org/WAI/WCAG21/quickref/
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Apple Human Interface Guidelines: Accessibility
- Material Design Accessibility Guidelines
