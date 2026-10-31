import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/gateway_services.dart';
import '../widgets/calm_care_ui.dart';
import '../widgets/product_ui.dart';

class PortalWebViewScreen extends StatefulWidget {
  const PortalWebViewScreen({
    super.key,
    required this.darkMode,
    required this.onToggleTheme,
    this.onSettings,
    this.onQuickSettings,
  });

  final bool darkMode;
  final VoidCallback onToggleTheme;
  final VoidCallback? onSettings;
  final VoidCallback? onQuickSettings;

  @override
  State<PortalWebViewScreen> createState() => _PortalWebViewScreenState();
}

class _PortalWebViewScreenState extends State<PortalWebViewScreen> {
  WebViewController? _controller;
  StreamSubscription<GatewayConfig>? _configSubscription;
  String? _loadedPortalBaseUrl;
  (String, String)? _error;
  var _loadedInitialState = false;
  var _canGoBack = false;
  var _loadGeneration = 0;

  /// True once the first portal page has rendered; until then a native
  /// loading screen covers the web view.
  var _pageReady = false;

  /// Set when the first page takes long; the loading screen then explains
  /// and offers a retry instead of sitting silent.
  var _slow = false;
  Timer? _slowTimer;
  Timer? _readyPoll;

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
  void didUpdateWidget(PortalWebViewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Keep the portal's light/dark theme in step with the app.
    if (oldWidget.darkMode != widget.darkMode && _controller != null) {
      unawaited(
        _controller!
            .runJavaScript(
              GatewayWebViewService.nativeFeelScript(dark: widget.darkMode),
            )
            .catchError((Object _) {}),
      );
    }
  }

  @override
  void dispose() {
    _loadGeneration++;
    _slowTimer?.cancel();
    _readyPoll?.cancel();
    _configSubscription?.cancel();
    super.dispose();
  }

  Future<void> _updateNavigationState() async {
    if (_controller == null) return;
    final back = await _controller!.canGoBack();
    if (mounted) {
      setState(() {
        _canGoBack = back;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.text;

    final portalUp = _controller != null && _error == null && _pageReady;

    return PopScope(
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) {
          await _controller?.goBack();
          await _updateNavigationState();
        }
      },
      child: Scaffold(
        body: Column(
          children: [
            // Once the portal is up its own top bar is the header, so the app
            // never stacks a second one above it.
            if (!portalUp)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: CalmCarePageHeader(
                  title: t.pick('Care', 'การดูแล'),
                  actions: [
                    CalmCareRoundButton(
                      tooltip: t.pick('Refresh', 'รีเฟรช'),
                      onTap: () => unawaited(_load()),
                      border: theme.colorScheme.onSurface.withValues(
                        alpha: 0.85,
                      ),
                      child: Icon(
                        Icons.refresh_rounded,
                        size: 21,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                    if (widget.onQuickSettings != null)
                      CalmCareAvatarButton(
                        tooltip: t.pick('Quick settings', 'ตั้งค่าด่วน'),
                        onTap: widget.onQuickSettings,
                      ),
                  ],
                ),
              ),
            Expanded(
              child: Stack(
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
                        ? const _PortalLoading(slow: false)
                        : WebViewWidget(controller: _controller!),
                  ),
                  // Native loading screen instead of a browser progress bar.
                  if (_controller != null && _error == null && !_pageReady)
                    Positioned.fill(
                      child: _PortalLoading(
                        slow: _slow,
                        onRetry: () => unawaited(_load()),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _waitUntilRendering(int generation) {
    _readyPoll?.cancel();
    _readyPoll = Timer.periodic(const Duration(milliseconds: 400), (
      timer,
    ) async {
      final controller = _controller;
      if (!mounted || generation != _loadGeneration || _pageReady) {
        timer.cancel();
        return;
      }
      if (controller == null) return;
      Object? state;
      try {
        state = await controller.runJavaScriptReturningResult(
          'document.readyState',
        );
      } on Object {
        return;
      }
      if (!'$state'.contains('loading') &&
          mounted &&
          generation == _loadGeneration) {
        timer.cancel();
        _slowTimer?.cancel();
        setState(() => _pageReady = true);
      }
    });
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
        _error = (
          'Care isn’t set up yet. Connect to your care server in Settings.',
          'ยังไม่ได้ตั้งค่าการดูแล เชื่อมต่อเซิร์ฟเวอร์ในการตั้งค่า',
        );
      });
      return;
    }
    setState(() {
      _loadedPortalBaseUrl = effectiveConfig.portalBaseUrl;
      _error = null;
      _pageReady = false;
      _slow = false;
    });
    _slowTimer?.cancel();
    _readyPoll?.cancel();
    _slowTimer = Timer(const Duration(seconds: 15), () {
      if (mounted && generation == _loadGeneration && !_pageReady) {
        setState(() => _slow = true);
      }
    });
    try {
      final controller = await GatewayWebViewService().buildPortalController(
        effectiveConfig,
        darkMode: widget.darkMode,
        background: Theme.of(context).scaffoldBackgroundColor,
        // The native loading screen replaces a percentage bar.
        onProgress: (_) {},
        onPageFinished: (_) {
          // Android can report "finished" for a redirect hop while the real
          // page is still loading, so wait until the document is rendering.
          if (!_pageReady) _waitUntilRendering(generation);
          unawaited(_updateNavigationState());
        },
        onWebResourceError: (error) {
          if (mounted &&
              generation == _loadGeneration &&
              error.isForMainFrame == true) {
            setState(
              () => _error = (
                'Can’t reach your care team right now. Check your connection.',
                'ติดต่อทีมดูแลไม่ได้ในขณะนี้ ตรวจสอบการเชื่อมต่อ',
              ),
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
            'Care isn’t available on this device right now.',
            'การดูแลยังไม่พร้อมใช้งานบนอุปกรณ์นี้',
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
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: ProductIcon(
                  'care',
                  size: 40,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
            const SizedBox(height: 20),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Text(
                message,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                if (onSettings != null)
                  FilledButton(
                    onPressed: onSettings,
                    child: Text(t.navSettings),
                  ),
                OutlinedButton(
                  onPressed: onRetry,
                  child: Text(t.pick('Try again', 'ลองอีกครั้ง')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PortalLoading extends StatelessWidget {
  const _PortalLoading({required this.slow, this.onRetry});

  final bool slow;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.text;
    return ColoredBox(
      color: theme.scaffoldBackgroundColor,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox.square(
                dimension: 32,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
              const SizedBox(height: 16),
              Text(
                slow
                    ? t.pick(
                        'Care is taking longer than usual to open.',
                        'การดูแลใช้เวลาเปิดนานกว่าปกติ',
                      )
                    : t.pick('Opening Care…', 'กำลังเปิดการดูแล…'),
                textAlign: TextAlign.center,
                style: slow
                    ? theme.textTheme.titleMedium
                    : theme.textTheme.bodyMedium,
              ),
              if (slow) ...[
                const SizedBox(height: 6),
                Text(
                  t.pick(
                    'The care server is responding slowly. You can keep waiting or try again.',
                    'เซิร์ฟเวอร์การดูแลตอบสนองช้า รอต่อหรือลองใหม่ได้',
                  ),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium,
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 18),
                  OutlinedButton(
                    onPressed: onRetry,
                    child: Text(t.pick('Try again', 'ลองอีกครั้ง')),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
