import 'dart:ui' show Color;

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
    return uri.scheme == 'https' || (uri.scheme == 'http' && loopback)
        ? uri
        : null;
  }

  static bool isTrustedNavigation(Uri base, String value) {
    final target = portalUri(value);
    return target != null && target.origin == base.origin;
  }

  /// Makes the portal read as part of the app instead of a web page: hides
  /// the portal's own bottom bar (the app already has one), drops browser
  /// tells (tap highlight, long-press text selection outside inputs,
  /// scrollbars, overscroll bounce) and applies the app's light/dark theme
  /// through the portal's next-themes storage key.
  static String nativeFeelScript({required bool dark}) {
    final theme = dark ? 'dark' : 'light';
    return '''
(function () {
  var css = [
    '.ws-role-mobile-nav{display:none!important}',
    ':root{--ws-mobile-bottom-bar:0.75rem!important}',
    'html,body{overscroll-behavior:none}',
    '*{-webkit-tap-highlight-color:transparent}',
    'body :not(input):not(textarea):not(select):not([contenteditable]){-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    'html{scrollbar-width:none}',
    '::-webkit-scrollbar{display:none}'
  ].join('');
  var style = document.getElementById('ws-app-embed');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ws-app-embed';
    document.head.appendChild(style);
  }
  style.textContent = css;
  try { localStorage.setItem('theme', '$theme'); } catch (e) {}
  var root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add('$theme');
  root.style.colorScheme = '$theme';
})();
''';
  }

  Future<WebViewController> buildPortalController(
    GatewayConfig config, {
    required bool darkMode,
    required Color background,
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
    // No white flash while loading, and no browser-style pinch zoom.
    await controller.setBackgroundColor(background);
    await controller.enableZoom(false);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onProgress: onProgress,
        onPageFinished: (url) async {
          try {
            await controller.runJavaScript(nativeFeelScript(dark: darkMode));
          } on Object {
            // Styling is cosmetic; never block the page over it.
          }
          onPageFinished(url);
        },
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
