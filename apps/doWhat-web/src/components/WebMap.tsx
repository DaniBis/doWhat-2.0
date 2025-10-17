"use client";

import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapLayerMouseEvent, MapRef, ViewStateChangeEvent } from "react-map-gl";
import Map, { Layer, NavigationControl, Popup, Source } from "react-map-gl";
import type { LayerProps } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  activitiesToFeatureCollection,
  DEFAULT_RADIUS_METERS,
  MAPBOX_CLUSTER_COLORS,
  MAPBOX_CLUSTER_COUNT_FONT,
  MAPBOX_CLUSTER_COUNT_TEXT_COLOR,
  MAPBOX_CLUSTER_COUNT_TEXT_SIZE,
  MAPBOX_CLUSTER_RADII,
  MAPBOX_CLUSTER_THRESHOLDS,
  MAPBOX_POINT_COLOR,
  MAPBOX_POINT_RADIUS,
  MAPBOX_POINT_STROKE_COLOR,
  MAPBOX_POINT_STROKE_WIDTH,
  MAPBOX_STYLE_URL,
  type MapActivity,
  type MapCoordinates,
} from "@dowhat/shared";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  '';

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "activities",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      MAPBOX_CLUSTER_COLORS[0],
      MAPBOX_CLUSTER_THRESHOLDS[0],
      MAPBOX_CLUSTER_COLORS[1],
      MAPBOX_CLUSTER_THRESHOLDS[1],
      MAPBOX_CLUSTER_COLORS[2],
    ],
    "circle-radius": [
      "step",
      ["get", "point_count"],
      MAPBOX_CLUSTER_RADII[0],
      MAPBOX_CLUSTER_THRESHOLDS[0],
      MAPBOX_CLUSTER_RADII[1],
      MAPBOX_CLUSTER_THRESHOLDS[1],
      MAPBOX_CLUSTER_RADII[2],
    ],
    "circle-stroke-width": MAPBOX_POINT_STROKE_WIDTH,
    "circle-stroke-color": MAPBOX_POINT_STROKE_COLOR,
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "activities",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": MAPBOX_CLUSTER_COUNT_FONT as unknown as string[],
    "text-size": MAPBOX_CLUSTER_COUNT_TEXT_SIZE,
  },
  paint: {
    "text-color": MAPBOX_CLUSTER_COUNT_TEXT_COLOR,
  },
};

const pointLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "activities",
  filter: ["!has", "point_count"],
  paint: {
    "circle-color": MAPBOX_POINT_COLOR,
    "circle-radius": MAPBOX_POINT_RADIUS,
    "circle-stroke-color": MAPBOX_POINT_STROKE_COLOR,
    "circle-stroke-width": MAPBOX_POINT_STROKE_WIDTH,
  },
};

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

type MapViewState = {
  latitude: number;
  longitude: number;
  zoom: number;
};

type Props = {
  center: MapCoordinates;
  activities: MapActivity[];
  radiusMeters?: number;
  isLoading?: boolean;
  onMoveEnd?: (payload: { center: MapCoordinates; radiusMeters: number; zoom: number }) => void;
  onSelectActivity?: (activity: MapActivity) => void;
  onRequestDetails?: (activity: MapActivity) => void;
};

