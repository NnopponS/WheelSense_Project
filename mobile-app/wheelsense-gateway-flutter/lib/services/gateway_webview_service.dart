import 'package:webview_flutter/webview_flutter.dart';

import '../models/gateway_config.dart';

class GatewayWebViewService {
  WebViewController buildPortalController(GatewayConfig config) {
    final uri = Uri.parse(config.portalBaseUrl);
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            final requestedUri = Uri.tryParse(request.url);
            if (requestedUri == null) {
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(uri);

    return controller;
  }
}
