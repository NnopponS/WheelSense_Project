import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'screens/device_hub_screen.dart';
import 'screens/health_insights_screen.dart';
import 'screens/home_experience_screen.dart';
import 'screens/live_monitor_screen.dart';
import 'screens/node_radar_screen.dart';
import 'screens/pair_devices_screen.dart';
import 'screens/polar_studio_screen.dart';
import 'screens/portal_webview_screen.dart';
import 'screens/server_setup_screen.dart';
import 'services/gateway_services.dart';
import 'services/health_data_source.dart';
import 'theme/app_palette.dart';
import 'theme/app_theme.dart';
import 'widgets/product_ui.dart';

void main() {
  runApp(const WheelSenseGatewayApp());
}

class WheelSenseGatewayApp extends StatefulWidget {
  const WheelSenseGatewayApp({super.key, this.requestPermissionsOnOpen = true});

  final bool requestPermissionsOnOpen;

  @override
  State<WheelSenseGatewayApp> createState() => _WheelSenseGatewayAppState();
}

class _WheelSenseGatewayAppState extends State<WheelSenseGatewayApp> {
  late final GatewayLocaleController _localeController;
  static const _darkThemeKey = 'wheelsense.gateway.dark_theme.v1';
  var _darkMode = false;
  var _themeChanged = false;

  @override
  void initState() {
    super.initState();
    _localeController = GatewayLocaleController();
    unawaited(_localeController.load());
    unawaited(_loadThemePreference());
  }

  Future<void> _loadThemePreference() async {
    final darkMode =
        (await SharedPreferences.getInstance()).getBool(_darkThemeKey) ?? false;
    if (!mounted || _themeChanged) return;
    setState(() => _darkMode = darkMode);
  }

  void _toggleTheme() {
    _themeChanged = true;
    final darkMode = !_darkMode;
    setState(() => _darkMode = darkMode);
    unawaited(
      SharedPreferences.getInstance().then(
        (preferences) => preferences.setBool(_darkThemeKey, darkMode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GatewayLocaleScope(
      controller: _localeController,
      child: AnimatedBuilder(
        animation: _localeController,
        builder: (context, _) {
          return MaterialApp(
            onGenerateTitle: (context) => context.text.appTitle,
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: _darkMode ? ThemeMode.dark : ThemeMode.light,
            locale: Locale(_localeController.language.code),
            supportedLocales: const [Locale('en'), Locale('th')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            home: GatewayShell(
              requestPermissionsOnOpen: widget.requestPermissionsOnOpen,
              darkMode: _darkMode,
              onToggleTheme: _toggleTheme,
            ),
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _localeController.dispose();
    super.dispose();
  }
}

class MyApp extends WheelSenseGatewayApp {
  const MyApp({super.key});
}

class GatewayShell extends StatefulWidget {
  const GatewayShell({
    super.key,
    this.requestPermissionsOnOpen = true,
    required this.darkMode,
    required this.onToggleTheme,
  });

  final bool requestPermissionsOnOpen;
  final bool darkMode;
  final VoidCallback onToggleTheme;

  @override
  State<GatewayShell> createState() => _GatewayShellState();
}

class _GatewayShellState extends State<GatewayShell>
    with WidgetsBindingObserver {
  final GatewayRuntimeService _runtime = GatewayRuntimeService();
  final HealthDataSource _healthData = HealthDataSource();
  int _selectedIndex = 0;
  final Set<int> _visited = {0};
  DateTime? _previewAt = DateTime.now();
  Timer? _previewTicker;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _previewTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _previewAt = DateTime.now());
    });
    unawaited(_healthData.refresh());
    if (widget.requestPermissionsOnOpen) {
      unawaited(
        _runtime.resumeGateway(autoStartBle: true, requestPermissions: true),
      );
    } else {
      unawaited(_runtime.loadConfig());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPreviewTicker();
    } else {
      _previewTicker?.cancel();
      _previewTicker = null;
    }
    if (widget.requestPermissionsOnOpen && state == AppLifecycleState.resumed) {
      unawaited(_runtime.resumeGateway(autoStartBle: true));
    }
  }

  void _togglePreview() {
    if (_previewAt != null) {
      _previewTicker?.cancel();
      _previewTicker = null;
      setState(() => _previewAt = null);
      return;
    }
    setState(() => _previewAt = DateTime.now());
    _startPreviewTicker();
  }

  void _startPreviewTicker() {
    if (_previewAt == null || _previewTicker != null) return;
    setState(() => _previewAt = DateTime.now());
    _previewTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _previewAt = DateTime.now());
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    final isWide = MediaQuery.sizeOf(context).width >= 860;
    final destinations = _destinations(strings);

    return GatewayServicesScope(
      runtime: _runtime,
      child: Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              if (isWide)
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: _selectDestination,
                  extended: MediaQuery.sizeOf(context).width >= 1120,
                  labelType: MediaQuery.sizeOf(context).width >= 1120
                      ? NavigationRailLabelType.none
                      : NavigationRailLabelType.all,
                  leading: const Padding(
                    padding: EdgeInsets.only(top: 12, bottom: 8),
                    child: _BrandMark(),
                  ),
                  destinations: [
                    for (final destination in destinations)
                      NavigationRailDestination(
                        icon: ProductIcon(destination.icon),
                        selectedIcon: ProductIcon(destination.icon),
                        label: Text(destination.label),
                      ),
                  ],
                ),
              Expanded(
                child: IndexedStack(
                  index: _selectedIndex,
                  children: [
                    for (var index = 0; index < destinations.length; index++)
                      if (!_visited.contains(index))
                        const SizedBox.shrink()
                      else if (destinations[index].fullBleed)
                        destinations[index].screen
                      else
                        Column(
                          children: [
                            _ShellHeader(
                              title: destinations[index].label,
                              compact: !isWide,
                              previewAt: _previewAt,
                              onTogglePreview: _togglePreview,
                              darkMode: widget.darkMode,
                              onToggleTheme: widget.onToggleTheme,
                            ),
                            Expanded(child: destinations[index].screen),
                          ],
                        ),
                  ],
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: isWide
            ? null
            : NavigationBar(
                selectedIndex: _selectedIndex,
                onDestinationSelected: _selectDestination,
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: [
                  for (final destination in destinations)
                    NavigationDestination(
                      icon: ProductIcon(destination.icon),
                      selectedIcon: ProductIcon(destination.icon),
                      label: destination.label,
                    ),
                ],
              ),
      ),
    );
  }

  void _selectDestination(int index) {
    if (index < 0 || index > 3) return;
    setState(() {
      _visited.add(index);
      _selectedIndex = index;
    });
  }

  void _openDevicesFromTool() {
    Navigator.of(context).pop();
    _selectDestination(1);
  }

  void _openTool({required Widget screen, required String title}) {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) {
          return GatewayServicesScope(
            runtime: _runtime,
            child: Scaffold(
              appBar:
                  screen is LiveMonitorScreen ||
                      screen is NodeRadarScreen ||
                      screen is PolarStudioScreen
                  ? null
                  : AppBar(
                      title: Text(
                        screen is ServerSetupScreen
                            ? context.text.navSettings
                            : screen is PairDevicesScreen
                            ? context.text.navDevices
                            : title,
                      ),
                    ),
              body: SafeArea(child: screen),
            ),
          );
        },
      ),
    );
  }

