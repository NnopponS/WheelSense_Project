import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../models/gateway_config.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';

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
  var _canGoBack = false;
  var _canGoForward = false;

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

  Future<void> _updateNavigationState() async {
    if (_controller == null) return;
    final back = await _controller!.canGoBack();
    final forward = await _controller!.canGoForward();
    if (mounted) {
      setState(() {
        _canGoBack = back;
        _canGoForward = forward;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppPalette.slate950 : AppPalette.white,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? AppPalette.slate900 : AppPalette.slate50,
            border: Border(
              bottom: BorderSide(
                color: isDark ? AppPalette.slate800 : AppPalette.slate200,
              ),
            ),
          ),
          child: SafeArea(
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 16),
                  onPressed: _canGoBack ? () async {
                    await _controller?.goBack();
                    await _updateNavigationState();
                  } : null,
                  tooltip: 'Back',
                ),
                IconButton(
                  icon: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
                  onPressed: _canGoForward ? () async {
                    await _controller?.goForward();
                    await _updateNavigationState();
                  } : null,
                  tooltip: 'Forward',
                ),
                IconButton(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  onPressed: () => _controller?.reload(),
                  tooltip: 'Reload Portal',
                ),
                Expanded(
                  child: Container(
                    height: 32,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: isDark ? AppPalette.slate800 : AppPalette.slate200,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    alignment: Alignment.centerLeft,
                    child: Row(
                      children: [
                        const Icon(Icons.lock_rounded, size: 12, color: AppPalette.successBright),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            _loadedPortalBaseUrl ?? 'WheelSense Platform Portal',
                            style: TextStyle(
                              fontSize: 11,
                              fontFamily: 'monospace',
                              color: isDark ? AppPalette.slate300 : AppPalette.slate700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.open_in_new_rounded, size: 18),
                  onPressed: _openExternal,
                  tooltip: 'Open in Browser',
                ),
              ],
            ),
          ),
        ),
      ),
      body: Stack(
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
          if (_progress < 100 && _error == null)
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: LinearProgressIndicator(
                value: _progress / 100,
                backgroundColor: Colors.transparent,
                color: AppPalette.brand,
                minHeight: 2.5,
              ),
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
      if (!mounted) return;
      setState(() {
        _controller = null;
        _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
        _error = 'Invalid portal URL in settings.';
      });
      return;
    }

    final controller =
        GatewayWebViewService().buildPortalController(effectiveConfig)
          ..setNavigationDelegate(
            NavigationDelegate(
              onProgress: (progress) {
                if (mounted) setState(() => _progress = progress);
              },
              onPageFinished: (_) async {
                await _updateNavigationState();
              },
              onWebResourceError: (error) {
                if (mounted && error.isForMainFrame == true) {
                  setState(() {
                    _error = 'Unable to connect to WheelSense platform.';
                  });
                }
              },
            ),
          );

    if (!mounted) return;
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
    if (uri == null) return;
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open portal in external browser.')),
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
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 54, color: AppPalette.slate400),
              const SizedBox(height: 14),
              Text(
                'Platform Portal Offline',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
              if (portalBaseUrl != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppPalette.slate100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    portalBaseUrl!,
                    style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: AppPalette.slate800),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: onOpenExternal,
                    icon: const Icon(Icons.open_in_new_rounded),
                    label: const Text('Open Externally'),
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
