import { registerRootComponent } from 'expo';
import { defineWheelSenseBackgroundTasks } from './src/services/BackgroundRuntimeService';

import App from './App';

defineWheelSenseBackgroundTasks();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
