import { DevSettings, NativeModules, Platform } from 'react-native';

/**
 * Some QA environments run with the Expo dev client but we want the element inspector
 * toolbar hidden at all times so screenshots look like production. React Native exposes
 * the inspector toggle via an untyped DevSettings method; we defensively override it
 * so even if the user presses the "Inspect" button nothing happens.
 */
export const disableInspectorOverlay = (): void => {
  if (!__DEV__) {
    return;
  }

  const devSettings = DevSettings as unknown as {
    toggleElementInspector?: () => void;
    setIsDebuggingRemotely?: (enabled: boolean) => void;
  };

  if (devSettings?.toggleElementInspector) {
    devSettings.toggleElementInspector = () => {
      console.info('[devtools] Element inspector disabled for this build.');
    };
  }

  const nativeDevSettings = NativeModules?.DevSettings as {
    setElementInspectorEnabled?: (enabled: boolean) => void;
  } | undefined;

  nativeDevSettings?.setElementInspectorEnabled?.(false);

  if (Platform.OS === 'ios') {
    const devMenu = (NativeModules as unknown as {
      DevMenu?: {
        hide?: () => void;
      };
    }).DevMenu;
    devMenu?.hide?.();
  }
};

disableInspectorOverlay();