  List<_ShellDestination> _destinations(GatewayStrings strings) {
    return <_ShellDestination>[
      _ShellDestination(
        label: strings.pick('Home', 'หน้าหลัก'),
        icon: 'home',
        screen: HomeExperienceScreen(
          previewAt: _previewAt,
          onDevices: () => _selectDestination(1),
          onHealth: () => _selectDestination(2),
          onPortal: () => _selectDestination(3),
          onSettings: () => _openTool(
            screen: const ServerSetupScreen(),
            title: strings.navSettings,
          ),
          onMonitor: () => _openTool(
            screen: LiveMonitorScreen(
              previewAt: _previewAt,
              onOpenDevices: _openDevicesFromTool,
            ),
            title: strings.navMonitor,
          ),
          onStartGateway: () {
            unawaited(_runtime.resumeGateway(autoStartBle: true));
          },
        ),
      ),
      _ShellDestination(
        label: strings.navDevices,
        icon: 'devices',
        screen: DeviceHubScreen(
          previewAt: _previewAt,
          healthData: _healthData,
          onHealth: () => _selectDestination(2),
          onManagePairing: () => _openTool(
            screen: PairDevicesScreen(previewAt: _previewAt),
            title: strings.navDevices,
          ),
          onMonitor: () => _openTool(
            screen: LiveMonitorScreen(
              previewAt: _previewAt,
              onOpenDevices: _openDevicesFromTool,
            ),
            title: strings.navMonitor,
          ),
          onPolarStudio: () => _openTool(
            screen: PolarStudioScreen(previewAt: _previewAt),
            title: strings.navPolarStudio,
          ),
          onNodeRadar: () => _openTool(
            screen: NodeRadarScreen(previewAt: _previewAt),
            title: strings.navNodeRadar,
          ),
          onSettings: () => _openTool(
            screen: const ServerSetupScreen(),
            title: strings.navSettings,
          ),
        ),
      ),
      _ShellDestination(
        label: strings.pick('Health', 'สุขภาพ'),
        icon: 'heart',
        screen: HealthInsightsScreen(
          previewAt: _previewAt,
          healthData: _healthData,
          onPolarStudio: () => _openTool(
            screen: PolarStudioScreen(previewAt: _previewAt),
            title: strings.navPolarStudio,
          ),
        ),
      ),
      _ShellDestination(
        label: strings.pick('Care', 'การดูแล'),
        icon: 'care',
        screen: PortalWebViewScreen(
          darkMode: widget.darkMode,
          onToggleTheme: widget.onToggleTheme,
          onSettings: () => _openTool(
            screen: const ServerSetupScreen(),
            title: strings.navSettings,
          ),
        ),
        fullBleed: true,
      ),
    ];
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _previewTicker?.cancel();
    _healthData.dispose();
    _runtime.dispose();
    super.dispose();
  }
}

