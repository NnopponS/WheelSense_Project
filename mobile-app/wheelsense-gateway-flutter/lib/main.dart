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
import 'widgets/calm_care_ui.dart';
import 'widgets/fall_alert_dialog.dart';
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
  StreamSubscription<FallAlertEvent>? _fallAlertSubscription;
  bool _fallDialogOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _previewTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _previewAt = DateTime.now());
    });
    _fallAlertSubscription = _runtime.fallAlerts.listen(_onFallAlert);
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
                      else if (destinations[index].fullBleed || index == 0)
                        destinations[index].screen
                      else
                        Column(
                          children: [
                            // Same header voice as Home: big title, avatar.
                            Padding(
                              padding: EdgeInsets.fromLTRB(
                                isWide ? 28 : 20,
                                12,
                                isWide ? 28 : 20,
                                8,
                              ),
                              child: CalmCarePageHeader(
                                title: destinations[index].label,
                                actions: [
                                  CalmCareAvatarButton(
                                    tooltip: strings.pick(
                                      'Quick settings',
                                      'ตั้งค่าด่วน',
                                    ),
                                    onTap: _openQuickSettings,
                                  ),
                                ],
                              ),
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
            : DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
                ),
                child: NavigationBar(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: _selectDestination,
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: [
                    for (final destination in destinations)
                      NavigationDestination(
                        icon: ProductIcon(destination.icon, size: 22),
                        selectedIcon: ProductIcon(destination.icon, size: 22),
                        label: destination.label,
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  void _onFallAlert(FallAlertEvent event) {
    if (!mounted) {
      return;
    }
    try {
      final strings = context.text;
      switch (event.kind) {
        case FallAlertKind.detected:
        case FallAlertKind.test:
          if (_fallDialogOpen) {
            return;
          }
          _fallDialogOpen = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) {
              _fallDialogOpen = false;
              return;
            }
            unawaited(
              FallAlertDialog.show(
                context,
                event,
                onImOk: () {
                  unawaited(_confirmWearerOk(event));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      behavior: SnackBarBehavior.floating,
                      backgroundColor: AppPalette.slate900,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      content: Row(
                        children: [
                          const Icon(
                            Icons.check_circle_rounded,
                            color: AppPalette.brandSoft,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              strings.pick(
                                "Fall alert dismissed · I'm OK confirmed",
                                'รับทราบและปิดการแจ้งเตือนแล้ว (ฉันปลอดภัย)',
                              ),
                              style: const TextStyle(
                                color: AppPalette.white,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ).whenComplete(() {
                _fallDialogOpen = false;
              }),
            );
          });
          break;
        case FallAlertKind.suspect:
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: AppPalette.warning,
              content: Text(
                strings.pick(
                  'Possible fall on ${event.deviceId} — cancel window open on device',
                  'อาจมีการล้มที่ ${event.deviceId} — อุปกรณ์กำลังรอยกเลิก',
                ),
                style: const TextStyle(color: AppPalette.slate950),
              ),
            ),
          );
          break;
        case FallAlertKind.canceled:
          if (_fallDialogOpen) {
            Navigator.of(context, rootNavigator: true).pop();
            _fallDialogOpen = false;
          }
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                strings.pick(
                  'Fall alert canceled',
                  'ยกเลิกแจ้งเตือนการล้มแล้ว',
                ),
              ),
            ),
          );
          break;
        case FallAlertKind.unknown:
          break;
      }
    } on Object {
      // A stray fall event must never crash the shell UI.
    }
  }

  Future<void> _confirmWearerOk(FallAlertEvent event) async {
    try {
      await _runtime.confirmWearerOk(event);
    } on Object {
      // Belt may be out of range; the dialog stays dismissible either way.
    }
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

  void _openQuickSettings() {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => GatewayServicesScope(
          runtime: _runtime,
          child: StatefulBuilder(
            builder: (context, setSheetState) => _QuickSettingsSheet(
              // Read through `widget`/state on every rebuild so the switches
              // follow the live values after a toggle.
              darkMode: widget.darkMode,
              previewOn: _previewAt != null,
              onToggleTheme: () {
                widget.onToggleTheme();
                setSheetState(() {});
              },
              onTogglePreview: () {
                _togglePreview();
                setSheetState(() {});
              },
              onSettings: () {
                Navigator.of(sheetContext).pop();
                _openTool(
                  screen: const ServerSetupScreen(),
                  title: context.text.navSettings,
                );
              },
              onCare: () {
                Navigator.of(sheetContext).pop();
                _selectDestination(3);
              },
            ),
          ),
        ),
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
          onQuickSettings: _openQuickSettings,
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
          onPairBelt: () => _openTool(
            screen: PairDevicesScreen(previewAt: _previewAt, initialTab: 1),
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
          onQuickSettings: _openQuickSettings,
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
    unawaited(_fallAlertSubscription?.cancel());
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
              color: online ? colors.primary : colors.onSurfaceVariant,
            ),
          );
        }
        return DecoratedBox(
          decoration: BoxDecoration(
            color: online
                ? colors.primaryContainer
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
                  online ? Icons.check_circle_rounded : Icons.cloud_off_rounded,
                  size: 14,
                  color: online
                      ? colors.onPrimaryContainer
                      : colors.onSurfaceVariant,
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

/// Home's quick settings: appearance, language, preview data and server
/// status, plus shortcuts to Settings and Care.
class _QuickSettingsSheet extends StatelessWidget {
  const _QuickSettingsSheet({
    required this.darkMode,
    required this.previewOn,
    required this.onToggleTheme,
    required this.onTogglePreview,
    required this.onSettings,
    required this.onCare,
  });

  final bool darkMode;
  final bool previewOn;
  final VoidCallback onToggleTheme;
  final VoidCallback onTogglePreview;
  final VoidCallback onSettings;
  final VoidCallback onCare;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.text;
    final locale = context.gatewayLocale;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.pick('Quick settings', 'ตั้งค่าด่วน'),
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            ProductSurface(
              background: theme.colorScheme.surfaceContainerLow,
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  _QuickRow(
                    icon: Icons.dark_mode_rounded,
                    label: t.pick('Dark mode', 'โหมดมืด'),
                    trailing: Tooltip(
                      message: t.pick(
                        darkMode
                            ? 'Switch to light mode'
                            : 'Switch to dark mode',
                        darkMode ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด',
                      ),
                      child: Switch(
                        value: darkMode,
                        onChanged: (_) => onToggleTheme(),
                      ),
                    ),
                  ),
                  const Divider(indent: 56),
                  _QuickRow(
                    icon: Icons.visibility_rounded,
                    label: t.pick('Preview data', 'ข้อมูลตัวอย่าง'),
                    trailing: Tooltip(
                      message: t.pick(
                        'Toggle preview data',
                        'สลับข้อมูลตัวอย่าง',
                      ),
                      child: Switch(
                        value: previewOn,
                        onChanged: (_) => onTogglePreview(),
                      ),
                    ),
                  ),
                  const Divider(indent: 56),
                  _QuickRow(
                    icon: Icons.cloud_rounded,
                    label: t.pick('Server', 'เซิร์ฟเวอร์'),
                    trailing: const _ConnectionPill(compact: false),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              t.pick('Language', 'ภาษา'),
              style: theme.textTheme.labelMedium,
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<GatewayLanguage>(
                showSelectedIcon: false,
                segments: [
                  for (final language in GatewayLanguage.values)
                    ButtonSegment<GatewayLanguage>(
                      value: language,
                      label: Text(language.label),
                    ),
                ],
                selected: {locale.language},
                onSelectionChanged: (selection) =>
                    unawaited(locale.setLanguage(selection.first)),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onSettings,
                    icon: const Icon(Icons.tune_rounded, size: 18),
                    label: Text(
                      t.navSettings,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onCare,
                    icon: const Icon(
                      Icons.volunteer_activism_rounded,
                      size: 18,
                    ),
                    label: Text(
                      t.pick('Care', 'การดูแล'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickRow extends StatelessWidget {
  const _QuickRow({
    required this.icon,
    required this.label,
    required this.trailing,
  });

  final IconData icon;
  final String label;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 56),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Row(
          children: [
            Icon(icon, size: 22, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 16),
            Expanded(child: Text(label, style: theme.textTheme.bodyLarge)),
            const SizedBox(width: 8),
            Flexible(
              child: Align(alignment: Alignment.centerRight, child: trailing),
            ),
          ],
        ),
      ),
    );
  }
}
