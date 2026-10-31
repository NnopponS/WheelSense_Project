import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/app_palette.dart';

/// Shared, original Flutter primitives for the WheelSense mobile product UI.
/// Uses the existing Inter typography and Material 3 theme.
abstract final class ProductColors {
  static const ink = Color(0xFF102B36);
  static const deep = Color(0xFF0B2733);
  static const ocean = Color(0xFF0F5158);
  static const mint = Color(0xFF42DBC0);
  static const softMint = Color(0xFFE5F8F3);
  static const canvas = Color(0xFFF4F8F8);
  static const mist = Color(0xFFECF2F3);
}

class ProductIcon extends StatelessWidget {
  const ProductIcon(this.name, {super.key, this.size = 24, this.color});
  final String name;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/icons/$name.svg',
    width: size,
    height: size,
    excludeFromSemantics: true,
    colorFilter: ColorFilter.mode(
      color ??
          IconTheme.of(context).color ??
          Theme.of(context).colorScheme.onSurface,
      BlendMode.srcIn,
    ),
  );
}

class ProductPage extends StatelessWidget {
  const ProductPage({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        return SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding:
              padding ??
              EdgeInsets.fromLTRB(
                wide ? 26 : 18,
                wide ? 24 : 18,
                wide ? 26 : 18,
                32,
              ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1020),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: children,
              ),
            ),
          ),
        );
      },
    );
  }
}

class ProductSectionHeading extends StatelessWidget {
  const ProductSectionHeading({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class ProductSurface extends StatelessWidget {
  const ProductSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(17),
    this.background,
    this.border,
    this.onTap,
    this.radius = 18,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? background;
  final Color? border;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final fill = background ?? (isDark ? AppPalette.slate900 : Colors.white);
    return Material(
      color: fill,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color:
                  border ??
                  (isDark ? AppPalette.slate800 : const Color(0xFFE5ECEF)),
            ),
            boxShadow: isDark
                ? null
                : const [
                    BoxShadow(
                      color: Color(0x0B0C343E),
                      blurRadius: 22,
                      offset: Offset(0, 6),
                    ),
                  ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class ProductStatusPill extends StatelessWidget {
  const ProductStatusPill({
    super.key,
    required this.label,
    this.positive = false,
    this.icon,
    this.compact = false,
  });

  final String label;
  final bool positive;
  final IconData? icon;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = positive ? const Color(0xFF087C69) : const Color(0xFF91611E);
    final bg = positive ? const Color(0xFFE2F8F0) : const Color(0xFFFFF3DF);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(50),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 9 : 12,
          vertical: compact ? 6 : 8,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ??
                  (positive ? Icons.check_circle_rounded : Icons.info_rounded),
              size: compact ? 12 : 14,
              color: color,
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w700,
                  fontSize: compact ? 10 : 11,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Wheel + sensing pulse: original vector icon painted at any resolution.
class WheelSenseMark extends StatelessWidget {
  const WheelSenseMark({super.key, this.size = 40, this.color = Colors.white});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'WheelSense',
      image: true,
      child: CustomPaint(
        size: Size.square(size),
        painter: _WheelSenseMarkPainter(color),
      ),
    );
  }
}

class _WheelSenseMarkPainter extends CustomPainter {
  const _WheelSenseMarkPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.067
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawCircle(Offset(s * 0.23, s * 0.69), s * 0.14, stroke);
    canvas.drawCircle(Offset(s * 0.77, s * 0.69), s * 0.14, stroke);
    final line = Path()
      ..moveTo(s * 0.1, s * 0.35)
      ..lineTo(s * 0.32, s * 0.35)
      ..lineTo(s * 0.43, s * 0.17)
      ..lineTo(s * 0.54, s * 0.52)
      ..lineTo(s * 0.64, s * 0.35)
      ..lineTo(s * 0.88, s * 0.35);
    canvas.drawPath(line, stroke);
    final bridge = Path()
      ..moveTo(s * 0.34, s * 0.68)
      ..quadraticBezierTo(s * 0.5, s * 0.57, s * 0.66, s * 0.68);
    canvas.drawPath(bridge, stroke);
  }

  @override
  bool shouldRepaint(covariant _WheelSenseMarkPainter oldDelegate) =>
      oldDelegate.color != color;
}

class ProductMetricCard extends StatelessWidget {
  const ProductMetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.unit,
    required this.caption,
    required this.icon,
    required this.tint,
    this.onTap,
  });

  final String label;
  final String value;
  final String unit;
  final String caption;
  final String icon;
  final Color tint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ProductSurface(
      onTap: onTap,
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.11),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: ProductIcon(icon, color: tint, size: 20),
              ),
              const Spacer(),
              if (onTap != null)
                ProductIcon(
                  'arrow',
                  size: 17,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.displayMedium?.copyWith(
                  fontSize: 29,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                  letterSpacing: -0.6,
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 5),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(unit, style: theme.textTheme.labelSmall),
                ),
              ],
            ],
          ),
          const SizedBox(height: 7),
          Text(
            caption,
            style: theme.textTheme.labelSmall?.copyWith(
              height: 1.4,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
