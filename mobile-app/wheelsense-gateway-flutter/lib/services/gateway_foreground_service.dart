import 'dart:io';

import 'package:flutter/services.dart';

class GatewayForegroundService {
  static const MethodChannel _channel = MethodChannel(
    'app.wheelsense.gateway/foreground',
  );

  Future<bool> start() async {
    if (!Platform.isAndroid) {
      return false;
    }
    try {
      return await _channel.invokeMethod<bool>('start') ?? false;
    } on PlatformException {
      return false;
    }
  }

  Future<void> stop() async {
    if (!Platform.isAndroid) {
      return;
    }
    await _channel.invokeMethod<void>('stop');
  }
}
