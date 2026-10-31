import 'package:flutter/material.dart';

/// Raw color primitives for the WheelSense design system.
///
/// High-chroma, high-contrast values chosen deliberately so the UI stays
/// legible under direct sunlight on the sports track or in medical clinics.
abstract final class AppPalette {
  const AppPalette._();

  // ---- Brand (Teal & Cyan) ----
  static const Color brand = Color(0xFF0D9488);
  static const Color brandStrong = Color(0xFF0F766E);
  static const Color brandSoft = Color(0xFF5EEAD4);
  static const Color brandLuminous = Color(0xFF14B8A6);

  // ---- Left Wheel / Primary Sensor (Cobalt Blue) ----
  static const Color left = Color(0xFF2563EB);
  static const Color leftStrong = Color(0xFF1D4ED8);
  static const Color leftBright = Color(0xFF60A5FA);

  // ---- Right Wheel / Secondary Sensor (Vibrant Orange) ----
  static const Color right = Color(0xFFF97316);
  static const Color rightStrong = Color(0xFFEA580C);
  static const Color rightBright = Color(0xFFFB923C);

  // ---- Polar Vitals (Crimson & Rose) ----
  static const Color polarHeart = Color(0xFFE11D48);
  static const Color polarHeartBright = Color(0xFFFB7185);
  static const Color polarPpg = Color(0xFF8B5CF6);
  static const Color polarPpgBright = Color(0xFFA78BFA);

  // ---- Semantic Status ----
  static const Color success = Color(0xFF16A34A);
  static const Color successBright = Color(0xFF4ADE80);
  static const Color warning = Color(0xFFEAB308);
  static const Color warningBright = Color(0xFFFACC15);
  static const Color danger = Color(0xFFDC2626);
  static const Color dangerBright = Color(0xFFF87171);
  static const Color info = Color(0xFF0284C7);
  static const Color infoBright = Color(0xFF38BDF8);

  // ---- Neutrals (Slate Ramp) ----
  static const Color slate950 = Color(0xFF020617);
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate850 = Color(0xFF162032);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color white = Color(0xFFFFFFFF);
}
