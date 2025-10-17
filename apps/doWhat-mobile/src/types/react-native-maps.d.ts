declare module 'react-native-maps' {
  import type { ComponentType, ReactNode } from 'react';
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
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    onPress?: (event: { nativeEvent?: { coordinate?: LatLng } }) => void;
    onLongPress?: (event: { nativeEvent?: { coordinate?: LatLng } }) => void;
    children?: ReactNode;
  }

  export interface MapViewHandle {
    animateCamera?: (
      options: { center: LatLng; zoom?: number; heading?: number; pitch?: number },
      config?: { duration?: number }
    ) => void;
  }

  export interface MarkerProps {
    identifier?: string;
    coordinate: LatLng;
    onPress?: (event: any) => void;
    children?: ReactNode;
  }

  export interface CircleProps {
    center: LatLng;
    radius: number;
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
  }

  const MapView: ComponentType<MapViewProps>;
  export default MapView;

  export const Marker: ComponentType<MarkerProps>;
  export const Circle: ComponentType<CircleProps>;
}
