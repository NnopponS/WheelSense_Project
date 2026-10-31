import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/product_ui.dart';

class PortalWebViewScreen extends StatefulWidget {
  const PortalWebViewScreen({
    super.key,
    required this.darkMode,
    required this.onToggleTheme,
    this.onSettings,
  });

  final bool darkMode;
  final VoidCallback onToggleTheme;
  final VoidCallback? onSettings;

  @override
  State<PortalWebViewScreen> createState() => _PortalWebViewScreenState();
}

class _PortalWebViewScreenState extends State<PortalWebViewScreen> {
  WebViewController? _controller;
  StreamSubscription<GatewayConfig>? _configSubscription;
  String? _loadedPortalBaseUrl;
  (String, String)? _error;
  var _progress = 0;
  var _loadedInitialState = false;
  var _canGoBack = false;
  var _canGoForward = false;
  var _loadGeneration = 0;

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
    _loadGeneration++;
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

    return PopScope(
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) {
          await _controller?.goBack();
          await _updateNavigationState();
        }
      },
      child: Scaffold(
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
                    icon: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 16,
                    ),
                    onPressed: _canGoBack
                        ? () async {
                            await _controller?.goBack();
                            await _updateNavigationState();
                          }
                        : null,
                    tooltip: context.text.pick('Back', 'ย้อนกลับ'),
                  ),
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
                    onPressed: _canGoForward
                        ? () async {
                            await _controller?.goForward();
                            await _updateNavigationState();
                          }
                        : null,
                    tooltip: context.text.pick('Forward', 'ไปข้างหน้า'),
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    onPressed: () => unawaited(_load()),
                    tooltip: context.text.pick(
                      'Reload portal',
                      'โหลดพอร์ทัลใหม่',
                    ),
                  ),
                  Expanded(
                    child: Container(
                      height: 32,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppPalette.slate800
                            : AppPalette.slate200,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      alignment: Alignment.centerLeft,
                      child: Row(
                        children: [
                          const Icon(
                            Icons.language_rounded,
                            size: 12,
                            color: AppPalette.successBright,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _loadedPortalBaseUrl ?? 'WheelSense Care',
                              style: TextStyle(
                                fontSize: 11,
                                fontFamily: 'monospace',
                                color: isDark
                                    ? AppPalette.slate300
                                    : AppPalette.slate700,
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
                    tooltip: context.text.pick(
                      'Open in browser',
                      'เปิดในเบราว์เซอร์',
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      widget.darkMode
                          ? Icons.light_mode_outlined
                          : Icons.dark_mode_outlined,
                    ),
                    onPressed: widget.onToggleTheme,
                    tooltip: context.text.pick(
                      widget.darkMode
                          ? 'Switch to light mode'
                          : 'Switch to dark mode',
                      widget.darkMode
                          ? 'เปลี่ยนเป็นธีมสว่าง'
                          : 'เปลี่ยนเป็นธีมมืด',
                    ),
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
                      onSettings: widget.onSettings,
                      message: context.text.pick(_error!.$1, _error!.$2),
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
      ),
    );
  }

  Future<void> _load({GatewayConfig? config}) async {
    final generation = ++_loadGeneration;
    final runtime = GatewayServicesScope.of(context);
    final GatewayConfig effectiveConfig;
    try {
      effectiveConfig = config ?? await runtime.loadConfig();
    } on Object {
      if (mounted && generation == _loadGeneration) {
        setState(
          () => _error = (
            'Unable to read saved settings. Unlock your device and retry.',
            'อ่านการตั้งค่าที่บันทึกไว้ไม่ได้ ปลดล็อกอุปกรณ์แล้วลองอีกครั้ง',
          ),
        );
      }
      return;
    }
    if (!mounted || generation != _loadGeneration) return;
    final uri = GatewayWebViewService.portalUri(effectiveConfig.portalBaseUrl);
    if (uri == null ||
        effectiveConfig.portalBaseUrl ==
            GatewayConfig.defaults().portalBaseUrl) {
      setState(() {
        _controller = null;
        _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
        _error = ('Portal not configured', 'ยังไม่ตั้งค่าพอร์ทัล');
      });
      return;
    }
    setState(() {
      _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
      _error = null;
      _progress = 0;
    });
    try {
      final controller = await GatewayWebViewService().buildPortalController(
        effectiveConfig,
        onProgress: (progress) {
          if (mounted && generation == _loadGeneration) {
            setState(() => _progress = progress);
          }
        },
        onPageFinished: (_) => unawaited(_updateNavigationState()),
        onWebResourceError: (error) {
          if (mounted &&
              generation == _loadGeneration &&
              error.isForMainFrame == true) {
            setState(
              () => _error = ('Connection unavailable', 'เชื่อมต่อไม่ได้'),
            );
          }
        },
        onExternal: _launchExternal,
      );
      if (mounted && generation == _loadGeneration) {
        setState(() => _controller = controller);
      }
    } on Object {
      if (mounted && generation == _loadGeneration) {
        setState(
          () => _error = (
            'Care portal is unavailable on this device. Try opening it in your browser.',
            'พอร์ทัลไม่พร้อมใช้งานบนอุปกรณ์นี้ ลองเปิดในเบราว์เซอร์',
          ),
        );
      }
    }
  }

  Future<void> _openExternal() async {
    final url = _loadedPortalBaseUrl;
    final uri = url == null ? null : GatewayWebViewService.portalUri(url);
    if (uri == null) return;
    await _launchExternal(uri);
  }

  Future<void> _launchExternal(Uri uri) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Exception {
      opened = false;
    }
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.text.pick(
              'Could not open the browser.',
              'เปิดเบราว์เซอร์ไม่ได้',
            ),
          ),
        ),
      );
    }
  }
}

class _PortalFallback extends StatelessWidget {
  const _PortalFallback({
    required this.message,
    required this.onRetry,
    required this.onOpenExternal,
    this.onSettings,
  });
  final String message;
  final VoidCallback onRetry, onOpenExternal;
  final VoidCallback? onSettings;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ProductIcon(
              'care',
              size: 44,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                if (onSettings != null)
                  FilledButton.icon(
                    onPressed: onSettings,
                    icon: const ProductIcon(
                      'settings',
                      size: 18,
                      color: Colors.white,
                    ),
                    label: Text(t.navSettings),
                  ),
                OutlinedButton(
                  onPressed: onRetry,
                  child: Text(t.pick('Retry', 'ลองอีกครั้ง')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
