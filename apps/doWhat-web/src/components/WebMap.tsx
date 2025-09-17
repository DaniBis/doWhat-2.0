"use client";
import { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { DivIcon, DivIconOptions } from 'leaflet';

type Props = { center: { lat: number; lng: number } };

interface NearbyActivity {
  id: string;
  name: string;
  lat: number;
  lng: number;
  venue?: string | null;
  price_cents?: number | null;
  rating?: number | null;
  rating_count?: number | null;
  starts_at?: string | null;
}

// Activity type icons
const ACTIVITY_ICONS = {
  fitness: '💪',
  food: '🍽️',
  arts: '🎨',
  outdoor: '🌲',
  social: '👥',
  learning: '📚',
  entertainment: '🎪',
  wellness: '🧘',
  sports: '⚽',
  music: '🎵',
  default: '📍'
};

// Get icon for activity type
const getActivityIcon = (activityName: string): string => {
  const name = activityName?.toLowerCase() || '';
  if (name.includes('fitness') || name.includes('gym') || name.includes('workout')) return ACTIVITY_ICONS.fitness;
  if (name.includes('food') || name.includes('restaurant') || name.includes('cafe') || name.includes('dining')) return ACTIVITY_ICONS.food;
  if (name.includes('art') || name.includes('museum') || name.includes('gallery') || name.includes('culture')) return ACTIVITY_ICONS.arts;
  if (name.includes('outdoor') || name.includes('hiking') || name.includes('park') || name.includes('nature')) return ACTIVITY_ICONS.outdoor;
  if (name.includes('social') || name.includes('meetup') || name.includes('networking')) return ACTIVITY_ICONS.social;
  if (name.includes('learn') || name.includes('class') || name.includes('workshop') || name.includes('course')) return ACTIVITY_ICONS.learning;
  if (name.includes('entertainment') || name.includes('show') || name.includes('movie') || name.includes('theater')) return ACTIVITY_ICONS.entertainment;
  if (name.includes('wellness') || name.includes('spa') || name.includes('meditation') || name.includes('yoga')) return ACTIVITY_ICONS.wellness;
  if (name.includes('sport') || name.includes('football') || name.includes('basketball') || name.includes('tennis')) return ACTIVITY_ICONS.sports;
  if (name.includes('music') || name.includes('concert') || name.includes('band') || name.includes('dj')) return ACTIVITY_ICONS.music;
  return ACTIVITY_ICONS.default;
};

export default function WebMap({ center }: Props) {
  // We load these lazily, so union with null while loading
  // Narrow component prop surfaces to what we actually use
  type MapContainerCmpType = React.ComponentType<{ center: [number, number]; zoom: number; style?: React.CSSProperties; children?: React.ReactNode }>;
  type TileLayerCmpType = React.ComponentType<{ attribution?: string; url: string }>;
  type MarkerCmpType = React.ComponentType<{ position: [number, number]; icon?: DivIcon; children?: React.ReactNode }>;
  type PopupCmpType = React.ComponentType<{ children?: React.ReactNode }>;

  const [LMap, setLMap] = useState<MapContainerCmpType | null>(null);
  const [LTile, setLTile] = useState<TileLayerCmpType | null>(null);
  const [LMarker, setLMarker] = useState<MarkerCmpType | null>(null);
  const [LPopup, setLPopup] = useState<PopupCmpType | null>(null);
  const [LDivIconFactory, setLDivIconFactory] = useState<((opts: DivIconOptions) => DivIcon) | null>(null);
  const [items, setItems] = useState<NearbyActivity[]>([]);

  // Load react-leaflet and leaflet lazily
  useEffect(() => {
    (async () => {
  const reactLeaflet = await import('react-leaflet');
  const leaflet = await import('leaflet');

  setLMap(() => reactLeaflet.MapContainer as unknown as MapContainerCmpType);
  setLTile(() => reactLeaflet.TileLayer as unknown as TileLayerCmpType);
  setLMarker(() => reactLeaflet.Marker as unknown as MarkerCmpType);
  setLPopup(() => reactLeaflet.Popup as unknown as PopupCmpType);
  const createDivIcon = (opts: DivIconOptions): DivIcon => (leaflet.divIcon ? leaflet.divIcon(opts) : new leaflet.DivIcon(opts));
  setLDivIconFactory(() => createDivIcon);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const url = new URL('/api/nearby', window.location.origin);
      url.searchParams.set('lat', String(center.lat));
      url.searchParams.set('lng', String(center.lng));
      url.searchParams.set('radius', '2500');
      const curr = new URL(window.location.href);
      for (const key of ['types', 'tags', 'traits']) {
        const v = curr.searchParams.get(key);
        if (v) url.searchParams.set(key, v);
      }
      const res = await fetch(url.toString());
      const json: unknown = await res.json();
      const rawActivities = (json && typeof json === 'object' && 'activities' in json ? (json as { activities?: unknown }).activities : undefined);
      const activities: NearbyActivity[] = Array.isArray(rawActivities)
        ? rawActivities.filter((a: unknown): a is NearbyActivity => {
            if (!a || typeof a !== 'object') return false;
            const obj = a as Record<string, unknown>;
            return typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.lat === 'number' && typeof obj.lng === 'number';
          })
        : [];
      setItems(activities);
    })();
  }, [center.lat, center.lng]);

  const markers = useMemo(() => (items || []).filter((a) => a.lat != null && a.lng != null), [items]);

  if (!LMap || !LTile || !LMarker || !LPopup || !LDivIconFactory) return <div className="p-6">Loading map…</div>;

  const MapContainerCmp = LMap;
  const TileLayerCmp = LTile;
  const MarkerCmp = LMarker;
  const PopupCmp = LPopup;
  
  return (
    <div style={{ height: 'calc(100dvh - 64px)' }}>
      <MapContainerCmp center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayerCmp
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((a) => {
          const icon = getActivityIcon(a.name);
          const customIcon = LDivIconFactory!({
            html: `
              <div style="
                background: #FDB515;
                border: 3px solid #16B3A3;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-family: system-ui, -apple-system, sans-serif;
              ">
                ${icon}
              </div>
            `,
            className: 'custom-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
          });

          return (
            <MarkerCmp key={a.id} position={[a.lat, a.lng]} icon={customIcon}>
              <PopupCmp>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {icon} {a.name}
                  </div>
                  {a.venue && <div style={{ color: '#4b5563', marginBottom: 4 }}>{a.venue}</div>}
                  {a.price_cents && (
                    <div style={{ color: '#059669', fontWeight: 600, marginBottom: 4 }}>
                      €{(a.price_cents / 100).toFixed(2)}
                    </div>
                  )}
                  {a.rating != null && (
                    <div style={{ marginBottom: 4 }}>⭐ {a.rating} ({a.rating_count ?? 0})</div>
                  )}
                  {a.starts_at && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: 4 }}>
                      📅 {new Date(a.starts_at).toLocaleDateString()}
                    </div>
                  )}
                  <a 
                    href={`/activities/${a.id}`} 
                    style={{ 
                      color: '#0d9488', 
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}
                  >
                    View details →
                  </a>
                </div>
              </PopupCmp>
            </MarkerCmp>
          );
        })}
      </MapContainerCmp>
    </div>
  );
}
