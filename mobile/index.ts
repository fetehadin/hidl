import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/task-handler';

registerRootComponent(App);
// Android runs this headless (the app needn't be open) whenever the widget needs drawing.
registerWidgetTaskHandler(widgetTaskHandler);
