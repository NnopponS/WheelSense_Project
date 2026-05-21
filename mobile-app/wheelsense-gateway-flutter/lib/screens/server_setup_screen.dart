import 'dart:async';

import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

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
  GatewayStatus _status = GatewayStatus.initial();
  bool _loaded = false;
  bool _saving = false;

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
    return ClinicalPage(
      children: [
        ResponsiveGrid(
          children: [
            MetricTile(
              metric: MetricSnapshot(
                label: 'Portal endpoint',
                value: _hostLabel(_config.portalBaseUrl),
                detail: _config.portalBaseUrl,
                icon: Icons.cloud_done_outlined,
              ),
            ),
            MetricTile(
              metric: MetricSnapshot(
                label: 'MQTT broker',
                value: _status.mqttReady ? 'Connected' : 'Not connected',
                detail: '${_config.mqttHost}:${_config.mqttPort}',
                icon: Icons.hub_outlined,
                severity: _status.mqttReady
                    ? ClinicalSeverity.normal
                    : ClinicalSeverity.warning,
              ),
            ),
            MetricTile(
              metric: MetricSnapshot(
                label: 'Gateway mode',
                value: 'Production',
                detail: 'BLE gateway, no native login required',
                icon: Icons.security_outlined,
                severity: ClinicalSeverity.info,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SectionPanel(
          title: 'Server setup',
          subtitle:
              'Configure the portal and MQTT broker used by the mobile gateway.',
          child: Column(
            children: [
              TextField(
                controller: _portalController,
                decoration: const InputDecoration(
                  labelText: 'Portal base URL',
                  hintText: 'http://192.168.1.42:3000',
                  prefixIcon: Icon(Icons.link),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _mqttController,
                decoration: const InputDecoration(
                  labelText: 'MQTT broker',
                  hintText: 'mqtt://broker.emqx.io:1883',
                  prefixIcon: Icon(Icons.settings_ethernet),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _gatewayController,
                decoration: const InputDecoration(
                  labelText: 'Gateway ID',
                  hintText: 'ward-a-gateway-01',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _userController,
                      decoration: const InputDecoration(
                        labelText: 'MQTT username',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _passwordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'MQTT password',
                        prefixIcon: Icon(Icons.key_outlined),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _saving ? null : _testConnection,
                      icon: const Icon(Icons.wifi_find),
                      label: const Text('Test'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: const Icon(Icons.save_outlined),
                      label: Text(_saving ? 'Saving' : 'Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _load() async {
    final runtime = GatewayServicesScope.of(context);
    _configSubscription ??= runtime.configUpdates.listen(_applyRuntimeConfig);
    final config = await runtime.loadConfig();
    if (!mounted) {
      return;
    }
    setState(() {
      _config = config;
      _status = runtime.status;
      _portalController.text = config.portalBaseUrl;
      _mqttController.text =
          '${config.mqttUseTls ? 'mqtts' : 'mqtt'}://${config.mqttHost}:${config.mqttPort}';
      _gatewayController.text = config.deviceId;
      _userController.text = config.mqttUsername;
      _passwordController.text = config.mqttPassword;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final runtime = GatewayServicesScope.of(context);
    final next = _configFromInputs();
    await runtime.saveConfig(next);
    final status = await runtime.connectMqttConfigStream(config: next);
    final saved = await runtime.loadConfig();
    if (!mounted) {
      return;
    }
    setState(() {
      _config = saved;
      _status = status;
      _saving = false;
    });
    _show(status.message);
  }

  Future<void> _testConnection() async {
    setState(() => _saving = true);
    final runtime = GatewayServicesScope.of(context);
    final next = _configFromInputs();
    await runtime.saveConfig(next);
    final status = await runtime.bootstrap(config: next);
    final saved = await runtime.loadConfig();
    if (!mounted) {
      return;
    }
    setState(() {
      _config = saved;
      _status = status;
      _saving = false;
    });
    _show(status.message);
  }

  GatewayConfig _configFromInputs() {
    final mqtt = _parseMqtt(_mqttController.text.trim());
    return _config.copyWith(
      portalBaseUrl: _portalController.text.trim().isEmpty
          ? GatewayConfig.defaults().portalBaseUrl
          : _portalController.text.trim(),
      mqttHost: mqtt.$1,
      mqttPort: mqtt.$2,
      mqttUseTls: mqtt.$3,
      deviceId: _gatewayController.text.trim().isEmpty
          ? GatewayConfig.defaults().deviceId
          : _gatewayController.text.trim(),
      mqttUsername: _userController.text.trim(),
      mqttPassword: _passwordController.text,
    );
  }

  (String, int, bool) _parseMqtt(String value) {
    final defaults = GatewayConfig.defaults();
    final uri = Uri.tryParse(value.contains('://') ? value : 'mqtt://$value');
    if (uri == null || uri.host.isEmpty) {
      return (defaults.mqttHost, defaults.mqttPort, defaults.mqttUseTls);
    }
    final tls = uri.scheme == 'mqtts' || uri.scheme == 'ssl';
    return (uri.host, uri.hasPort ? uri.port : (tls ? 8883 : 1883), tls);
  }

  String _hostLabel(String url) {
    final uri = Uri.tryParse(url);
    return uri?.host.isNotEmpty == true ? uri!.host : url;
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