export default function WebMap({
  center,
  activities,
  radiusMeters = DEFAULT_RADIUS_METERS,
  isLoading = false,
  onMoveEnd,
  onSelectActivity,
  onRequestDetails,
}: Props) {
  const [viewState, setViewState] = useState<MapViewState>({
    latitude: center.lat,
    longitude: center.lng,
    zoom: 12,
  });
  const [selected, setSelected] = useState<MapActivity | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    setViewState((prev) => ({ ...prev, latitude: center.lat, longitude: center.lng }));
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!selected) return;
    const updated = activities.find((act) => act.id === selected.id);
    if (!updated) {
      setSelected(null);
    } else if (updated !== selected) {
      setSelected(updated);
    }
  }, [activities, selected]);

  const featureCollection = useMemo(() => activitiesToFeatureCollection(activities), [activities]);
  const selectedFilter = useMemo(
    () =>
      selected
        ? (['all', ['!has', 'point_count'], ['==', ['get', 'id'], selected.id]] as const)
        : (['all', ['==', ['get', 'id'], '__none__']] as const),
    [selected],
  );

  const handleMove = useCallback((event: ViewStateChangeEvent) => {
    const { viewState: vs } = event;
    setViewState({ latitude: vs.latitude, longitude: vs.longitude, zoom: vs.zoom });
  }, []);

  const handleMoveEnd = useCallback(
    (event: ViewStateChangeEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const centerLngLat = map.getCenter();
      const bounds = map.getBounds();
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const diagonalMeters = haversineMeters(
        northEast.lat,
        northEast.lng,
        southWest.lat,
        southWest.lng,
      );
      const approxRadius = Math.max(200, diagonalMeters / 2);
      onMoveEnd?.({
        center: { lat: centerLngLat.lat, lng: centerLngLat.lng },
        radiusMeters: approxRadius,
        zoom: map.getZoom(),
      });
    },
    [onMoveEnd],
  );

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const source = map.getSource("activities");
      if (!source || !("getClusterExpansionZoom" in source)) {
        if (!feature.properties?.id) return;
        const activity = activities.find((act) => act.id === feature.properties?.id);
        if (activity) {
          setSelected(activity);
          onSelectActivity?.(activity);
        }
        return;
      }
      const clusterId = feature.properties?.cluster_id;
      if (clusterId) {
        (source as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coords = feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)
            ? (feature.geometry.coordinates as [number, number])
            : ([event.lngLat.lng, event.lngLat.lat] as [number, number]);
          const [lng, lat] = coords;
          setViewState((prev) => ({ latitude: lat, longitude: lng, zoom }));
        });
        return;
      }
      const activityId = feature.properties?.id;
      if (!activityId) return;
      const activity = activities.find((act) => act.id === activityId);
      if (activity) {
        setSelected(activity);
        onSelectActivity?.(activity);
      }
    },
    [activities, onSelectActivity],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-rose-500 bg-rose-50 p-6 text-sm text-rose-700">
        <span className="font-semibold">Map unavailable</span>
        <span>Set NEXT_PUBLIC_MAPBOX_TOKEN (or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) to render the map experience.</span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE_URL}
        reuseMaps
        attributionControl
        interactiveLayerIds={[clusterLayer.id!, pointLayer.id!]}
        {...viewState}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source
          id="activities"
          type="geojson"
          data={featureCollection}
          cluster
          clusterRadius={48}
          clusterMaxZoom={16}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...pointLayer} />
          <Layer
            id="selected-point"
            type="circle"
            source="activities"
            filter={selectedFilter as unknown as any}
            paint={{
              "circle-color": "#ffffff",
              "circle-radius": MAPBOX_POINT_RADIUS + 6,
              "circle-stroke-color": MAPBOX_POINT_COLOR,
              "circle-stroke-width": 4,
            }}
          />
        </Source>
        {selected && (
          <Popup
            closeButton
            closeOnClick={false}
            focusAfterOpen={false}
            maxWidth="280px"
            anchor="top"
            longitude={selected.lng}
            latitude={selected.lat}
            onClose={() => setSelected(null)}
          >
            <div className="space-y-2 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">{selected.name}</div>
              {selected.venue && <div>📍 {selected.venue}</div>}
              {selected.distance_m != null && (
                <div className="text-xs text-slate-500">
                  ~{Math.round((selected.distance_m / 1000) * 10) / 10} km away
                </div>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onRequestDetails?.(selected);
                }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View details →
              </button>
            </div>
          </Popup>
        )}
        {isLoading && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-slate-600 shadow">
            Loading nearby activities…
          </div>
        )}
      </Map>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow">
        Radius ≈ {Math.round(radiusMeters / 100) / 10} km
      </div>
    </div>
  );
}
