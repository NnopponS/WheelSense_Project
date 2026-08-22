import 'dart:async';

import 'package:flutter/material.dart';

import '../models/gateway_runtime_snapshot.dart';
import '../models/sensor_telemetry.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/node_scanner_card.dart';

class NodeRadarScreen extends StatefulWidget {
  const NodeRadarScreen({super.key});

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
    _scanSub = runtime.scanCameraNodes(state.config).listen(
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

    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        final nodes = state.detectedNodes;

        return Scaffold(
          backgroundColor: isDark ? AppPalette.slate950 : AppPalette.slate50,
          appBar: AppBar(
            title: const Row(
              children: [
                Icon(Icons.radar_rounded, size: 22, color: AppPalette.infoBright),
                SizedBox(width: 8),
                Text('Node_Tsimcam Beacon Radar'),
              ],
            ),
            actions: [
              IconButton(
                icon: Icon(
                  _isScanning ? Icons.stop_rounded : Icons.refresh_rounded,
                  color: _isScanning ? AppPalette.dangerBright : null,
                ),
                tooltip: _isScanning ? 'Stop Scan' : 'Scan for WSN_* Nodes',
                onPressed: () {
                  if (_isScanning) {
                    _scanSub?.cancel();
                    setState(() => _isScanning = false);
                  } else {
                    _startScan(runtime, state);
                  }
                },
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Info Banner
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppPalette.info.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppPalette.info.withValues(alpha: 0.25)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline_rounded, size: 20, color: AppPalette.infoBright),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Detects ESP32 T-SIMCam camera nodes (WSN_* prefix) via BLE beacon scanning and MQTT status discovery.',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? AppPalette.slate200 : AppPalette.slate800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Radar List Card
                NodeScannerCard(
                  nodes: nodes,
                  onRefresh: () => _startScan(runtime, state),
                ),
                const SizedBox(height: 16),

                // Localization RSSI Feed Details
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: isDark ? AppPalette.slate900 : AppPalette.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isDark ? AppPalette.slate800 : AppPalette.slate200,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Room Localization Integration',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Detected WSN_* node RSSI values are automatically aggregated and transmitted in the telemetry payload to the server room localization engine.',
                        style: theme.textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(Icons.room_rounded, size: 16, color: AppPalette.brand),
                          const SizedBox(width: 6),
                          Text(
                            'Active Room: ${state.latestRoomPrediction?.roomName ?? "Scanning..."}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppPalette.brand,
                            ),
                          ),
                          if (state.latestRoomPrediction?.confidence != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              '(${(state.latestRoomPrediction!.confidence * 100).toStringAsFixed(0)}% conf)',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppPalette.slate400 : AppPalette.slate600,
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
  }
}
