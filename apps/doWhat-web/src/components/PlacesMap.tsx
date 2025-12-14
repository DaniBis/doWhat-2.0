"use client";

import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl";
import Map, { Layer, NavigationControl, Popup, Source } from "react-map-gl";
import type { LayerProps } from "react-map-gl";

import { formatPlaceUpdatedLabel, type PlaceSummary } from "@dowhat/shared";

import SaveToggleButton from "@/components/SaveToggleButton";
import { buildPlaceSavePayload } from "@/lib/savePayloads";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  "";

const MAPBOX_STYLE_URL = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || "mapbox://styles/mapbox/streets-v11";
const MAPBOX_POINT_COLOR = "#10B981";
const MAPBOX_POINT_RADIUS = 8;
const MAPBOX_POINT_STROKE_COLOR = "#ffffff";
const MAPBOX_POINT_STROKE_WIDTH = 2;
const MAPBOX_CLUSTER_COLORS = ["#059669", "#0EA5E9", "#8B5CF6"];
const MAPBOX_CLUSTER_THRESHOLDS = [20, 50];
const MAPBOX_CLUSTER_RADII = [20, 30, 40];
const MAPBOX_CLUSTER_COUNT_TEXT_SIZE = 12;
const MAPBOX_CLUSTER_COUNT_TEXT_COLOR = "#ffffff";
const MAPBOX_CLUSTER_COUNT_FONT = ["DIN Offc Pro Medium", "Arial Unicode MS Bold"];

const clusterLayer: LayerProps = {
  id: "places-clusters",
  type: "circle",
  source: "places",
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
  id: "places-cluster-count",
  type: "symbol",
  source: "places",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": [...MAPBOX_CLUSTER_COUNT_FONT],
    "text-size": MAPBOX_CLUSTER_COUNT_TEXT_SIZE,
  },
  paint: {
    "text-color": MAPBOX_CLUSTER_COUNT_TEXT_COLOR,
  },
};

const pointLayer: LayerProps = {
  id: "places-unclustered-point",
  type: "circle",
  source: "places",
  filter: ["!has", "point_count"],
  paint: {
    "circle-color": MAPBOX_POINT_COLOR,
    "circle-radius": MAPBOX_POINT_RADIUS,
    "circle-stroke-color": MAPBOX_POINT_STROKE_COLOR,
    "circle-stroke-width": MAPBOX_POINT_STROKE_WIDTH,
  },
};

const selectedLayer: LayerProps = {
  id: "places-selected",
  type: "circle",
  source: "places",
  filter: ["all", ["!has", "point_count"], ["==", ["get", "id"], "__selected__"]],
  paint: {
    "circle-color": "#EF4444",
    "circle-radius": MAPBOX_POINT_RADIUS + 2,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 2,
  },
};

type Bounds = {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
};

type PlaceFeatureProperties = {
  id: string;
  name: string;
  address: string;
  categories: string[];
};

const placesToFeatureCollection = (places: PlaceSummary[]): FeatureCollection<Point, PlaceFeatureProperties> => ({
  type: "FeatureCollection",
  features: places.map<Feature<Point, PlaceFeatureProperties>>((place) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [place.lng, place.lat],
    },
    properties: {
      id: place.id,
      name: place.name,
      address: place.address ?? place.locality ?? "",
      categories: place.categories,
    },
  })),
});

type Props = {
  center: { lat: number; lng: number };
  places: PlaceSummary[];
  selectedPlaceId?: string | null;
  onMoveEnd?: (payload: { center: { lat: number; lng: number }; bounds: Bounds; zoom: number }) => void;
  onSelectPlace?: (place: PlaceSummary) => void;
};

export function PlacesMap({ center, places, selectedPlaceId, onMoveEnd, onSelectPlace }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selected, setSelected] = useState<PlaceSummary | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 400 });
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!selectedPlaceId) {
      setSelected(null);
      return;
    }
    const found = places.find((place) => place.id === selectedPlaceId) ?? null;
    setSelected(found);
  }, [places, selectedPlaceId]);

  const featureCollection = useMemo(() => placesToFeatureCollection(places), [places]);

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (onMoveEnd) {
      onMoveEnd({
        center: { lat: map.getCenter().lat, lng: map.getCenter().lng },
        bounds: {
          sw: { lat: sw.lat, lng: sw.lng },
          ne: { lat: ne.lat, lng: ne.lng },
        },
        zoom: map.getZoom(),
      });
    }
  }, [onMoveEnd]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const source = map.getSource("places");
      if (source && "getClusterExpansionZoom" in source && feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id;
        const geometry = feature.geometry;
        const coordinates = geometry?.type === "Point" ? (geometry.coordinates as [number, number]) : null;
        (source as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          if (coordinates) {
            map.easeTo({ center: coordinates, zoom });
          }
        });
        return;
      }
      const placeId = typeof feature.properties?.id === "string" ? feature.properties.id : null;
      if (!placeId) return;
      const place = places.find((item) => item.id === placeId);
      if (place) {
        setSelected(place);
        onSelectPlace?.(place);
      }
    },
    [onSelectPlace, places],
  );

  const selectedFilter = useMemo<NonNullable<LayerProps["filter"]>>(
    () => ["all", ["!has", "point_count"], ["==", ["get", "id"], selected?.id ?? "__none__"]],
    [selected?.id],
  );

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12 }}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        mapStyle={MAPBOX_STYLE_URL}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />
        <Source id="places" type="geojson" data={featureCollection} cluster clusterMaxZoom={14} clusterRadius={40}>
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...pointLayer} />
          <Layer {...{ ...selectedLayer, filter: selectedFilter }} />
        </Source>
        {selected ? (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            closeOnClick={false}
            focusAfterOpen={false}
            onClose={() => setSelected(null)}
            anchor="bottom"
          >
            <div className="max-w-xs">
              <h4 className="text-base font-semibold text-ink">{selected.name}</h4>
              {selected.address ? <div className="text-sm text-ink-medium">{selected.address}</div> : null}
              {selected.categories?.length ? (
                <div className="mt-xs flex flex-wrap gap-xxs">
                  {selected.categories.slice(0, 4).map((category) => (
                    <span key={category} className="rounded-full bg-emerald-100 px-xs py-hairline text-xs text-emerald-800">
                      {category}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-xs text-xs text-ink-muted">{formatPlaceUpdatedLabel(selected)}</div>
              <div className="mt-md flex justify-end">
                <SaveToggleButton
                  size="sm"
                  className="w-full justify-center"
                  payload={buildPlaceSavePayload(selected)}
                />
              </div>
            </div>
          </Popup>
        ) : null}
      </Map>
    </div>
  );
}

export type PlacesMapBounds = Bounds;