class _ShellDestination {
  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.screen,
    this.fullBleed = false,
  });

  final String label;
  final String icon;
  final Widget screen;
  final bool fullBleed;
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    final logo = Theme.of(context).brightness == Brightness.dark
        ? 'assets/brand/WheelSensewhite.svg'
        : 'assets/brand/WheelSenseblack.svg';
    return Tooltip(
      message: 'WheelSense',
      child: SvgPicture.asset(
        logo,
        width: 76,
        height: 43,
        excludeFromSemantics: true,
      ),
    );
  }
}

class _ShellHeader extends StatelessWidget {
  const _ShellHeader({
    required this.title,
    required this.compact,
    required this.previewAt,
    required this.onTogglePreview,
    required this.darkMode,
    required this.onToggleTheme,
  });

  final String title;
  final bool compact;
  final DateTime? previewAt;
  final VoidCallback onTogglePreview;
  final bool darkMode;
  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      constraints: BoxConstraints(minHeight: compact ? 64 : 72),
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 24,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          bottom: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      child: Row(
        children: [
          if (compact) ...[const _BrandMark(), const SizedBox(width: 12)],
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          _PreviewControl(
            enabled: previewAt != null,
            onPressed: onTogglePreview,
          ),
          IconButton(
            tooltip: context.text.pick(
              darkMode ? 'Switch to light mode' : 'Switch to dark mode',
              darkMode ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด',
            ),
            onPressed: onToggleTheme,
            icon: Icon(
              darkMode ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
            ),
          ),
          PopupMenuButton<GatewayLanguage>(
            tooltip: context.text.pick('Change language', 'เปลี่ยนภาษา'),
            initialValue: context.gatewayLocale.language,
            onSelected: (language) =>
                unawaited(context.gatewayLocale.setLanguage(language)),
            itemBuilder: (context) => [
              for (final language in GatewayLanguage.values)
                PopupMenuItem<GatewayLanguage>(
                  value: language,
                  child: Text(language.label),
                ),
            ],
            child: Semantics(
              button: true,
              label: context.text.pick('Change language', 'เปลี่ยนภาษา'),
              child: SizedBox(
                width: 38,
                height: 40,
                child: Center(
                  child: Text(
                    context.gatewayLocale.language.code.toUpperCase(),
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
          ),
          _ConnectionPill(compact: compact),
        ],
      ),
    );
  }
}

class _PreviewControl extends StatelessWidget {
  const _PreviewControl({required this.enabled, required this.onPressed});

  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return IconButton(
      isSelected: enabled,
      onPressed: onPressed,
      tooltip: t.pick('Toggle preview data', 'สลับข้อมูลตัวอย่าง'),
      constraints: const BoxConstraints.tightFor(width: 40, height: 40),
      padding: EdgeInsets.zero,
      icon: ProductIcon(
        enabled ? 'eye' : 'eye-off',
        size: 20,
        color: enabled ? Theme.of(context).colorScheme.primary : null,
      ),
    );
  }
}

class _ConnectionPill extends StatelessWidget {
  const _ConnectionPill({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final runtime = GatewayServicesScope.of(context);

    return StreamBuilder<GatewayStatus>(
      stream: runtime.statuses,
      initialData: runtime.status,
      builder: (context, snapshot) {
        final status = snapshot.data ?? GatewayStatus.initial();
        final online = status.mode == GatewayConnectionMode.connected;
        if (compact || MediaQuery.textScalerOf(context).scale(1) > 1.3) {
          return Tooltip(
            message: _label(context, status.mode),
            child: ProductIcon(
              'cloud',
              color: online ? AppPalette.success : colors.secondary,
            ),
          );
        }
        return DecoratedBox(
          decoration: BoxDecoration(
            color: online
                ? colors.tertiaryContainer
                : colors.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.circle,
                  size: 10,
                  color: online ? AppPalette.success : colors.secondary,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _label(context, status.mode),
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _label(BuildContext context, GatewayConnectionMode mode) {
    return GatewayLocaleScope.stringsOf(context).modeLabel(mode);
  }
}
