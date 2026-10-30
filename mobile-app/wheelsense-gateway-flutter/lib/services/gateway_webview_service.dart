import 'package:webview_flutter/webview_flutter.dart';

import '../models/gateway_config.dart';

class GatewayWebViewService {
  static Uri? portalUri(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null || uri.host.isEmpty || uri.userInfo.isNotEmpty) return null;
    final loopback = const [
      'localhost',
      '127.0.0.1',
      '::1',
      '10.0.2.2',
    ].contains(uri.host);
    return uri.scheme == 'https' ||
            (uri.scheme == 'http' && (loopback || _isPrivateHost(uri.host)))
        ? uri
        : null;
  }

  /// RFC1918 / link-local hosts are treated like loopback: an on-prem portal at
  /// http://<LAN-IP>:3000 is trusted when the gateway is on the same network.
  static bool _isPrivateHost(String host) {
    final parts = host.split('.');
    if (parts.length != 4) return false;
    final octets = <int>[];
    for (final p in parts) {
      final n = int.tryParse(p);
      if (n == null || n < 0 || n > 255) return false;
      octets.add(n);
    }
    final a = octets[0];
    final b = octets[1];
    return a == 10 ||
        (a == 172 && b >= 16 && b <= 31) ||
        (a == 192 && b == 168) ||
        (a == 169 && b == 254);
  }

  static bool isTrustedNavigation(Uri base, String value) {
    final target = portalUri(value);
    return target != null && target.origin == base.origin;
  }

  Future<WebViewController> buildPortalController(
    GatewayConfig config, {
    required void Function(int) onProgress,
    required void Function(String) onPageFinished,
    required void Function(WebResourceError) onWebResourceError,
    required Future<void> Function(Uri) onExternal,
  }) async {
    final uri = portalUri(config.portalBaseUrl);
    if (uri == null) {
      throw const FormatException('A trusted HTTPS portal URL is required');
    }
    final controller = WebViewController();
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setMediaPlaybackRequiresUserGesture(false);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onProgress: onProgress,
        onPageFinished: onPageFinished,
        onWebResourceError: onWebResourceError,
        onNavigationRequest: (request) async {
          if (isTrustedNavigation(uri, request.url)) {
            return NavigationDecision.navigate;
          }
          final external = Uri.tryParse(request.url);
          if (request.isMainFrame &&
              external != null &&
              external.userInfo.isEmpty &&
              (external.scheme == 'https' || external.scheme == 'http')) {
            await onExternal(external);
          }
          return NavigationDecision.prevent;
        },
      ),
    );
    await controller.loadRequest(uri);
    return controller;
  }
}
