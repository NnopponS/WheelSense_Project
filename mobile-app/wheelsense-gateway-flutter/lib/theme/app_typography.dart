import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Standard typography for WheelSense applications.
///
/// Uses the bundled Inter family with Noto Sans Thai as the glyph fallback.
abstract final class AppTypography {
  const AppTypography._();

  static const family = 'Inter';
  static const fallback = ['NotoSansThai', 'Roboto', 'sans-serif'];

  static TextTheme textTheme(Color ink, Color muted) {
    final base = Typography.material2021(
      platform: defaultTargetPlatform,
    ).black.apply(fontFamily: family, fontFamilyFallback: fallback);
    return base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        color: ink,
        fontSize: 32,
        fontWeight: FontWeight.w600,
        letterSpacing: -1.0,
        height: 1.1,
      ),
      displayMedium: base.displayMedium?.copyWith(
        color: ink,
        fontSize: 26,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.7,
        height: 1.15,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        color: ink,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.5,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        color: ink,
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      ),
      titleLarge: base.titleLarge?.copyWith(
        color: ink,
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      ),
      titleMedium: base.titleMedium?.copyWith(
        color: ink,
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.15,
      ),
      titleSmall: base.titleSmall?.copyWith(
        color: ink,
        fontSize: 15,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        color: ink,
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.5,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        color: muted,
        fontSize: 15,
        fontWeight: FontWeight.w400,
        height: 1.5,
      ),
      bodySmall: base.bodySmall?.copyWith(
        color: muted,
        fontSize: 13,
        fontWeight: FontWeight.w400,
        height: 1.45,
      ),
      labelLarge: base.labelLarge?.copyWith(
        color: ink,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.05,
      ),
      labelMedium: base.labelMedium?.copyWith(
        color: muted,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      labelSmall: base.labelSmall?.copyWith(
        color: muted,
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.1,
      ),
    );
  }

  static TextStyle monospaceMetrics({
    Color? color,
    double fontSize = 22,
    FontWeight fontWeight = FontWeight.w600,
  }) {
    return TextStyle(
      fontFamily: family,
      fontFamilyFallback: fallback,
      fontFeatures: const [FontFeature.tabularFigures()],
      color: color,
      fontSize: fontSize,
      fontWeight: fontWeight,
      letterSpacing: -0.5,
    );
  }
}
