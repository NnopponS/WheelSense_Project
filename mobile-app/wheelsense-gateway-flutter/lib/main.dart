import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'screens/operations_screen.dart';
import 'screens/overview_screen.dart';
import 'screens/pair_devices_screen.dart';
import 'screens/portal_webview_screen.dart';
import 'screens/server_setup_screen.dart';
import 'services/gateway_services.dart';
import 'theme/app_theme.dart';

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

  @override
  void initState() {
    super.initState();
    _localeController = GatewayLocaleController();
    unawaited(_localeController.load());
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
            theme: buildWheelSenseTheme(),
            locale: Locale(_localeController.language.code),
            supportedLocales: const [Locale('en'), Locale('th')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            home: GatewayShell(
              requestPermissionsOnOpen: widget.requestPermissionsOnOpen,
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
  const GatewayShell({super.key, this.requestPermissionsOnOpen = true});

  final bool requestPermissionsOnOpen;

  @override
  State<GatewayShell> createState() => _GatewayShellState();
}

class _GatewayShellState extends State<GatewayShell>
    with WidgetsBindingObserver {
  final GatewayRuntimeService _runtime = GatewayRuntimeService();
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.requestPermissionsOnOpen) {
      unawaited(_runtime.resumeGateway(autoStartBle: true));
    } else {
      unawaited(_runtime.loadConfig());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (widget.requestPermissionsOnOpen && state == AppLifecycleState.resumed) {
      unawaited(_runtime.resumeGateway(autoStartBle: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    final isWide = MediaQuery.sizeOf(context).width >= 860;
    final destinations = _destinations(strings);
    final activeDestination = destinations[_selectedIndex];

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
                        icon: Icon(destination.icon),
                        selectedIcon: Icon(destination.selectedIcon),
                        label: Text(destination.label),
                      ),
                  ],
                ),
              Expanded(
                child: activeDestination.fullBleed
                    ? activeDestination.screen
                    : Column(
                        children: [
                          _ShellHeader(
                            title: activeDestination.label,
                            compact: !isWide,
                          ),
                          Expanded(child: activeDestination.screen),
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
                      icon: Icon(destination.icon),
                      selectedIcon: Icon(destination.selectedIcon),
                      label: destination.label,
                    ),
                ],
              ),
      ),
    );
  }

  void _selectDestination(int index) {
    setState(() => _selectedIndex = index);
  }

  List<_ShellDestination> _destinations(GatewayStrings strings) {
    return <_ShellDestination>[
      _ShellDestination(
        label: strings.navOverview,
        icon: Icons.dashboard_outlined,
        selectedIcon: Icons.dashboard,
        screen: OverviewScreen(
          onOpenDevices: () => _selectDestination(1),
          onOpenSettings: () => _selectDestination(4),
          onStartGateway: () {
            unawaited(_runtime.resumeGateway(autoStartBle: true));
          },
        ),
      ),
      _ShellDestination(
        label: strings.navDevices,
        icon: Icons.sensors_outlined,
        selectedIcon: Icons.sensors,
        screen: const PairDevicesScreen(),
      ),
      _ShellDestination(
        label: strings.navOperations,
        icon: Icons.monitor_heart_outlined,
        selectedIcon: Icons.monitor_heart,
        screen: OperationsScreen(onOpenPortal: () => _selectDestination(3)),
      ),
      _ShellDestination(
        label: strings.navPortal,
        icon: Icons.web_asset_outlined,
        selectedIcon: Icons.web_asset,
        screen: const PortalWebViewScreen(),
        fullBleed: true,
      ),
      _ShellDestination(
        label: strings.navSettings,
        icon: Icons.tune_outlined,
        selectedIcon: Icons.tune,
        screen: const ServerSetupScreen(),
      ),
    ];
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _runtime.dispose();
    super.dispose();
  }
}

class _ShellDestination {
  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.screen,
    this.fullBleed = false,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget screen;
  final bool fullBleed;
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'WheelSense',
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0E7490), Color(0xFF22D3EE)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Image.asset(
              'assets/brand/logo.png',
              width: 30,
              height: 30,
              errorBuilder: (_, _, _) => Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShellHeader extends StatelessWidget {
  const _ShellHeader({required this.title, required this.compact});

  final String title;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      height: compact ? 64 : 72,
      padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 24),
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
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('WheelSense', style: theme.textTheme.labelLarge),
                Text(title, style: theme.textTheme.titleLarge),
              ],
            ),
          ),
          const _ConnectionPill(),
        ],
      ),
    );
  }
}

class _ConnectionPill extends StatelessWidget {
  const _ConnectionPill();

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
        return DecoratedBox(
          decoration: BoxDecoration(
            color: online
                ? colors.tertiaryContainer
                : colors.secondaryContainer,
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
                  color: online ? const Color(0xFF15803D) : colors.secondary,
                ),
                const SizedBox(width: 8),
                Text(_label(context, status.mode)),
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
