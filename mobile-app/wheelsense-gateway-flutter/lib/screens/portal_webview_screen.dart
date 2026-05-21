import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/gateway_services.dart';

class PortalWebViewScreen extends StatefulWidget {
  const PortalWebViewScreen({super.key});

  @override
  State<PortalWebViewScreen> createState() => _PortalWebViewScreenState();
}

class _PortalWebViewScreenState extends State<PortalWebViewScreen> {
  WebViewController? _controller;
  StreamSubscription<GatewayConfig>? _configSubscription;
  String? _loadedPortalBaseUrl;
  var _progress = 0;
  var _loadedInitialState = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loadedInitialState) {
      return;
    }
    _loadedInitialState = true;
    final runtime = GatewayServicesScope.of(context);
    _configSubscription = runtime.configUpdates.listen((config) {
      if (config.portalBaseUrl != _loadedPortalBaseUrl) {
        unawaited(_load(config: config));
      }
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _configSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white,
      child: Stack(
        children: [
          Positioned.fill(
            child: _controller == null
                ? const Center(child: CircularProgressIndicator())
                : WebViewWidget(controller: _controller!),
          ),
          if (_progress < 100)
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: LinearProgressIndicator(value: _progress / 100),
            ),
        ],
      ),
    );
  }

  Future<void> _load({GatewayConfig? config}) async {
    final runtime = GatewayServicesScope.of(context);
    final effectiveConfig = config ?? await runtime.loadConfig();
    final controller =
        GatewayWebViewService().buildPortalController(effectiveConfig)
          ..setNavigationDelegate(
            NavigationDelegate(
              onProgress: (progress) {
                if (mounted) {
                  setState(() => _progress = progress);
                }
              },
            ),
          );
    if (!mounted) {
      return;
    }
    setState(() {
      _controller = controller;
      _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
      _progress = 0;
    });
  }
}
