import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../theme/app_theme.dart';

class ClinicalPage extends StatelessWidget {
  const ClinicalPage({super.key, required this.children, this.trailing});

  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 900;
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            isWide ? 24 : 14,
            16,
            isWide ? 24 : 14,
            24,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (trailing != null) ...[
                    Align(alignment: Alignment.centerRight, child: trailing),
                    const SizedBox(height: 12),
                  ],
                  ...children,
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class SectionPanel extends StatelessWidget {
  const SectionPanel({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.action,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.textTheme.titleMedium),
                      if (subtitle case final text?) ...[
                        const SizedBox(height: 3),
                        Text(text, style: theme.textTheme.labelMedium),
                      ],
                    ],
                  ),
                ),
                ...?(action == null ? null : [action!]),
              ],
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}

class ResponsiveGrid extends StatelessWidget {
  const ResponsiveGrid({
    super.key,
    required this.children,
    this.minWidth = 260,
  });

  final List<Widget> children;
  final double minWidth;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = (constraints.maxWidth / minWidth).floor().clamp(1, 4);
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final child in children)
              SizedBox(
                width: (constraints.maxWidth - (columns - 1) * 12) / columns,
                child: child,
              ),
          ],
        );
      },
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.metric});

  final MetricSnapshot metric;

  @override
  Widget build(BuildContext context) {
    final colors = severityColors(metric.severity);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(metric.icon, color: colors.foreground),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    metric.label,
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    metric.value,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    metric.detail,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.severity});

  final String label;
  final ClinicalSeverity severity;

  @override
  Widget build(BuildContext context) {
    final colors = severityColors(severity);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          label,
          style: TextStyle(
            color: colors.foreground,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class CompactRowCard extends StatelessWidget {
  const CompactRowCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.severity,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String meta;
  final ClinicalSeverity severity;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = severityColors(severity);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFDCE7F5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: colors.background,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: colors.foreground, size: 21),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.bodyLarge),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(meta, style: Theme.of(context).textTheme.labelMedium),
                if (actionLabel != null) ...[
                  const SizedBox(height: 6),
                  OutlinedButton(
                    onPressed: onAction,
                    child: Text(actionLabel!),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class SeverityPalette {
  const SeverityPalette({
    required this.foreground,
    required this.background,
    required this.border,
  });

  final Color foreground;
  final Color background;
  final Color border;
}

SeverityPalette severityColors(ClinicalSeverity severity) {
  return switch (severity) {
    ClinicalSeverity.critical => const SeverityPalette(
      foreground: WheelSenseColors.emergency,
      background: Color(0xFFFFEBEE),
      border: Color(0xFFF8B4B4),
    ),
    ClinicalSeverity.warning => const SeverityPalette(
      foreground: WheelSenseColors.warning,
      background: Color(0xFFFFF7E6),
      border: Color(0xFFF6D394),
    ),
    ClinicalSeverity.info => const SeverityPalette(
      foreground: WheelSenseColors.ai,
      background: Color(0xFFF2ECFF),
      border: Color(0xFFD6C7FF),
    ),
    ClinicalSeverity.normal => const SeverityPalette(
      foreground: WheelSenseColors.success,
      background: Color(0xFFE8F7EE),
      border: Color(0xFFB8E3C8),
    ),
  };
}
