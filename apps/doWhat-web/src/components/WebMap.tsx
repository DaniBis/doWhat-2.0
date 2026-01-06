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
  formatEventTimeRange,
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
  activitiesToEventsFeatureCollection,
  type EventSummary,
} from "@dowhat/shared";

import SaveToggleButton from "./SaveToggleButton";
import { buildMapActivitySavePayload } from "@/lib/savePayloads";
import { describeActivityCategories } from "@/lib/activityCategoryLabels";
import {
  clampReliabilityScore,
  describeEventOrigin,
  describeEventState,
  describeEventVerification,
  describeReliabilityConfidence,
  eventPlaceLabel,
  eventStateClass,
  eventVerificationClass,
  reliabilityBarClass,
  buildEventVerificationProgress,
  formatReliabilityLabel,
} from "@/lib/events/presentation";

export type ViewBounds = {
  sw: MapCoordinates;
  ne: MapCoordinates;
};

export type MapMovePayload = {
  center: MapCoordinates;
  radiusMeters: number;
  zoom: number;
  bounds: ViewBounds;
};

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
    "text-font": [...MAPBOX_CLUSTER_COUNT_FONT],
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

const eventPointLayer: LayerProps = {
  id: "events-point",
  type: "circle",
  source: "events",
  paint: {
    "circle-color": "#f59e0b",
    "circle-radius": MAPBOX_POINT_RADIUS,
    "circle-stroke-color": "#f97316",
    "circle-stroke-width": MAPBOX_POINT_STROKE_WIDTH,
  },
};

const selectedEventLayer: LayerProps = {
  id: "selected-event",
  type: "circle",
  source: "events",
  paint: {
    "circle-color": "#ffffff",
    "circle-radius": MAPBOX_POINT_RADIUS + 6,
    "circle-stroke-color": "#f97316",
    "circle-stroke-width": 4,
  },
};

const activityPlaceLabel = (activity: MapActivity | null | undefined): string | null =>
  activity?.place_label ?? activity?.venue ?? null;

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
  events: EventSummary[];
  radiusMeters?: number;
  isLoading?: boolean;
  onMoveEnd?: (payload: MapMovePayload) => void;
  onSelectActivity?: (activity: MapActivity) => void;
  onSelectEvent?: (event: EventSummary) => void;
  onRequestDetails?: (activity: MapActivity) => void;
  onRequestCreateEvent?: (activity: MapActivity) => void;
  onRequestEventDetails?: (event: EventSummary) => void;
  mode?: 'activities' | 'events' | 'both';
  activeActivityId?: string | null;
  activeEventId?: string | null;
};

