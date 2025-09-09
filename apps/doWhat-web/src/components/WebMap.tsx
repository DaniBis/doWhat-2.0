"use client";
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

type Props = { center: { lat: number; lng: number } };

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
  const [LMap, setLMap] = useState<any>(null);
  const [LTile, setLTile] = useState<any>(null);
  const [LMarker, setLMarker] = useState<any>(null);
  const [LPopup, setLPopup] = useState<any>(null);
  const [LDivIcon, setLDivIcon] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  // Load react-leaflet and leaflet lazily
  useEffect(() => {
    (async () => {
      const [reactLeaflet, leafletMod] = await Promise.all([
        import('react-leaflet'),
        import('leaflet')
      ]);
      const L: any = (leafletMod as any).default || leafletMod;

      setLMap(reactLeaflet.MapContainer);
      setLTile(reactLeaflet.TileLayer);
      setLMarker(reactLeaflet.Marker);
      setLPopup(reactLeaflet.Popup);
      // Wrap to handle environments where only class constructor is available
      const createDivIcon = (opts: any) => (L.divIcon ? L.divIcon(opts) : new L.DivIcon(opts));
      setLDivIcon(() => createDivIcon);
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
      const json = await res.json();
      setItems(json.activities ?? []);
    })();
  }, [center.lat, center.lng]);

  const markers = useMemo(() => (items || []).filter((a: any) => a.lat != null && a.lng != null), [items]);

  if (!LMap || !LTile || !LDivIcon) return <div className="p-6">Loading map…</div>;
  
  return (
    <div style={{ height: 'calc(100dvh - 64px)' }}>
      <LMap center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <LTile
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((a: any) => {
          const icon = getActivityIcon(a.name);
          const customIcon = LDivIcon({
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
            <LMarker key={a.id} position={[a.lat, a.lng] as any} icon={customIcon}>
              <LPopup>
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
              </LPopup>
            </LMarker>
          );
        })}
      </LMap>
    </div>
  );
}
