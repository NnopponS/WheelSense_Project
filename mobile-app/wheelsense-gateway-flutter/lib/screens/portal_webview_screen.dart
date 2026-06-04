import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
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
  String? _error;
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
            child: _error != null
                ? _PortalFallback(
                    portalBaseUrl: _loadedPortalBaseUrl,
                    message: _error!,
                    onRetry: () => unawaited(_load()),
                    onOpenExternal: _openExternal,
                  )
                : _controller == null
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
    final uri = Uri.tryParse(effectiveConfig.portalBaseUrl);
    if (uri == null ||
        uri.host.isEmpty ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      if (!mounted) {
        return;
      }
      setState(() {
        _controller = null;
        _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
        _error = 'Portal URL is invalid. Update it in Settings.';
      });
      return;
    }
    final controller =
        GatewayWebViewService().buildPortalController(
          effectiveConfig,
        )..setNavigationDelegate(
          NavigationDelegate(
            onProgress: (progress) {
              if (mounted) {
                setState(() => _progress = progress);
              }
            },
            onWebResourceError: (error) {
              if (mounted && error.isForMainFrame == true) {
                setState(() {
                  _error =
                      'Portal is unreachable. Check network or open externally.';
                });
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
      _error = null;
      _progress = 0;
    });
  }

  Future<void> _openExternal() async {
    final url = _loadedPortalBaseUrl;
    final uri = url == null ? null : Uri.tryParse(url);
    if (uri == null) {
      return;
    }
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open portal externally')),
      );
    }
  }
}

class _PortalFallback extends StatelessWidget {
  const _PortalFallback({
    required this.portalBaseUrl,
    required this.message,
    required this.onRetry,
    required this.onOpenExternal,
  });

  final String? portalBaseUrl;
  final String message;
  final VoidCallback onRetry;
  final VoidCallback onOpenExternal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.web_asset_off, size: 44),
              const SizedBox(height: 12),
              Text('Portal unavailable', style: theme.textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center),
              if (portalBaseUrl != null) ...[
                const SizedBox(height: 8),
                Text(portalBaseUrl!, style: theme.textTheme.labelMedium),
              ],
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry'),
                  ),
                  const SizedBox(width: 10),
                  FilledButton.icon(
                    onPressed: onOpenExternal,
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('Open externally'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
