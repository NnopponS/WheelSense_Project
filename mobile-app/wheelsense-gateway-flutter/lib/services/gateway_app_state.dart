import 'package:flutter/widgets.dart';

import 'gateway_runtime_service.dart';

class GatewayServicesScope extends InheritedWidget {
  const GatewayServicesScope({
    super.key,
    required this.runtime,
    required super.child,
  });

  final GatewayRuntimeService runtime;

  static GatewayRuntimeService of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<GatewayServicesScope>();
    assert(scope != null, 'GatewayServicesScope was not found in context.');
    return scope!.runtime;
  }

  @override
  bool updateShouldNotify(GatewayServicesScope oldWidget) {
    return runtime != oldWidget.runtime;
  }
}
