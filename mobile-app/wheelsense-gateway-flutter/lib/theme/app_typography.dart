import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Standard typography for WheelSense applications.
///
/// Uses the native system family with Thai glyphs as a fallback.
abstract final class AppTypography {
  const AppTypography._();

  static TextTheme textTheme(Color ink, Color muted) {
    final base = Typography.material2021(
      platform: defaultTargetPlatform,
    ).black.apply(fontFamilyFallback: const ['NotoSansThai']);
    return base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        color: ink,
        fontSize: 32,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
      ),
      displayMedium: base.displayMedium?.copyWith(
        color: ink,
        fontSize: 26,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        color: ink,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        color: ink,
        fontSize: 17,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      ),
      titleLarge: base.titleLarge?.copyWith(
        color: ink,
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: base.titleMedium?.copyWith(
        color: ink,
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        color: ink,
        fontSize: 14,
        fontWeight: FontWeight.w400,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        color: muted,
        fontSize: 12.5,
        fontWeight: FontWeight.w400,
      ),
      labelLarge: base.labelLarge?.copyWith(
        color: ink,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.2,
      ),
      labelSmall: base.labelSmall?.copyWith(
        color: muted,
        fontSize: 10,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.4,
      ),
    );
  }

  static TextStyle monospaceMetrics({
    Color? color,
    double fontSize = 22,
    FontWeight fontWeight = FontWeight.w700,
  }) {
    return TextStyle(
      fontFamily: 'monospace',
      color: color,
      fontSize: fontSize,
      fontWeight: fontWeight,
      letterSpacing: -0.5,
    );
  }
}
