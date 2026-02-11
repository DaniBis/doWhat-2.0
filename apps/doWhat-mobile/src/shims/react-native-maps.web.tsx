import { forwardRef, useImperativeHandle } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Region = LatLng & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapViewRef = {
  animateToRegion?: (region: Region, duration?: number) => void;
};

export type MapViewProps = ViewProps & {
  provider?: string;
  region?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  showsUserLocation?: boolean;
  loadingEnabled?: boolean;
};

export type MarkerProps = ViewProps & {
  coordinate: LatLng;
  onPress?: () => void;
  onCalloutPress?: () => void;
};

export type CalloutProps = ViewProps & {
  tooltip?: boolean;
};

export const PROVIDER_GOOGLE = 'google';

const MapView = forwardRef<MapViewRef, MapViewProps>(function WebMapView(
  { children, ...props },
  ref,
) {
  useImperativeHandle(ref, () => ({ animateToRegion: () => undefined }), []);
  return <View {...props}>{children}</View>;
});

export const Marker = ({ children, onPress, onCalloutPress, ...props }: MarkerProps) => (
  <Pressable
    {...props}
    onPress={() => {
      onPress?.();
      onCalloutPress?.();
    }}
  >
    {children}
  </Pressable>
);

export const Callout = ({ children, ...props }: CalloutProps) => <View {...props}>{children}</View>;

export default MapView;
