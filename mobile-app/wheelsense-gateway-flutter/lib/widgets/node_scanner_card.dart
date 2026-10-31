import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import 'product_ui.dart';

class NodeScannerCard extends StatelessWidget {
  const NodeScannerCard({super.key, required this.nodes, this.onRefresh});

  final List<NodeTsimcamSnapshot> nodes;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ProductSurface(
      padding: const EdgeInsets.only(top: 16, bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 8),
            child: ProductSectionHeading(
              title: 'Nearby nodes',
              subtitle: '${nodes.length} found',
              trailing: onRefresh == null
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.refresh_rounded, size: 20),
                      onPressed: onRefresh,
                      tooltip: 'Scan beacons',
                    ),
            ),
          ),
          if (nodes.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Column(
                children: [
                  Icon(
                    Icons.cell_tower_rounded,
                    size: 32,
                    color: theme.colorScheme.outline,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No nearby nodes found',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            )
          else
            for (final node in nodes) ...[
              if (node != nodes.first) const Divider(indent: 68),
              _NodeItemTile(node: node),
            ],
        ],
      ),
    );
  }
}

class _NodeItemTile extends StatelessWidget {
  const _NodeItemTile({required this.node});

  final NodeTsimcamSnapshot node;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final rssi = node.rssi;
    final bars = rssi >= -65
        ? 4
        : rssi >= -75
        ? 3
        : rssi >= -85
        ? 2
        : 1;
    final details = [
      if (node.deviceId != node.nodeId) node.deviceId,
      if (node.bleMac.isNotEmpty && node.bleMac != '—') node.bleMac,
      if (node.ipAddress != null) node.ipAddress!,
      if (node.batteryPercent != null) '${node.batteryPercent}%',
      if (node.streamEnabled) 'Streaming',
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          ProductIconBadge('scan', tint: colors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(node.nodeId, style: theme.textTheme.titleSmall),
                if (details.isNotEmpty)
                  Text(
                    details.join('  ·  '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$rssi dBm',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: 10),
          _SignalBars(
            bars: bars,
            color: bars >= 3
                ? colors.primary
                : bars == 2
                ? AppPalette.warning
                : colors.error,
            idle: colors.outlineVariant,
          ),
        ],
      ),
    );
  }
}

class _SignalBars extends StatelessWidget {
  const _SignalBars({
    required this.bars,
    required this.color,
    required this.idle,
  });

  final int bars;
  final Color color;
  final Color idle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (var i = 0; i < 4; i++) ...[
          if (i > 0) const SizedBox(width: 2),
          Container(
            width: 3,
            height: 5.0 + i * 3,
            decoration: BoxDecoration(
              color: i < bars ? color : idle,
              borderRadius: BorderRadius.circular(1),
            ),
          ),
        ],
      ],
    );
  }
}