export default function WebMap({
  center,
  activities,
  events,
  radiusMeters = DEFAULT_RADIUS_METERS,
  isLoading = false,
  onMoveEnd,
  onSelectActivity,
  onSelectEvent,
  onRequestDetails,
  onRequestCreateEvent,
  onRequestEventDetails,
  mode = 'activities',
  activeActivityId,
  activeEventId,
}: Props) {
  const [viewState, setViewState] = useState<MapViewState>({
    latitude: center.lat,
    longitude: center.lng,
    zoom: 12,
  });
  const [selectedActivity, setSelectedActivity] = useState<MapActivity | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const selectedActivitySavePayload = useMemo(() => buildMapActivitySavePayload(selectedActivity), [selectedActivity]);
  const selectedActivityCategories = useMemo(
    () => describeActivityCategories(selectedActivity?.activity_types ?? []),
    [selectedActivity?.activity_types],
  );
  const selectedActivityUpcomingSessions = selectedActivity?.upcoming_session_count ?? 0;
  const canViewSelectedActivityEvents = selectedActivityUpcomingSessions > 0;
  const selectedActivityPlaceLabel = activityPlaceLabel(selectedActivity);
  const selectedEventPlaceLabel = eventPlaceLabel(selectedEvent, { fallback: null });
  const selectedEventOrigin = selectedEvent ? describeEventOrigin(selectedEvent) : null;
  const selectedEventVerificationLabel = selectedEvent ? describeEventVerification(selectedEvent.status) : null;
  const selectedEventVerificationClass = selectedEvent ? eventVerificationClass(selectedEvent.status) : '';
  const selectedEventStateLabel = selectedEvent ? describeEventState(selectedEvent.event_state) : null;
  const selectedEventStateClass = selectedEvent ? eventStateClass(selectedEvent.event_state) : '';
  const selectedEventReliabilityScore = clampReliabilityScore(selectedEvent?.reliability_score);
  const selectedEventReliabilityLabel = formatReliabilityLabel(selectedEventReliabilityScore);
  const selectedEventReliabilityHelper = describeReliabilityConfidence(selectedEventReliabilityScore);
  const selectedEventReliabilityClass = reliabilityBarClass(selectedEventReliabilityScore);
  const selectedEventReliabilityWidth = selectedEventReliabilityScore == null ? 12 : selectedEventReliabilityScore;
  const selectedEventVerificationProgress = buildEventVerificationProgress(selectedEvent);
  const selectedEventVerificationProgressClass = selectedEventVerificationProgress?.complete ? 'bg-brand-teal' : 'bg-amber-500';

  useEffect(() => {
    setViewState((prev) => ({ ...prev, latitude: center.lat, longitude: center.lng }));
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (activeActivityId) {
      const activity = activities.find((candidate) => candidate.id === activeActivityId) ?? null;
      setSelectedActivity(activity);
    } else {
      setSelectedActivity(null);
    }
  }, [activeActivityId, activities]);

  useEffect(() => {
    if (activeEventId) {
      const event = events.find((candidate) => candidate.id === activeEventId) ?? null;
      setSelectedEvent(event);
    } else {
      setSelectedEvent(null);
    }
  }, [activeEventId, events]);

  useEffect(() => {
    if (mode === 'events') {
      setSelectedActivity(null);
    }
    if (mode === 'activities') {
      setSelectedEvent(null);
    }
  }, [mode]);

  const activityFeatures = useMemo(() => activitiesToFeatureCollection(activities), [activities]);
  const eventFeatures = useMemo(() => activitiesToEventsFeatureCollection(events), [events]);
  const showActivities = mode === 'activities' || mode === 'both';
  const showEvents = mode === 'events' || mode === 'both';
  const loadingLabel = showActivities && showEvents
    ? 'Loading activities & events…'
    : showEvents
      ? 'Loading nearby events…'
      : 'Loading nearby activities…';
  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (showActivities) {
      ids.push(clusterLayer.id!, pointLayer.id!, 'selected-point');
    }
    if (showEvents) {
      ids.push(eventPointLayer.id!, selectedEventLayer.id!);
    }
    return ids;
  }, [showActivities, showEvents]);
  const selectedFilter = useMemo<NonNullable<LayerProps["filter"]>>(
    () =>
      selectedActivity
        ? ["all", ["!has", "point_count"], ["==", ["get", "id"], selectedActivity.id]]
        : ["all", ["==", ["get", "id"], "__none__"]],
    [selectedActivity],
  );

  const selectedEventFilter = useMemo<NonNullable<LayerProps["filter"]>>(
    () =>
      selectedEvent
        ? ["all", ["==", ["get", "id"], selectedEvent.id]]
        : ["all", ["==", ["get", "id"], "__none__"]],
    [selectedEvent],
  );

  const handleMove = useCallback((event: ViewStateChangeEvent) => {
    const { viewState: vs } = event;
    setViewState({ latitude: vs.latitude, longitude: vs.longitude, zoom: vs.zoom });
  }, []);

  const handleMoveEnd = useCallback(() => {
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
        bounds: {
          ne: { lat: northEast.lat, lng: northEast.lng },
          sw: { lat: southWest.lat, lng: southWest.lng },
        },
      });
    }, [onMoveEnd]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const kind = feature.properties?.kind;
      if (kind === 'event') {
        const eventId = feature.properties?.id as string | undefined;
        if (!eventId) return;
        const evt = events.find((candidate) => candidate.id === eventId);
        if (evt) {
          setSelectedActivity(null);
          setSelectedEvent(evt);
          onSelectEvent?.(evt);
        }
        return;
      }

      const source = map.getSource("activities");
      if (!source || !("getClusterExpansionZoom" in source)) {
        if (!feature.properties?.id) return;
        const activity = activities.find((act) => act.id === feature.properties?.id);
        if (activity) {
          setSelectedEvent(null);
          setSelectedActivity(activity);
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
          setViewState({ latitude: lat, longitude: lng, zoom });
        });
        return;
      }
      const activityId = feature.properties?.id as string | undefined;
      if (!activityId) return;
      const activity = activities.find((act) => act.id === activityId);
      if (activity) {
        setSelectedEvent(null);
        setSelectedActivity(activity);
        onSelectActivity?.(activity);
      }
    },
    [activities, events, onSelectActivity, onSelectEvent],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-xs rounded-xl border border-dashed border-rose-500 bg-rose-50 p-xl text-sm text-rose-700">
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
        mapLib={mapboxgl}
        mapStyle={MAPBOX_STYLE_URL}
        reuseMaps
        attributionControl
        interactiveLayerIds={interactiveLayerIds}
        {...viewState}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {showActivities && (
          <Source
            id="activities"
            type="geojson"
            data={activityFeatures}
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
              filter={selectedFilter}
              paint={{
                "circle-color": "#ffffff",
                "circle-radius": MAPBOX_POINT_RADIUS + 6,
                "circle-stroke-color": MAPBOX_POINT_COLOR,
                "circle-stroke-width": 4,
              }}
            />
          </Source>
        )}
        {showEvents && (
          <Source id="events" type="geojson" data={eventFeatures}>
            <Layer {...eventPointLayer} />
            <Layer {...selectedEventLayer} filter={selectedEventFilter} />
          </Source>
        )}
        {selectedActivity && (
          <Popup
            closeButton
            closeOnClick={false}
            focusAfterOpen={false}
            maxWidth="280px"
            anchor="top"
            longitude={selectedActivity.lng}
            latitude={selectedActivity.lat}
            onClose={() => setSelectedActivity(null)}
          >
            <div className="space-y-xs text-sm text-ink-strong">
              <div className="font-semibold text-ink">{selectedActivity.name}</div>
              {selectedActivityPlaceLabel && (
                <div>
                  <span aria-hidden>📍</span> {selectedActivityPlaceLabel}
                </div>
              )}
              {selectedActivityCategories.length ? (
                <div className="flex flex-wrap gap-xs text-xs text-emerald-700">
                  {selectedActivityCategories.slice(0, 4).map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full bg-emerald-50 px-xs py-hairline"
                    >
                      {category.parent ? `${category.label} • ${category.parent}` : category.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {selectedActivity.distance_m != null && (
                <div className="text-xs text-ink-muted">
                  ~{Math.round((selectedActivity.distance_m / 1000) * 10) / 10} km away
                </div>
              )}
              {selectedActivitySavePayload ? (
                <SaveToggleButton
                  payload={selectedActivitySavePayload}
                  size="sm"
                  className="w-full justify-center"
                />
              ) : null}
              <div className="flex flex-wrap gap-xs text-xs">
                {canViewSelectedActivityEvents && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onRequestDetails?.(selectedActivity);
                    }}
                    className="rounded-full border border-brand-teal/40 px-sm py-xxs font-semibold text-brand-teal hover:border-brand-teal hover:bg-brand-teal/5"
                  >
                    View events
                    {selectedActivityUpcomingSessions ? ` (${selectedActivityUpcomingSessions})` : ''} →
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    onRequestCreateEvent?.(selectedActivity);
                  }}
                  className="rounded-full bg-brand-teal/90 px-sm py-xxs font-semibold text-surface transition hover:bg-brand-teal"
                >
                  Create event
                </button>
              </div>
            </div>
          </Popup>
        )}
        {showEvents && selectedEvent && (
          <Popup
            closeButton
            closeOnClick={false}
            focusAfterOpen={false}
            maxWidth="280px"
            anchor="top"
            longitude={selectedEvent.lng ?? 0}
            latitude={selectedEvent.lat ?? 0}
            onClose={() => setSelectedEvent(null)}
          >
            <div className="space-y-xs text-sm text-ink-strong">
              {selectedEventOrigin && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {selectedEventOrigin.label}
                </div>
              )}
              <div className="font-semibold text-ink">{selectedEvent.title}</div>
              <EventTimeDisplay event={selectedEvent} />
              {selectedEventVerificationLabel && (
                <div className="flex flex-wrap gap-xxs text-[11px] font-semibold">
                  <span className={`rounded-full border px-xs py-hairline ${selectedEventVerificationClass}`}>
                    {selectedEventVerificationLabel}
                  </span>
                  {selectedEventStateLabel && (
                    <span className={`rounded-full border px-xs py-hairline ${selectedEventStateClass}`}>
                      {selectedEventStateLabel}
                    </span>
                  )}
                </div>
              )}
              {selectedEventPlaceLabel && (
                <div className="text-xs text-ink-muted">
                  <span aria-hidden>📍</span> {selectedEventPlaceLabel}
                </div>
              )}
              {selectedEventVerificationProgress && (
                <div className="space-y-xxs text-[11px] text-ink-muted">
                  <div className="flex items-center justify-between">
                    <span>Community confirmations</span>
                    <span className="font-semibold text-ink">
                      {selectedEventVerificationProgress.confirmations}/{selectedEventVerificationProgress.required}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-midnight-border/20">
                    <div
                      className={`h-full rounded-full ${selectedEventVerificationProgressClass}`}
                      style={{ width: `${selectedEventVerificationProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-xs text-xs text-ink-muted">
                {selectedEvent.tags?.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-amber-100 px-xs py-hairline text-amber-700">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="space-y-xxs text-[11px] text-ink-muted">
                <div className="flex items-center justify-between">
                  <span>Reliability</span>
                  <span className="font-semibold text-ink">{selectedEventReliabilityLabel}</span>
                </div>
                <p>{selectedEventReliabilityHelper}</p>
                <div className="h-1.5 rounded-full bg-midnight-border/20">
                  <div
                    className={`h-full rounded-full ${selectedEventReliabilityClass}`}
                    style={{ width: `${selectedEventReliabilityWidth}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRequestEventDetails?.(selectedEvent)}
                className="inline-flex items-center gap-xxs text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View details →
              </button>
              {selectedEvent.url && (
                <a
                  href={selectedEvent.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xxs text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  View source →
                </a>
              )}
            </div>
          </Popup>
        )}
        {isLoading && (
          <div className="pointer-events-none absolute left-1/2 top-md -translate-x-1/2 rounded-full bg-surface/90 px-md py-xs text-xs font-medium text-ink-medium shadow">
            {loadingLabel}
          </div>
        )}
      </Map>
      <div className="pointer-events-none absolute bottom-md left-4 rounded-full bg-surface/90 px-sm py-xxs text-xs font-medium text-ink-medium shadow">
        Radius ≈ {Math.round(radiusMeters / 100) / 10} km
      </div>
    </div>
  );
}

function EventTimeDisplay({ event }: { event: EventSummary }) {
  const { start, end } = formatEventTimeRange(event);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  );

  return (
    <div className="text-xs text-ink-muted">
      {formatter.format(start)}
      {end ? ` — ${formatter.format(end)}` : ''}
    </div>
  );
}
