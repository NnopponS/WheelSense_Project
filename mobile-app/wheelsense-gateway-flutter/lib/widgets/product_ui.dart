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

/// App icon by name. Every name maps to Material Rounded so the whole app
/// draws from one icon set; unknown names fall back to the bundled SVG.
class ProductIcon extends StatelessWidget {
  const ProductIcon(this.name, {super.key, this.size = 24, this.color});
  final String name;
  final double size;
  final Color? color;

  static const _icons = <String, IconData>{
    'activity': Icons.directions_walk_rounded,
    'add': Icons.add_rounded,
    'arrow': Icons.arrow_outward_rounded,
    'battery': Icons.battery_5_bar_rounded,
    'bluetooth': Icons.bluetooth_rounded,
    'care': Icons.volunteer_activism_rounded,
    'chart': Icons.show_chart_rounded,
    'check': Icons.check_rounded,
    'cloud': Icons.cloud_rounded,
    'devices': Icons.devices_other_rounded,
    'eye': Icons.visibility_rounded,
    'eye-off': Icons.visibility_off_rounded,
    'health': Icons.monitor_heart_rounded,
    'heart': Icons.favorite_rounded,
    'home': Icons.home_rounded,
    'person': Icons.person_rounded,
    'polar': Icons.watch_rounded,
    'rr': Icons.graphic_eq_rounded,
    'scan': Icons.radar_rounded,
    'settings': Icons.tune_rounded,
    'sleep': Icons.bedtime_rounded,
    'speed': Icons.speed_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final tint =
        color ??
        IconTheme.of(context).color ??
        Theme.of(context).colorScheme.onSurface;
    final icon = _icons[name];
    if (icon != null) return Icon(icon, size: size, color: tint);
    return SvgPicture.asset(
      'assets/icons/$name.svg',
      width: size,
      height: size,
      excludeFromSemantics: true,
      colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
    );
  }
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
                wide ? 28 : 20,
                wide ? 24 : 12,
                wide ? 28 : 20,
                40,
              ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
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
              Text(title, style: theme.textTheme.titleMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: theme.textTheme.bodySmall),
              ],
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

/// Soft card: warm surface fill on the cream canvas, no shadow; a border only
/// when one is asked for.
class ProductSurface extends StatelessWidget {
  const ProductSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.background,
    this.border,
    this.onTap,
    this.radius = 22,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? background;
  final Color? border;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: border == null ? BorderSide.none : BorderSide(color: border!),
    );
    return Material(
      color: background ?? colors.surface,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Small status label: a coloured dot followed by text on a soft tint.
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = positive
        ? Theme.of(context).colorScheme.primary
        : (isDark ? AppPalette.warningBright : const Color(0xFFB45309));

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.14 : 0.09),
        borderRadius: BorderRadius.circular(50),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10,
          vertical: compact ? 4 : 6,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null)
              Icon(icon, size: compact ? 12 : 14, color: color)
            else
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w600,
                  fontSize: compact ? 11 : 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rounded square holding a tinted icon; the one icon treatment used app-wide.
class ProductIconBadge extends StatelessWidget {
  const ProductIconBadge(
    this.icon, {
    super.key,
    required this.tint,
    this.size = 36,
  });

  final String icon;
  final Color tint;
  final double size;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tint.withValues(alpha: isDark ? 0.16 : 0.09),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Center(
        child: ProductIcon(icon, color: tint, size: size * 0.52),
      ),
    );
  }
}

/// Unboxed reading: small label, large tabular value, muted unit and note.
class ProductStat extends StatelessWidget {
  const ProductStat({
    super.key,
    required this.label,
    required this.value,
    this.unit = '',
    this.note,
  });

  final String label;
  final String value;
  final String unit;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.labelMedium,
        ),
        const SizedBox(height: 4),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.end,
          spacing: 3,
          children: [
            Text(
              value,
              style: theme.textTheme.headlineMedium?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (unit.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(unit, style: theme.textTheme.bodySmall),
              ),
          ],
        ),
        if (note != null)
          Text(
            note!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall,
          ),
      ],
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ProductIconBadge(icon, tint: tint, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.displayMedium?.copyWith(
                  fontSize: 30,
                  height: 1.0,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 4),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(unit, style: theme.textTheme.bodyMedium),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            caption,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall,
          ),
        ],
      ),
    );
  }
}
