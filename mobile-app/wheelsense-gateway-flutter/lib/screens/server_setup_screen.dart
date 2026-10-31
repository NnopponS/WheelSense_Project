import 'dart:async';

import 'package:flutter/material.dart';
import '../models/gateway_ui_models.dart' show ClinicalSeverity;

import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';
import '../widgets/product_ui.dart';

class ServerSetupScreen extends StatefulWidget {
  const ServerSetupScreen({super.key});

  @override
  State<ServerSetupScreen> createState() => _ServerSetupScreenState();
}

class _ServerSetupScreenState extends State<ServerSetupScreen> {
  final _portalController = TextEditingController();
  final _mqttController = TextEditingController();
  final _gatewayController = TextEditingController();
  final _userController = TextEditingController();
  final _passwordController = TextEditingController();
  StreamSubscription<GatewayConfig>? _configSubscription;

  GatewayConfig _config = GatewayConfig.defaults();
  bool _loaded = false;
  bool _saving = false;
  String? _formError;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded) {
      return;
    }
    _loaded = true;
    _load();
  }

  @override
  void dispose() {
    _configSubscription?.cancel();
    _portalController.dispose();
    _mqttController.dispose();
    _gatewayController.dispose();
    _userController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    final localeController = context.gatewayLocale;
    final theme = Theme.of(context);
    return ProductPage(
      children: [
        _SettingsSection(
          title: strings.settingsLanguageTitle,
          child: SizedBox(
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
              selected: {localeController.language},
              onSelectionChanged: (selection) {
                unawaited(localeController.setLanguage(selection.first));
              },
            ),
          ),
        ),
        const SizedBox(height: 16),
        _SettingsSection(
          title: strings.settingsServerTitle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _LabeledField(
                label: strings.settingsPortalBaseUrl,
                controller: _portalController,
                hint: 'https://portal.wheelsense.example',
                icon: Icons.link_rounded,
                keyboardType: TextInputType.url,
              ),
              _LabeledField(
                label: strings.settingsMqttBroker,
                controller: _mqttController,
                hint: 'mqtts://mqtt.wheelsense.example:8883',
                icon: Icons.dns_rounded,
                keyboardType: TextInputType.url,
              ),
              _LabeledField(
                label: strings.settingsGatewayId,
                controller: _gatewayController,
                hint: 'ward-a-gateway-01',
                icon: Icons.badge_rounded,
              ),
              _LabeledField(
                label: strings.mqttUsername,
                controller: _userController,
                icon: Icons.person_outline_rounded,
              ),
              _LabeledField(
                label: strings.mqttPassword,
                controller: _passwordController,
                icon: Icons.key_rounded,
                obscure: true,
              ),
              if (_formError != null) ...[
                CompactRowCard(
                  icon: Icons.error_outline_rounded,
                  title: strings.settingsNeedAttention,
                  subtitle: _formError!,
                  meta: strings.fix,
                  severity: ClinicalSeverity.warning,
                ),
                const SizedBox(height: 14),
              ],
              const SizedBox(height: 4),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? strings.saving : strings.save),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _saving ? null : _testConnection,
                icon: const Icon(Icons.wifi_find_rounded, size: 18),
                label: Text(strings.test),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Developer shortcuts stay available but quiet.
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 4,
          children: [
            TextButton.icon(
              onPressed: _saving ? null : _applyLocalPreset,
              icon: const Icon(Icons.developer_mode_rounded, size: 18),
              label: Text(strings.settingsLocalPreset),
              style: TextButton.styleFrom(
                foregroundColor: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            TextButton.icon(
              onPressed: _saving ? null : _reset,
              icon: const Icon(Icons.restart_alt_rounded, size: 18),
              label: Text(strings.reset),
              style: TextButton.styleFrom(
                foregroundColor: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _load() async {
    final runtime = GatewayServicesScope.of(context);
    _configSubscription ??= runtime.configUpdates.listen(_applyRuntimeConfig);
    try {
      final config = await runtime.loadConfig();
      if (!mounted) {
        return;
      }
      setState(() {
        _config = config;
        _portalController.text = config.portalBaseUrl;
        _mqttController.text =
            '${config.mqttUseTls ? 'mqtts' : 'mqtt'}://${config.mqttHost}:${config.mqttPort}';
        _gatewayController.text = config.deviceId;
        _userController.text = config.mqttUsername;
        _passwordController.text = config.mqttPassword;
      });
    } on Object {
      if (mounted) {
        setState(
          () => _formError = context.text.pick(
            'Unable to read saved credentials. Unlock your device and retry.',
            'อ่านข้อมูลเข้าสู่ระบบไม่ได้ ปลดล็อกอุปกรณ์แล้วลองอีกครั้ง',
          ),
        );
      }
    }
  }

  Future<void> _save({bool testConnection = false}) async {
    final next = _validatedConfigFromInputs();
    if (next == null) {
      return;
    }
    setState(() => _saving = true);
    final runtime = GatewayServicesScope.of(context);
    try {
      await runtime.saveConfig(next);
      final status = testConnection
          ? await runtime.bootstrap(config: next)
          : await runtime.connectMqttConfigStream(config: next);
      final saved = await runtime.loadConfig();
      if (!mounted) {
        return;
      }
      setState(() {
        _config = saved;
        _saving = false;
        _formError = null;
      });
      _show(status.message);
    } on Object {
      if (mounted) {
        setState(() {
          _saving = false;
          _formError = context.text.pick(
            'Unable to save or connect. Check device storage and server settings.',
            'บันทึกหรือเชื่อมต่อไม่ได้ ตรวจสอบพื้นที่จัดเก็บและการตั้งค่าเซิร์ฟเวอร์',
          );
        });
      }
    }
  }

  Future<void> _testConnection() => _save(testConnection: true);

  GatewayConfig? _validatedConfigFromInputs() {
    final result = buildGatewayConfigFromSetupForm(
      current: _config,
      portalInput: _portalController.text,
      mqttInput: _mqttController.text,
      gatewayIdInput: _gatewayController.text,
      usernameInput: _userController.text,
      passwordInput: _passwordController.text,
    );
    if (!result.isValid) {
      setState(() => _formError = _localizedFormError(result.error));
      return null;
    }
    return result.config;
  }

  Future<void> _applyLocalPreset() async {
    setState(() {
      _portalController.text = 'http://localhost:3000';
      _mqttController.text = 'mqtt://broker.emqx.io:1883';
      _userController.text = '';
      _passwordController.text = '';
      _formError = context.text.settingsLocalPresetWarning;
    });
  }

  String? _localizedFormError(String? error) {
    if (error == null) {
      return null;
    }
    final strings = context.text;
    if (error.contains('Portal URL')) {
      return strings.portalUrlInvalid;
    }
    if (error.contains('MQTT broker')) {
      return strings.mqttUrlInvalid;
    }
    return error;
  }

  Future<void> _reset() async {
    // Reset server settings only; keep this phone's identity and setup so
    // paired sensors keep reconnecting (fall alerts depend on it).
    final defaults = GatewayConfig.defaults().copyWith(
      deviceId: _config.deviceId,
      setupCompleted: _config.setupCompleted,
    );
    final runtime = GatewayServicesScope.of(context);
    await runtime.saveConfig(defaults);
    if (!mounted) {
      return;
    }
    setState(() {
      _config = defaults;
      _portalController.text = defaults.portalBaseUrl;
      _mqttController.text =
          '${defaults.mqttUseTls ? 'mqtts' : 'mqtt'}://${defaults.mqttHost}:${defaults.mqttPort}';
      _gatewayController.text = defaults.deviceId;
      _userController.text = defaults.mqttUsername;
      _passwordController.text = defaults.mqttPassword;
      _formError = null;
    });
  }

  void _applyRuntimeConfig(GatewayConfig config) {
    if (!mounted) {
      return;
    }
    setState(() {
      _config = config;
      _portalController.text = config.portalBaseUrl;
      _mqttController.text =
          '${config.mqttUseTls ? 'mqtts' : 'mqtt'}://${config.mqttHost}:${config.mqttPort}';
      _gatewayController.text = config.deviceId;
      _userController.text = config.mqttUsername;
      _passwordController.text = config.mqttPassword;
    });
  }

  void _show(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ProductSurface(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

/// Label above the field, so prefilled values never collide with it.
class _LabeledField extends StatelessWidget {
  const _LabeledField({
    required this.label,
    required this.controller,
    required this.icon,
    this.hint,
    this.obscure = false,
    this.keyboardType,
  });

  final String label;
  final TextEditingController controller;
  final IconData icon;
  final String? hint;
  final bool obscure;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(label, style: theme.textTheme.labelMedium),
          ),
          TextField(
            controller: controller,
            obscureText: obscure,
            keyboardType: keyboardType,
            autocorrect: false,
            decoration: InputDecoration(
              hintText: hint,
              prefixIcon: Icon(icon, size: 20),
              fillColor: theme.colorScheme.surfaceContainerLow,
            ),
          ),
        ],
      ),
    );
  }
}
