/**
 * Android 14+: declare foregroundServiceType for react-native-background-actions service
 * (BLE + MQTT). Ensures the service entry exists with correct type flags.
 */
const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const BG_SERVICE_CLASS = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

module.exports = function withRNBackgroundActionsForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    let services = mainApplication.service;
    const list = services ? (Array.isArray(services) ? services : [services]) : [];

    let found = false;
    for (const service of list) {
      const name = service.$['android:name'];
      if (
        name === BG_SERVICE_CLASS ||
        name === '.RNBackgroundActionsTask' ||
        (typeof name === 'string' && name.includes('RNBackgroundActionsTask'))
      ) {
        service.$['android:foregroundServiceType'] = 'connectedDevice|dataSync';
        if (service.$['android:exported'] === undefined) {
          service.$['android:exported'] = 'false';
        }
        found = true;
      }
    }

    if (!found) {
      list.push({
        $: {
          'android:name': BG_SERVICE_CLASS,
          'android:foregroundServiceType': 'connectedDevice|dataSync',
          'android:exported': 'false',
        },
      });
    }

    mainApplication.service = list.length === 1 ? list[0] : list;
    return config;
  });
};
