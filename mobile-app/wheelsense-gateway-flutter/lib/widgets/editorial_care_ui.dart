import 'package:flutter/material.dart';

import '../theme/app_palette.dart';

/// Editorial care design tokens and components matching the minimalist,
/// organic aesthetic requested by the user with care green & care blue accents.
abstract final class EditorialCareColors {
  /// Deep rich care ink (deep pine/navy) for high-contrast primary elements
  static const ink = Color(0xFF0B2D2F);
  static const inkLight = Color(0xFF134E52);

  /// Care soothing greens
  static const greenBlob = Color(0xFFE6F5EE);
  static const greenMint = Color(0xFF10B981);
  static const greenDeep = Color(0xFF047857);

  /// Care soothing blues
  static const blueBlob = Color(0xFFE1F1FD);
  static const blueSky = Color(0xFF0284C7);
  static const blueDeep = Color(0xFF0369A1);

  /// Minimalist dot grid accent
  static const dotAccent = Color(0xFFCBD5E1);
  static const dotDark = Color(0xFF94A3B8);
}

/// Custom painter that draws an editorial dot-grid matrix (like in The New York Times minimalism guide).
class EditorialDotGridPainter extends CustomPainter {
  const EditorialDotGridPainter({
    this.dotColor = EditorialCareColors.dotAccent,
    this.spacing = 14.0,
    this.dotRadius = 1.3,
  });

  final Color dotColor;
  final double spacing;
  final double dotRadius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = dotColor
      ..style = PaintingStyle.fill;

    final cols = (size.width / spacing).floor();
    final rows = (size.height / spacing).floor();

    final offsetX = (size.width - (cols - 1) * spacing) / 2;
    final offsetY = (size.height - (rows - 1) * spacing) / 2;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        canvas.drawCircle(
          Offset(offsetX + c * spacing, offsetY + r * spacing),
          dotRadius,
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant EditorialDotGridPainter oldDelegate) =>
      oldDelegate.dotColor != dotColor ||
      oldDelegate.spacing != spacing ||
      oldDelegate.dotRadius != dotRadius;
}

/// Custom painter for organic fluid blob shapes in soothing care green and blue.
class EditorialCareBlobPainter extends CustomPainter {
  const EditorialCareBlobPainter({
    required this.isDark,
  });

  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // 1. Soft care blue fluid curve in the upper-left
    final bluePaint = Paint()
      ..color = isDark
          ? const Color(0xFF0C243B).withValues(alpha: 0.6)
          : EditorialCareColors.blueBlob.withValues(alpha: 0.85)
      ..style = PaintingStyle.fill;

    final bluePath = Path()
      ..moveTo(0, 0)
      ..lineTo(w * 0.65, 0)
      ..cubicTo(w * 0.60, h * 0.45, w * 0.35, h * 0.70, 0, h * 0.65)
      ..close();
    canvas.drawPath(bluePath, bluePaint);

    // 2. Soft care green fluid curve in the lower-right
    final greenPaint = Paint()
      ..color = isDark
          ? const Color(0xFF063327).withValues(alpha: 0.5)
          : EditorialCareColors.greenBlob.withValues(alpha: 0.9)
      ..style = PaintingStyle.fill;

    final greenPath = Path()
      ..moveTo(w, h * 0.25)
      ..cubicTo(w * 0.85, h * 0.20, w * 0.45, h * 0.55, w * 0.40, h)
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(greenPath, greenPaint);
  }

  @override
  bool shouldRepaint(covariant EditorialCareBlobPainter oldDelegate) =>
      oldDelegate.isDark != isDark;
}

/// Hero Banner featuring organic care shapes, dot-grid matrix, and high-contrast editorial typography.
class EditorialCareHeroBanner extends StatelessWidget {
  const EditorialCareHeroBanner({
    super.key,
    required this.tag,
    required this.title,
    required this.subtitle,
    this.badgeText,
    this.onBadgeTap,
  });

  final String tag;
  final String title;
  final String subtitle;
  final String? badgeText;
  final VoidCallback? onBadgeTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate900 : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : const Color(0xFFE2E8F0),
          width: 1,
        ),
        boxShadow: isDark
            ? null
            : const [
                BoxShadow(
                  color: Color(0x060F172A),
                  blurRadius: 20,
                  offset: Offset(0, 4),
                ),
              ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Background organic curves
          Positioned.fill(
            child: CustomPaint(
              painter: EditorialCareBlobPainter(isDark: isDark),
            ),
          ),
          // Subtle dot-grid accent block on top-right
          Positioned(
            top: 14,
            right: 18,
            width: 100,
            height: 80,
            child: Opacity(
              opacity: isDark ? 0.35 : 0.6,
              child: const CustomPaint(
                painter: EditorialDotGridPainter(spacing: 12, dotRadius: 1.1),
              ),
            ),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    Text(
                      tag.toUpperCase(),
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.1,
                        color: isDark
                            ? EditorialCareColors.blueSky
                            : EditorialCareColors.blueDeep,
                      ),
                    ),
                    if (badgeText != null)
                      InkWell(
                        onTap: onBadgeTap,
                        borderRadius: BorderRadius.circular(30),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: isDark
                                ? AppPalette.slate800
                                : EditorialCareColors.ink,
                            borderRadius: BorderRadius.circular(30),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x1F000000),
                                blurRadius: 4,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: EditorialCareColors.greenMint,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  badgeText!,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                    letterSpacing: 0.2,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  title,
                  style: theme.textTheme.displaySmall?.copyWith(
                    
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                    letterSpacing: -0.4,
                    color: isDark ? Colors.white : EditorialCareColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 12.5,
                    height: 1.4,
                    color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// High-contrast Editorial Checklist item (matches the right phone in the user's reference).
class EditorialCareChecklistTile extends StatelessWidget {
  const EditorialCareChecklistTile({
    super.key,
    required this.title,
    this.subtitle,
    this.checked = true,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final bool checked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : EditorialCareColors.ink,
                          height: 1.3,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: isDark
                                ? AppPalette.slate400
                                : AppPalette.slate500,
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                // Solid high-contrast square checkbox with crisp checkmark (from user reference)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: checked
                        ? (isDark
                            ? EditorialCareColors.greenMint
                            : EditorialCareColors.ink)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(7),
                    border: Border.all(
                      color: checked
                          ? (isDark
                              ? EditorialCareColors.greenMint
                              : EditorialCareColors.ink)
                          : (isDark ? AppPalette.slate700 : AppPalette.slate300),
                      width: 1.8,
                    ),
                  ),
                  child: Center(
                    child: Icon(
                      Icons.check_rounded,
                      size: 16,
                      color: checked
                          ? (isDark ? AppPalette.slate950 : Colors.white)
                          : Colors.transparent,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Bold, high-contrast, full-width Action Button (matches 'NEXT STEP' from the user's reference).
class EditorialCareButton extends StatelessWidget {
  const EditorialCareButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final bgColor = destructive
        ? AppPalette.danger
        : (isDark ? AppPalette.slate100 : EditorialCareColors.ink);
    final fgColor = destructive
        ? Colors.white
        : (isDark ? AppPalette.slate950 : Colors.white);

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: bgColor,
            foregroundColor: fgColor,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 17, color: fgColor),
                const SizedBox(width: 6),
              ],
              Flexible(
                child: Text(
                  label.toUpperCase(),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: fgColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
