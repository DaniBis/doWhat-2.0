"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl";
import type { MapLayerMouseEvent, ViewStateChangeEvent } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { MapCoordinates } from "@dowhat/shared";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  '';

const FALLBACK_CENTER: MapCoordinates = { lat: 48.8566, lng: 2.3522 }; // Paris default

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  height?: number;
};

type ViewState = {
  latitude: number;
  longitude: number;
  zoom: number;
};

const createMarkerSvg = () =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 24 32" fill="none"><path d="M12 0C5.4 0 0 5.28 0 11.8C0 20.65 10.54 31.25 11 31.7C11.27 31.97 11.63 32.12 12 32.12C12.37 32.12 12.73 31.97 13 31.7C13.46 31.25 24 20.65 24 11.8C24 5.28 18.6 0 12 0Z" fill="#10b981"/><circle cx="12" cy="12" r="5" fill="white"/></svg>'
  )}`;

export default function LocationPickerMap({ lat, lng, onChange, height = 280 }: Props) {
  const [viewState, setViewState] = useState<ViewState>({
    latitude: lat ?? FALLBACK_CENTER.lat,
    longitude: lng ?? FALLBACK_CENTER.lng,
    zoom: 13,
  });

  useEffect(() => {
    if (lat == null || lng == null) return;
    setViewState((prev) => ({ ...prev, latitude: lat, longitude: lng }));
  }, [lat, lng]);

  const markerUri = useMemo(createMarkerSvg, []);

  const handleMove = (event: ViewStateChangeEvent) => {
    setViewState({ latitude: event.viewState.latitude, longitude: event.viewState.longitude, zoom: event.viewState.zoom });
  };

  const handleClick = (event: MapLayerMouseEvent) => {
    const { lat: nextLat, lng: nextLng } = event.lngLat;
    onChange({ lat: Number(nextLat.toFixed(6)), lng: Number(nextLng.toFixed(6)) });
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="flex h-[280px] w-full items-center justify-center rounded-lg border border-dashed border-rose-300 bg-rose-50 text-sm text-rose-600"
        style={{ height }}
      >
        Configure NEXT_PUBLIC_MAPBOX_TOKEN (or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) to enable location picking.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm" style={{ height }}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        reuseMaps
        attributionControl
        {...viewState}
        onMove={handleMove}
        onClick={handleClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {lat != null && lng != null ? (
          <Marker latitude={lat} longitude={lng} anchor="bottom">
            <Image src={markerUri} alt="Selected location" width={40} height={52} className="h-12 w-8" unoptimized />
          </Marker>
        ) : (
          <Marker latitude={viewState.latitude} longitude={viewState.longitude} anchor="bottom">
            <div className="rounded-full bg-emerald-500/80 px-3 py-1 text-xs font-semibold text-white shadow">Tap to set</div>
          </Marker>
        )}
      </Map>
      <div className="flex items-center justify-between bg-white px-3 py-2 text-xs text-gray-600">
        <span>Click anywhere on the map to set coordinates.</span>
        {lat != null && lng != null && (
          <span className="font-medium text-emerald-600">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}
