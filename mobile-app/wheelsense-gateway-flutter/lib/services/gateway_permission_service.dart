import 'dart:io';

import 'package:permission_handler/permission_handler.dart';

class GatewayPermissionResult {
  const GatewayPermissionResult({
    required this.bleGranted,
    required this.notificationGranted,
    required this.backgroundGranted,
    required this.statuses,
  });

  final bool bleGranted;
  final bool notificationGranted;
  final bool backgroundGranted;
  final Map<String, PermissionStatus> statuses;

  bool get ready => bleGranted && notificationGranted && backgroundGranted;
}

class GatewayPermissionService {
  Future<GatewayPermissionResult> requestRuntimePermissions() async {
    final permissions = _runtimePermissions();
    final statuses = <String, PermissionStatus>{};

    for (final permission in permissions.entries) {
      statuses[permission.key] = await permission.value.request();
    }

    return GatewayPermissionResult(
      bleGranted: _allGranted(statuses, _blePermissionKeys()),
      notificationGranted:
          statuses['notification']?.isGranted ?? !Platform.isAndroid,
      backgroundGranted:
          statuses['ignoreBatteryOptimizations']?.isGranted ?? true,
      statuses: statuses,
    );
  }

  Future<GatewayPermissionResult> checkRuntimePermissions() async {
    final permissions = _runtimePermissions();
    final statuses = <String, PermissionStatus>{};

    for (final permission in permissions.entries) {
      statuses[permission.key] = await permission.value.status;
    }

    return GatewayPermissionResult(
      bleGranted: _allGranted(statuses, _blePermissionKeys()),
      notificationGranted:
          statuses['notification']?.isGranted ?? !Platform.isAndroid,
      backgroundGranted:
          statuses['ignoreBatteryOptimizations']?.isGranted ?? true,
      statuses: statuses,
    );
  }

  bool hasBlockedRuntimePermission(GatewayPermissionResult result) {
    return result.statuses.values.any(
      (status) => status.isPermanentlyDenied || status.isRestricted,
    );
  }

  Future<bool> openPermissionSettings() {
    return openAppSettings();
  }

  Map<String, Permission> _runtimePermissions() {
    if (Platform.isAndroid) {
      return <String, Permission>{
        'bluetoothScan': Permission.bluetoothScan,
        'bluetoothConnect': Permission.bluetoothConnect,
        'locationWhenInUse': Permission.locationWhenInUse,
        'notification': Permission.notification,
        'ignoreBatteryOptimizations': Permission.ignoreBatteryOptimizations,
      };
    }

    if (Platform.isIOS) {
      return <String, Permission>{
        'bluetooth': Permission.bluetooth,
        'notification': Permission.notification,
      };
    }

    return const <String, Permission>{};
  }

  List<String> _blePermissionKeys() {
    if (Platform.isAndroid) {
      return const <String>[
        'bluetoothScan',
        'bluetoothConnect',
        'locationWhenInUse',
      ];
    }
    if (Platform.isIOS) {
      return const <String>['bluetooth'];
    }
    return const <String>[];
  }

  bool _allGranted(Map<String, PermissionStatus> statuses, List<String> keys) {
    if (keys.isEmpty) {
      return true;
    }
    return keys.every((key) => statuses[key]?.isGranted ?? false);
  }
}
