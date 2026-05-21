import 'package:flutter/material.dart';

class WheelSenseColors {
  const WheelSenseColors._();

  static const clinicalBlue = Color(0xFF2563EB);
  static const ink = Color(0xFF172033);
  static const muted = Color(0xFF64748B);
  static const canvas = Color(0xFFF5F9FF);
  static const panel = Color(0xFFFFFFFF);
  static const emergency = Color(0xFFDC2626);
  static const warning = Color(0xFFD97706);
  static const success = Color(0xFF15803D);
  static const ai = Color(0xFF6D28D9);
}

ThemeData buildWheelSenseTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: WheelSenseColors.clinicalBlue,
    brightness: Brightness.light,
    surface: WheelSenseColors.panel,
  );

  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Kanit',
    colorScheme: scheme.copyWith(
      primary: WheelSenseColors.clinicalBlue,
      error: WheelSenseColors.emergency,
      surface: WheelSenseColors.panel,
      surfaceContainerLowest: WheelSenseColors.canvas,
      tertiary: WheelSenseColors.success,
      tertiaryContainer: const Color(0xFFE8F7EE),
    ),
    scaffoldBackgroundColor: WheelSenseColors.canvas,
    appBarTheme: const AppBarTheme(
      elevation: 0,
      centerTitle: false,
      backgroundColor: WheelSenseColors.panel,
      foregroundColor: WheelSenseColors.ink,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: WheelSenseColors.panel,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Color(0xFFDCE7F5)),
      ),
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: WheelSenseColors.panel,
      selectedIconTheme: IconThemeData(color: WheelSenseColors.clinicalBlue),
      selectedLabelTextStyle: TextStyle(
        color: WheelSenseColors.clinicalBlue,
        fontWeight: FontWeight.w700,
      ),
      unselectedIconTheme: IconThemeData(color: WheelSenseColors.muted),
      unselectedLabelTextStyle: TextStyle(color: WheelSenseColors.muted),
    ),
    navigationBarTheme: NavigationBarThemeData(
      elevation: 0,
      backgroundColor: WheelSenseColors.panel,
      indicatorColor: WheelSenseColors.clinicalBlue.withValues(alpha: 0.12),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
        ),
      ),
    ),
    textTheme: const TextTheme(
      titleLarge: TextStyle(
        fontSize: 22,
        height: 1.18,
        fontWeight: FontWeight.w700,
        color: WheelSenseColors.ink,
      ),
      titleMedium: TextStyle(
        fontSize: 17,
        height: 1.25,
        fontWeight: FontWeight.w700,
        color: WheelSenseColors.ink,
      ),
      bodyLarge: TextStyle(
        fontSize: 15,
        height: 1.35,
        color: WheelSenseColors.ink,
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        height: 1.35,
        color: WheelSenseColors.ink,
      ),
      labelLarge: TextStyle(
        fontSize: 13,
        height: 1.25,
        color: WheelSenseColors.muted,
        fontWeight: FontWeight.w700,
      ),
      labelMedium: TextStyle(
        fontSize: 12,
        height: 1.2,
        color: WheelSenseColors.muted,
        fontWeight: FontWeight.w600,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFDCE7F5)),
      ),
    ),
  );
}
