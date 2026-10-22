import 'dart:async';

import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/node_scanner_card.dart';
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
    final isDark = theme.brightness == Brightness.dark;

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
              backgroundColor: isDark
                  ? AppPalette.slate950
                  : AppPalette.slate50,
              appBar: AppBar(
                toolbarHeight: MediaQuery.textScalerOf(context).scale(28) + 28,
                title: const Row(
                  children: [
                    Icon(
                      Icons.radar_rounded,
                      size: 22,
                      color: AppPalette.infoBright,
                    ),
                    SizedBox(width: 8),
                    Expanded(child: Text('Node radar')),
                  ],
                ),
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
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Radar List Card
                    NodeScannerCard(
                      nodes: nodes,
                      onRefresh: _isScanning
                          ? null
                          : () => _startScan(runtime, state),
                    ),
                    const SizedBox(height: 16),

                    // Localization RSSI Feed Details
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark ? AppPalette.slate900 : AppPalette.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isDark
                              ? AppPalette.slate800
                              : AppPalette.slate200,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.text.pick('Current room', 'ห้องปัจจุบัน'),
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(
                                Icons.room_rounded,
                                size: 16,
                                color: AppPalette.brand,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  roomName,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppPalette.brand,
                                  ),
                                ),
                              ),
                              if (confidence != null) ...[
                                const SizedBox(width: 8),
                                Text(
                                  '${(confidence * 100).round()}%',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isDark
                                        ? AppPalette.slate400
                                        : AppPalette.slate600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
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
