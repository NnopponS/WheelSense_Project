import 'dart:async';

import 'package:flutter/material.dart';

import 'screens/alerts_screen.dart';
import 'screens/gateway_status_screen.dart';
import 'screens/pair_devices_screen.dart';
import 'screens/portal_webview_screen.dart';
import 'screens/server_setup_screen.dart';
import 'services/gateway_services.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const WheelSenseGatewayApp());
}

class WheelSenseGatewayApp extends StatelessWidget {
  const WheelSenseGatewayApp({super.key, this.requestPermissionsOnOpen = true});

  final bool requestPermissionsOnOpen;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WheelSense',
      debugShowCheckedModeBanner: false,
      theme: buildWheelSenseTheme(),
      home: GatewayShell(requestPermissionsOnOpen: requestPermissionsOnOpen),
    );
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
  int _selectedIndex = 1;

  static const _destinations = <_ShellDestination>[
    _ShellDestination(
      label: 'Server',
      icon: Icons.dns_outlined,
      selectedIcon: Icons.dns,
      screen: ServerSetupScreen(),
    ),
    _ShellDestination(
      label: 'Sensors',
      icon: Icons.sensors_outlined,
      selectedIcon: Icons.sensors,
      screen: PairDevicesScreen(),
    ),
    _ShellDestination(
      label: 'Status',
      icon: Icons.monitor_heart_outlined,
      selectedIcon: Icons.monitor_heart,
      screen: GatewayStatusScreen(),
    ),
    _ShellDestination(
      label: 'Portal',
      icon: Icons.web_asset_outlined,
      selectedIcon: Icons.web_asset,
      screen: PortalWebViewScreen(),
      fullBleed: true,
    ),
    _ShellDestination(
      label: 'Alerts',
      icon: Icons.notifications_active_outlined,
      selectedIcon: Icons.notifications_active,
      screen: AlertsScreen(),
    ),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.requestPermissionsOnOpen) {
      unawaited(_runtime.requestPermissionsForAppOpen());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (widget.requestPermissionsOnOpen && state == AppLifecycleState.resumed) {
      unawaited(_runtime.requestPermissionsForAppOpen());
    }
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.sizeOf(context).width >= 860;
    final activeDestination = _destinations[_selectedIndex];

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
                    for (final destination in _destinations)
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
                  for (final destination in _destinations)
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
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
            Text(
              'WS',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.8,
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
                Text(_label(status.mode)),
              ],
            ),
          ),
        );
      },
    );
  }

  String _label(GatewayConnectionMode mode) {
    return switch (mode) {
      GatewayConnectionMode.connected => 'Relaying',
      GatewayConnectionMode.scanning => 'Scanning',
      GatewayConnectionMode.degraded => 'Degraded',
      GatewayConnectionMode.error => 'Error',
      GatewayConnectionMode.idle => 'Ready',
    };
  }
}
