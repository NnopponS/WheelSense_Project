/**
 * WheelSense mobile tokens aligned to the frontend light theme in `frontend/app/globals.css`.
 */
export const colors = {
  bg: '#EFF6FF',
  surface: '#FFFFFF',
  surfaceMuted: '#F6FBFF',
  surfaceContainer: '#F3F8FD',
  border: '#C9D7E6',
  borderStrong: '#B3C4D8',
  text: '#0F172A',
  textMuted: '#516173',
  primary: '#0F5CC0',
  primaryMuted: '#D9E8FF',
  primaryForeground: '#F8FBFF',
  secondary: '#0E7490',
  secondaryMuted: '#D8EDF7',
  success: '#15803D',
  successMuted: '#DCFCE7',
  warning: '#B45309',
  warningMuted: '#FEF3C7',
  danger: '#C63F3F',
  dangerMuted: '#FEE2E2',
  info: '#1D4ED8',
  overlay: 'rgba(15, 23, 42, 0.08)',
  shadow: '#0F172A',
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  elevated: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
} as const;
