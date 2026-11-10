import { registerRootComponent } from 'expo';
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/task-handler';
import { WidgetSetup } from './src/widget/WidgetSetup';

registerRootComponent(App);
// Android runs this headless (the app needn't be open) whenever the widget needs drawing.
registerWidgetTaskHandler(widgetTaskHandler);
// The setup screen (countdowns and look) shown when a widget is added, or from "widget settings".
registerWidgetConfigurationScreen(WidgetSetup);
