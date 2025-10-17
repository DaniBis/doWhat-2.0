declare module 'react-native-webview' {
  import * as React from 'react';
  import type { ViewProps } from 'react-native';

  export type WebViewMessageEvent = {
    nativeEvent: {
      data: string;
    };
  };

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string; html?: string };
    onMessage?: (event: WebViewMessageEvent) => void;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    originWhitelist?: string[];
    startInLoadingState?: boolean;
    renderLoading?: () => React.ReactNode;
    allowsInlineMediaPlayback?: boolean;
  }

  export class WebView extends React.Component<WebViewProps> {}
}
