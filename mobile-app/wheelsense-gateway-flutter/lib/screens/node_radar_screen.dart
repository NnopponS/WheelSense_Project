import 'dart:async';

import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/node_scanner_card.dart';
import '../widgets/product_ui.dart';
import 'tool_preview_readings.dart';

class NodeRadarScreen extends StatefulWidget {
  const NodeRadarScreen({super.key, this.previewAt});

  final DateTime? previewAt;

  @override
  State<NodeRadarScreen> createState() => _NodeRadarScreenState();
}

class _NodeRadarScreenState extends State<NodeRadarScreen> {
  StreamSubscription? _scanSub;
  var _isScanning = false;

  void _startScan(GatewayRuntimeService runtime, GatewayRuntimeSnapshot state) {
    if (_isScanning) return;
    setState(() => _isScanning = true);
    _scanSub?.cancel();
    _scanSub = runtime
        .scanCameraNodes(state.config)
        .listen(
          (_) {},
          onDone: () {
            if (mounted) setState(() => _isScanning = false);
          },
          onError: (_) {
            if (mounted) setState(() => _isScanning = false);
          },
        );
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    final theme = Theme.of(context);

    return ToolPreviewTicker(
      previewAt: widget.previewAt,
      builder: (context, now) {
        final time = now ?? DateTime.now();
        final preview = now == null ? null : PreviewMetrics.at(time);
        return StreamBuilder<GatewayRuntimeSnapshot>(
          stream: runtime.snapshots,
          initialData: runtime.snapshot,
          builder: (context, snapshot) {
            final state = snapshot.data ?? runtime.snapshot;
            final freshNodes = state.detectedNodes
                .where(
                  (node) => ToolPreviewReadings.isFresh(node.lastSeen, time),
                )
                .toList();
            final nodes = freshNodes.isNotEmpty || preview == null
                ? state.detectedNodes
                : ToolPreviewReadings.nodes(time, preview);
            final prediction = state.latestRoomPrediction;
            final predictionFresh = ToolPreviewReadings.isFresh(
              prediction?.timestamp,
              time,
            );
            final roomName = predictionFresh || preview == null
                ? prediction?.roomName ?? '—'
                : preview.currentLocation.roomName;
            final confidence = predictionFresh || preview == null
                ? prediction?.confidence
                : null;

            return Scaffold(
              appBar: AppBar(
                title: Text(context.text.pick('Node radar', 'เรดาร์โหนด')),
                actions: [
                  if (_isScanning)
                    IconButton(
                      icon: const Icon(
                        Icons.stop_rounded,
                        color: AppPalette.dangerBright,
                      ),
                      tooltip: 'Stop scan',
                      onPressed: () {
                        _scanSub?.cancel();
                        setState(() => _isScanning = false);
                      },
                    ),
                ],
              ),
              body: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Current room leads: it is what the nodes are for.
                    ProductSurface(
                      padding: const EdgeInsets.all(20),
                      child: Row(
                        children: [
                          ProductIconBadge(
                            'scan',
                            tint: theme.colorScheme.primary,
                            size: 44,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.text.pick(
                                    'Current room',
                                    'ห้องปัจจุบัน',
                                  ),
                                  style: theme.textTheme.labelMedium,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  roomName,
                                  style: theme.textTheme.headlineSmall,
                                ),
                              ],
                            ),
                          ),
                          if (confidence != null)
                            Text(
                              '${(confidence * 100).round()}%',
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: theme.colorScheme.primary,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Radar List Card
                    NodeScannerCard(
                      nodes: nodes,
                      onRefresh: _isScanning
                          ? null
                          : () => _startScan(runtime, state),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
