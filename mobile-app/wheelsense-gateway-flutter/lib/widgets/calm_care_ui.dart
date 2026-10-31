import 'package:flutter/material.dart';

import '../theme/app_palette.dart';

/// Wellness components: charcoal and soft-blue cards, a pastel blue feature card,
/// pill filters and round icon buttons.

/// Charcoal card fill: deep in light mode, a raised warm grey in dark mode.
Color _charcoal(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? Theme.of(context).colorScheme.surfaceContainerHighest
    : AppPalette.sand900;

/// "Hello, name" with a bell (dot only when there is something to see) and a
/// round avatar button.
class CalmCareGreetingHeader extends StatelessWidget {
  const CalmCareGreetingHeader({
    super.key,
    required this.greeting,
    required this.hasAlerts,
    this.onBellTap,
    this.onAvatarTap,
    this.bellTooltip,
    this.avatarTooltip,
  });

  final String greeting;
  final bool hasAlerts;
  final VoidCallback? onBellTap;
  final VoidCallback? onAvatarTap;
  final String? bellTooltip;
  final String? avatarTooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Row(
      children: [
        Expanded(
          child: Text(
            greeting,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.displayMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 12),
        CalmCareRoundButton(
          tooltip: bellTooltip,
          onTap: onBellTap,
          border: colors.onSurface.withValues(alpha: 0.85),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(
                Icons.notifications_none_rounded,
                size: 21,
                color: colors.onSurface,
              ),
              if (hasAlerts)
                Positioned(
                  top: 11,
                  right: 12,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: colors.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        CalmCareAvatarButton(tooltip: avatarTooltip, onTap: onAvatarTap),
      ],
    );
  }
}

/// Round mint avatar that opens quick settings; the same on every tab.
class CalmCareAvatarButton extends StatelessWidget {
  const CalmCareAvatarButton({super.key, this.onTap, this.tooltip});

  final VoidCallback? onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return CalmCareRoundButton(
      tooltip: tooltip,
      onTap: onTap,
      fill: colors.primaryContainer,
      child: Icon(
        Icons.person_rounded,
        size: 22,
        color: colors.onPrimaryContainer,
      ),
    );
  }
}

/// Page header in the same voice as Home's greeting: a large bold title
/// with round actions on the right.
class CalmCarePageHeader extends StatelessWidget {
  const CalmCarePageHeader({
    super.key,
    required this.title,
    this.actions = const <Widget>[],
  });

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.displayMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        for (final action in actions) ...[const SizedBox(width: 10), action],
      ],
    );
  }
}

/// 44px round icon button: outlined, or filled when [fill] is given.
class CalmCareRoundButton extends StatelessWidget {
  const CalmCareRoundButton({
    super.key,
    required this.child,
    this.onTap,
    this.fill,
    this.border,
    this.tooltip,
  });

