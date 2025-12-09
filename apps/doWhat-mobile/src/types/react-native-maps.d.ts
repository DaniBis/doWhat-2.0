declare module 'react-native-maps' {
  import type { ComponentType, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
  import type { ViewStyle } from 'react-native';

  export interface LatLng {
    latitude: number;
    longitude: number;
  }

  export interface MapViewProps {
    style?: ViewStyle;
    region?: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    };
    initialRegion?: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    };
    provider?: string;
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    loadingEnabled?: boolean;
    onPress?: (event: { nativeEvent?: { coordinate?: LatLng } }) => void;
    onLongPress?: (event: { nativeEvent?: { coordinate?: LatLng } }) => void;
    onRegionChangeComplete?: (region: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    }) => void;
    children?: ReactNode;
  }

  export interface MapViewHandle {
    animateCamera?: (
      options: { center: LatLng; zoom?: number; heading?: number; pitch?: number },
      config?: { duration?: number }
    ) => void;
    animateToRegion?: (
      region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
      duration?: number
    ) => void;
  }

  export interface MarkerProps {
    identifier?: string;
    coordinate: LatLng;
    onPress?: (event: any) => void;
    onCalloutPress?: () => void;
    tracksViewChanges?: boolean;
    children?: ReactNode;
  }

  export interface CalloutProps {
    tooltip?: boolean;
    children?: ReactNode;
    onPress?: () => void;
  }

  export interface CircleProps {
    center: LatLng;
    radius: number;
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
  }

  const MapView: ForwardRefExoticComponent<MapViewProps & RefAttributes<MapViewHandle>>;
  export default MapView;

  export const Marker: ComponentType<MarkerProps>;
  export const Circle: ComponentType<CircleProps>;
  export const Callout: ComponentType<CalloutProps>;
  export const PROVIDER_GOOGLE: string;
}
