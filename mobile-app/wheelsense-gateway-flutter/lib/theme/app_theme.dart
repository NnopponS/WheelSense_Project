import 'package:flutter/material.dart';

import 'app_palette.dart';
import 'app_typography.dart';

class WheelSenseColors {
  const WheelSenseColors._();

  static const clinicalBlue = AppPalette.left;
  static const ink = AppPalette.slate900;
  static const muted = AppPalette.slate500;
  static const canvas = AppPalette.slate50;
  static const panel = AppPalette.white;
  static const emergency = AppPalette.danger;
  static const warning = AppPalette.warning;
  static const success = AppPalette.success;
  static const ai = Color(0xFF6D28D9);
}

/// Builds the comprehensive WheelSense theme for light and dark modes.
abstract final class AppTheme {
  const AppTheme._();

  static ThemeData light() => _build(
        brightness: Brightness.light,
        scheme: const ColorScheme.light(
          primary: AppPalette.brand,
          onPrimary: AppPalette.white,
          primaryContainer: Color(0xFFCCFBF1),
          onPrimaryContainer: AppPalette.brandStrong,
          secondary: AppPalette.left,
          onSecondary: AppPalette.white,
          surface: AppPalette.white,
          onSurface: AppPalette.slate900,
          surfaceContainerLowest: AppPalette.white,
          surfaceContainerLow: AppPalette.slate50,
          surfaceContainer: AppPalette.slate100,
          surfaceContainerHigh: AppPalette.slate200,
          onSurfaceVariant: AppPalette.slate600,
          outline: AppPalette.slate300,
          outlineVariant: AppPalette.slate200,
          error: AppPalette.danger,
          onError: AppPalette.white,
          tertiary: AppPalette.success,
          tertiaryContainer: Color(0xFFDCFCE7),
        ),
        scaffold: AppPalette.slate50,
        ink: AppPalette.slate900,
        muted: AppPalette.slate600,
      );

  static ThemeData dark() => _build(
        brightness: Brightness.dark,
        scheme: const ColorScheme.dark(
          primary: AppPalette.brandSoft,
          onPrimary: AppPalette.slate950,
          primaryContainer: AppPalette.brandStrong,
          onPrimaryContainer: Color(0xFFCCFBF1),
          secondary: AppPalette.leftBright,
          onSecondary: AppPalette.slate950,
          surface: AppPalette.slate900,
          onSurface: AppPalette.slate100,
          surfaceContainerLowest: AppPalette.slate950,
          surfaceContainerLow: AppPalette.slate900,
          surfaceContainer: AppPalette.slate850,
          surfaceContainerHigh: AppPalette.slate800,
          onSurfaceVariant: AppPalette.slate400,
          outline: AppPalette.slate700,
          outlineVariant: AppPalette.slate800,
          error: AppPalette.dangerBright,
          onError: AppPalette.slate950,
          tertiary: AppPalette.successBright,
          tertiaryContainer: Color(0xFF064E3B),
        ),
        scaffold: AppPalette.slate950,
        ink: AppPalette.slate100,
        muted: AppPalette.slate400,
      );

  static ThemeData _build({
    required Brightness brightness,
    required ColorScheme scheme,
    required Color scaffold,
    required Color ink,
    required Color muted,
  }) {
    final textTheme = AppTypography.textTheme(ink, muted);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffold,
      textTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: ink,
          fontWeight: FontWeight.w700,
        ),
        foregroundColor: ink,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        elevation: 0,
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.15),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? scheme.primary
                : muted,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: brightness == Brightness.light
            ? AppPalette.slate50
            : AppPalette.slate850,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

ThemeData buildWheelSenseTheme() => AppTheme.light();