  final Widget child;
  final VoidCallback? onTap;
  final Color? fill;
  final Color? border;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final button = Material(
      color: fill ?? Colors.transparent,
      shape: CircleBorder(
        side: border == null
            ? BorderSide.none
            : BorderSide(color: border!, width: 1.4),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox.square(dimension: 44, child: child),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/// Search-bar shaped status pill: one line of live state and an icon.
class CalmCareStatusPill extends StatelessWidget {
  const CalmCareStatusPill({
    super.key,
    required this.label,
    required this.icon,
    this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Material(
      color: colors.surface,
      shape: const StadiumBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium,
                ),
              ),
              const SizedBox(width: 10),
              Icon(icon, size: 20, color: colors.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// One tile of [CalmCareSplitCards].
class CalmCareSplitItem {
  const CalmCareSplitItem({
    required this.icon,
    required this.text,
    this.label,
    this.onTap,
  });

  final IconData icon;
  final String text;

  /// Optional small caption above [text], e.g. "Bluetooth".
  final String? label;
  final VoidCallback? onTap;
}

/// Side-by-side charcoal and soft-blue cards, each an icon above a short line.
class CalmCareSplitCards extends StatelessWidget {
  const CalmCareSplitCards({
    super.key,
    required this.dark,
    required this.light,
  });

  final CalmCareSplitItem dark;
  final CalmCareSplitItem light;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _SplitCard(
              item: dark,
              fill: _charcoal(context),
              ink: isDark ? colors.onSurface : AppPalette.sand50,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _SplitCard(
              item: light,
              fill: isDark ? colors.primaryContainer : AppPalette.brandMist,
              ink: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _SplitCard extends StatelessWidget {
  const _SplitCard({required this.item, required this.fill, required this.ink});

  final CalmCareSplitItem item;
  final Color fill;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: fill,
      borderRadius: BorderRadius.circular(24),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: item.onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(item.icon, color: ink, size: 26),
              const SizedBox(height: 18),
              if (item.label != null) ...[
                Text(
                  item.label!,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: ink.withValues(alpha: 0.75),
                  ),
                ),
                const SizedBox(height: 2),
              ],
              Text(
                item.text,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.2,
                  color: ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Horizontal filter pills; the selected one is outlined with a leading dot.
class CalmCareFilterPills extends StatelessWidget {
  const CalmCareFilterPills({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelect,
  });

  final List<String> items;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Material(
              color: Colors.transparent,
              shape: StadiumBorder(
                side: i == selectedIndex
                    ? BorderSide(color: colors.onSurface, width: 1.2)
                    : BorderSide.none,
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onSelect(i),
                child: Container(
                  // 44px minimum touch target.
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Text(
                    i == selectedIndex ? '• ${items[i]}' : items[i],
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: i == selectedIndex
                          ? FontWeight.w600
                          : FontWeight.w500,
                      color: i == selectedIndex
                          ? colors.onSurface
                          : colors.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Pastel blue feature card: round play button, title, tags and a footer with
/// overlapping device icons and a count.
class CalmCareHeroCard extends StatelessWidget {
  const CalmCareHeroCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.tags,
    required this.footerText,
    required this.footerIcons,
    required this.footerCount,
    this.onPlayTap,
    this.playTooltip,
  });

  final String title;
  final String subtitle;
  final List<String> tags;
  final String footerText;
  final List<IconData> footerIcons;
  final String footerCount;
  final VoidCallback? onPlayTap;
  final String? playTooltip;

  @override
  Widget build(BuildContext context) {
    const fill = AppPalette.brandPastel;
    const ink = AppPalette.sand900;
    final soft = ink.withValues(alpha: 0.72);
    return Material(
      color: fill,
      borderRadius: BorderRadius.circular(26),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPlayTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Tooltip(
                    message: playTooltip ?? title,
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: const BoxDecoration(
                        color: AppPalette.brand,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.5,
                            color: ink,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          subtitle,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.35,
                            color: soft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.only(left: 60),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final tag in tags)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            tag,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: ink,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Divider(color: ink.withValues(alpha: 0.12)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      footerText,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: soft,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Device badge hugs the right corner; capped so long
                  // translations or large text shrink the count, not overflow.
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (footerIcons.isNotEmpty) ...[
                          SizedBox(
                            width: 20.0 * footerIcons.length + 10,
                            height: 30,
                            child: Stack(
                              children: [
                                for (var i = 0; i < footerIcons.length; i++)
                                  Positioned(
                                    left: 20.0 * i,
                                    child: Container(
                                      width: 30,
                                      height: 30,
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: fill,
                                          width: 2,
                                        ),
                                      ),
                                      child: Icon(
                                        footerIcons[i],
                                        size: 15,
                                        color: AppPalette.brandStrong,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Flexible(
                          child: Text(
                            footerCount,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: ink,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Secondary tile: charcoal round icon, title, one-line subtitle, chevron.
class CalmCareToolTile extends StatelessWidget {
  const CalmCareToolTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(24),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: _charcoal(context),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  icon,
                  size: 22,
                  color: isDark ? colors.onSurface : AppPalette.sand50,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-width charcoal pill button.
class CalmCarePillButton extends StatelessWidget {
  const CalmCarePillButton({
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
    final colors = Theme.of(context).colorScheme;
    final style = destructive
        ? FilledButton.styleFrom(
            backgroundColor: colors.error,
            foregroundColor: colors.onError,
          )
        : null;
    final text = Text(
      label,
      textAlign: TextAlign.center,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
    return SizedBox(
      width: double.infinity,
      child: icon == null
          ? FilledButton(onPressed: onPressed, style: style, child: text)
          : FilledButton.icon(
              onPressed: onPressed,
              style: style,
              icon: Icon(icon, size: 18),
              label: text,
            ),
    );
  }
}
