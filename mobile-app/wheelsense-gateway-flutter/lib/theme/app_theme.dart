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

/// Builds the WheelSense theme from the web portal's palette: cool grey
/// canvas, white cards, portal-blue accent and blue pill buttons.
abstract final class AppTheme {
  const AppTheme._();

  static const radius = 22.0;
  static const controlRadius = 14.0;

  static ThemeData light() => _build(
    brightness: Brightness.light,
    scheme: const ColorScheme.light(
      primary: AppPalette.brand,
      onPrimary: AppPalette.white,
      primaryContainer: AppPalette.brandPastel,
      onPrimaryContainer: AppPalette.brandStrong,
      secondary: AppPalette.left,
      onSecondary: AppPalette.white,
      secondaryContainer: AppPalette.sand150,
      onSecondaryContainer: AppPalette.sand900,
      surface: AppPalette.paper,
      onSurface: AppPalette.sand900,
      surfaceContainerLowest: AppPalette.white,
      surfaceContainerLow: AppPalette.sand50,
      surfaceContainer: AppPalette.sand100,
      surfaceContainerHigh: AppPalette.sand150,
      surfaceContainerHighest: AppPalette.sand200,
      onSurfaceVariant: AppPalette.sand500,
      outline: AppPalette.sand200,
      outlineVariant: AppPalette.sand150,
      error: AppPalette.danger,
      onError: AppPalette.white,
      tertiary: AppPalette.success,
      tertiaryContainer: Color(0xFFE6F2EA),
      inverseSurface: AppPalette.sand900,
      onInverseSurface: AppPalette.sand50,
    ),
    scaffold: AppPalette.sand100,
    ink: AppPalette.sand900,
    muted: AppPalette.sand500,
  );

  static ThemeData dark() => _build(
    brightness: Brightness.dark,
    scheme: const ColorScheme.dark(
      primary: AppPalette.brandSoft,
      onPrimary: Color(0xFF0B2448),
      primaryContainer: Color(0xFF203652),
      onPrimaryContainer: Color(0xFFD6E6FF),
      secondary: AppPalette.leftBright,
      onSecondary: AppPalette.sand950,
      secondaryContainer: Color(0xFF29323D),
      onSecondaryContainer: Color(0xFFF3F5F7),
      surface: Color(0xFF191E25),
      onSurface: Color(0xFFF3F5F7),
      surfaceContainerLowest: AppPalette.sand950,
      surfaceContainerLow: Color(0xFF191E25),
      surfaceContainer: Color(0xFF1F252D),
      surfaceContainerHigh: Color(0xFF252D37),
      surfaceContainerHighest: Color(0xFF29323D),
      onSurfaceVariant: AppPalette.sand400,
      outline: AppPalette.sand700,
      outlineVariant: Color(0xFF252D37),
      error: AppPalette.dangerBright,
      onError: AppPalette.sand950,
      tertiary: AppPalette.successBright,
      tertiaryContainer: Color(0xFF173322),
      inverseSurface: Color(0xFFF3F5F7),
      onInverseSurface: AppPalette.sand900,
    ),
    scaffold: AppPalette.sand950,
    ink: Color(0xFFF3F5F7),
    muted: AppPalette.sand400,
  );

  static ThemeData _build({
    required Brightness brightness,
    required ColorScheme scheme,
    required Color scaffold,
    required Color ink,
    required Color muted,
  }) {
    final textTheme = AppTypography.textTheme(ink, muted);
    const controlShape = StadiumBorder();
    const buttonPadding = EdgeInsets.symmetric(horizontal: 22, vertical: 14);
    const buttonText = TextStyle(
      fontFamily: AppTypography.family,
      fontFamilyFallback: AppTypography.fallback,
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.1,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: AppTypography.family,
      fontFamilyFallback: AppTypography.fallback,
      scaffoldBackgroundColor: scaffold,
      canvasColor: scaffold,
      textTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      iconTheme: IconThemeData(color: ink, size: 22),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffold,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: ink),
        foregroundColor: ink,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        elevation: 0,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
        indicatorShape: const StadiumBorder(),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 22,
            color: states.contains(WidgetState.selected)
                ? scheme.onPrimaryContainer
                : muted,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: AppTypography.family,
            fontFamilyFallback: AppTypography.fallback,
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w600
                : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? ink : muted,
          ),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primaryContainer,
        indicatorShape: const StadiumBorder(),
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer),
        unselectedIconTheme: IconThemeData(color: muted),
        selectedLabelTextStyle: textTheme.labelLarge?.copyWith(color: ink),
        unselectedLabelTextStyle: textTheme.labelLarge?.copyWith(color: muted),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        hintStyle: textTheme.bodyLarge?.copyWith(color: muted),
        labelStyle: textTheme.bodyLarge?.copyWith(color: muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // Portal-blue pill, as on the web's primary buttons.
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          // Without these a disabled button kept the charcoal fill but got
          // dark disabled text, so its label vanished.
          disabledBackgroundColor: scheme.onSurface.withValues(alpha: 0.12),
          disabledForegroundColor: scheme.onSurface.withValues(alpha: 0.38),
          shape: controlShape,
          padding: buttonPadding,
          minimumSize: const Size(0, 48),
          textStyle: buttonText,
          elevation: 0,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: controlShape,
          padding: buttonPadding,
          minimumSize: const Size(0, 48),
          textStyle: buttonText,
          elevation: 0,
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: controlShape,
          padding: buttonPadding,
          minimumSize: const Size(0, 48),
          textStyle: buttonText,
          foregroundColor: ink,
          side: BorderSide(color: scheme.outline),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: controlShape,
          textStyle: buttonText,
          foregroundColor: scheme.primary,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surface,
        selectedColor: scheme.primaryContainer,
        side: BorderSide(color: scheme.outline),
        shape: const StadiumBorder(),
        labelStyle: textTheme.labelLarge,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: scheme.primaryContainer,
          selectedForegroundColor: scheme.onPrimaryContainer,
          side: BorderSide(color: scheme.outline),
          textStyle: buttonText.copyWith(fontSize: 13),
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: controlShape,
        iconColor: muted,
        titleTextStyle: textTheme.titleMedium,
        subtitleTextStyle: textTheme.bodyMedium,
      ),
      // Off thumb in the muted ink so an off switch is still visible.
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? scheme.onPrimary
              : scheme.onSurfaceVariant,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.surfaceContainerHighest,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Colors.transparent
              : scheme.outline,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.surfaceContainer,
        circularTrackColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: textTheme.bodyLarge?.copyWith(
          color: scheme.onInverseSurface,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: scheme.inverseSurface,
          borderRadius: BorderRadius.circular(8),
        ),
        textStyle: textTheme.labelSmall?.copyWith(
          color: scheme.onInverseSurface,
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: ink,
        unselectedLabelColor: muted,
        indicatorColor: ink,
        dividerColor: scheme.outlineVariant,
        labelStyle: buttonText,
        unselectedLabelStyle: buttonText.copyWith(fontWeight: FontWeight.w500),
      ),
    );
  }
}

ThemeData buildWheelSenseTheme() => AppTheme.light();
