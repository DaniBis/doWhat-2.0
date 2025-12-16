"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { isUuid } from "@dowhat/shared";
import LocationPickerMap from "@/components/create/LocationPickerMap";
import { extractSessionId, type CreateSessionResponse } from "./extractSessionId";
import { supabase } from "@/lib/supabase/browser";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type Option = { id: string; name: string };

type LocationStatus = 'idle' | 'loading' | 'success' | 'error' | 'denied' | 'manual';

type PrefillState = {
  activityId: string | null;
  activityName: string | null;
  venueId: string | null;
  venueName: string | null;
  lat: string | null;
  lng: string | null;
  returnTo: string | null;
};

const sanitizeQueryValue = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeCoordinateParam = (value: string | null): string | null => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(6);
};

const sanitizeRelativePath = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://dowhat.local');
    if (!url.pathname.startsWith('/')) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
};

const buildReturnTarget = (basePath: string | null, sessionId: string): string => {
  const fallback = '/map';
  try {
    const url = new URL(basePath ?? fallback, 'https://dowhat.local');
    url.searchParams.set('highlightSession', sessionId);
    return `${url.pathname}${url.search}`;
  } catch {
    return `${fallback}?highlightSession=${encodeURIComponent(sessionId)}`;
  }
};

export default function CreateEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = useMemo<PrefillState>(() => {
    const activityIdParam = sanitizeQueryValue(searchParams?.get('activityId'));
    const activityId = activityIdParam && isUuid(activityIdParam) ? activityIdParam : null;
    const activityName = sanitizeQueryValue(searchParams?.get('activityName'));
    const venueIdParam = sanitizeQueryValue(searchParams?.get('venueId'));
    const venueId = venueIdParam && isUuid(venueIdParam) ? venueIdParam : null;
    const venueName = sanitizeQueryValue(searchParams?.get('venueName'));
    const lat = normalizeCoordinateParam(searchParams?.get('lat'));
    const lng = normalizeCoordinateParam(searchParams?.get('lng'));
    const returnTo = sanitizeRelativePath(searchParams?.get('returnTo'));
    return { activityId, activityName, venueId, venueName, lat, lng, returnTo } satisfies PrefillState;
  }, [searchParams]);
  const hasPrefilledCoords = Boolean(prefill.lat && prefill.lng);
  const [activities, setActivities] = useState<Option[]>([]);
  const [venues, setVenues] = useState<Option[]>([]);

  const [activityId, setActivityId] = useState(prefill.activityId ?? '');
  const [activityName, setActivityName] = useState(prefill.activityName ?? '');
  const [venueId, setVenueId] = useState(prefill.venueId ?? '');
  const [venueName, setVenueName] = useState(prefill.venueId ? '' : prefill.venueName ?? '');
  const [lat, setLat] = useState(prefill.lat ?? '');
  const [lng, setLng] = useState(prefill.lng ?? '');
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(prefill.lat && prefill.lng ? 'success' : 'idle');

  const { defaultStart, defaultEnd } = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultStartValue = tomorrow.toISOString().slice(0, 16);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(tomorrowEnd.getHours() + 2);
    const defaultEndValue = tomorrowEnd.toISOString().slice(0, 16);
    return { defaultStart: defaultStartValue, defaultEnd: defaultEndValue };
  }, []);

  const coordsValid = useMemo(() => {
    if (!lat.trim() || !lng.trim()) return false;
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    return !Number.isNaN(la) && !Number.isNaN(ln);
  }, [lat, lng]);

  const showLocationNotice = locationStatus === 'loading' || locationStatus === 'error' || locationStatus === 'denied';
  const disableSubmit = saving || !coordsValid;

  function handleManualLatChange(value: string) {
    setLat(value);
    setLocationStatus('manual');
  }

  function handleManualLngChange(value: string) {
    setLng(value);
    setLocationStatus('manual');
  }

  function handleMapSelect(nextLat: number, nextLng: number) {
    setLat(nextLat.toFixed(6));
    setLng(nextLng.toFixed(6));
    setLocationStatus('success');
  }

  useEffect(() => {
    setStartsAt((prev) => (prev ? prev : defaultStart));
    setEndsAt((prev) => (prev ? prev : defaultEnd));
  }, [defaultStart, defaultEnd]);

  useEffect(() => {
    let active = true;
    (async () => {
      type ActivityRow = { id: string; name: string | null };
      type VenueRow = { id: string; name: string | null };

      try {
        const [activityResp, venueResp] = await Promise.all([
          supabase
            .from('activities')
            .select('id,name')
            .order('name')
            .returns<ActivityRow[]>(),
          supabase
            .from('venues')
            .select('id,name')
            .order('name')
            .returns<VenueRow[]>(),
        ]);

        if (!active) return;

        if (!activityResp.error && activityResp.data) {
          setActivities(
            activityResp.data.map((row) => ({ id: row.id, name: row.name ?? 'Untitled activity' }))
          );
        }

        if (!venueResp.error && venueResp.data) {
          setVenues(
            venueResp.data.map((row) => ({ id: row.id, name: row.name ?? 'Untitled venue' }))
          );
        }

        if (activityResp.error) {
          console.warn('Failed to load activities', activityResp.error);
        }
        if (venueResp.error) {
          console.warn('Failed to load venues', venueResp.error);
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load form data', error);
          setErr((prev) => prev ?? `Failed to load initial data: ${getErrorMessage(error)}`);
        }
      }
    })();

    if (!hasPrefilledCoords) {
      requestLocation();
    } else {
      setLocationStatus((prev) => (prev === 'idle' ? 'success' : prev));
    }

    return () => {
      active = false;
    };
  }, [hasPrefilledCoords]);

  useEffect(() => {
    if (!venueId || venueName) return;
    const selectedVenue = venues.find((v) => v.id === venueId);
    if (selectedVenue?.name) {
      setVenueName(selectedVenue.name);
    }
  }, [venueId, venueName, venues]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      console.warn('Navigator geolocation not available in this browser.');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude.toFixed(6)));
        setLng(String(position.coords.longitude.toFixed(6)));
        setLocationStatus('success');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          console.warn('Geolocation permission denied', error);
        } else {
          setLocationStatus('error');
          console.warn('Geolocation failed', error);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setErr(null); 
      setMsg(null); 
      setSaving(true);

      // Require coordinates for local creation
      const la = parseFloat(lat);
      const ln = parseFloat(lng);
      if (Number.isNaN(la) || Number.isNaN(ln)) {
        throw new Error('Location is required to create an event. Please allow location access or enter coordinates.');
      }

      const payload = {
        activityId: activityId || null,
        activityName: activityName.trim() || null,
        venueId: venueId || null,
        venueName: venueName.trim() || null,
        lat: la,
        lng: ln,
        price: Number(price) || 0,
        startsAt: startsAt || defaultStart,
        endsAt: endsAt || defaultEnd,
        description: description.trim() || null,
      };

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as CreateSessionResponse;
      const sessionId = extractSessionId(result);
      if (!response.ok || !sessionId) {
        throw new Error(result?.error || 'Failed to create event.');
      }

      setMsg('Event created successfully!');
      const redirectTarget = buildReturnTarget(prefill.returnTo, sessionId);
      setTimeout(() => {
        router.push(redirectTarget);
      }, 1000);
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally { 
      setSaving(false); 
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-6 text-brand-teal hover:underline"
      >
        ← Back
      </button>
      
      <h1 className="mb-6 text-3xl font-bold">Create Event</h1>
      
      {err && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700 border border-red-200">
          {err}
        </div>
      )}
      
      {msg && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-700 border border-green-200">
          {msg}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* Activity Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Activity
          </label>
          <div className="space-y-3">
            <select
              value={activityId}
              onChange={(e) => {
                setActivityId(e.target.value);
                if (e.target.value) setActivityName('');
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            >
              <option value="">Select existing activity (optional)</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            
            <input
              type="text"
              placeholder="Or create new activity"
              value={activityName}
              onChange={(e) => {
                setActivityName(e.target.value);
                if (e.target.value) setActivityId('');
              }}
              disabled={!!activityId}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* Venue Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Venue
          </label>
          <div className="space-y-3">
            <select
              value={venueId}
              onChange={(e) => {
                const selectedValue = e.target.value;
                setVenueId(selectedValue);
                if (selectedValue) {
                  const selectedVenue = venues.find((v) => v.id === selectedValue);
                  setVenueName(selectedVenue?.name ?? '');
                } else {
                  setVenueName('');
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            >
              <option value="">Select existing venue (optional)</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            
            <input
              type="text"
              placeholder="Or create new venue"
              value={venueName}
              onChange={(e) => {
                setVenueName(e.target.value);
                if (e.target.value) setVenueId('');
              }}
              disabled={!!venueId}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* Map Picker */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Pin the location</label>
          <p className="mb-3 text-xs text-gray-600">
            Click on the map to set coordinates or allow location access above. You can fine-tune the numbers manually below.
          </p>
          <LocationPickerMap
            lat={coordsValid ? parseFloat(lat) : null}
            lng={coordsValid ? parseFloat(lng) : null}
            onChange={({ lat: nextLat, lng: nextLng }) => {
              handleMapSelect(nextLat, nextLng);
            }}
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Location (required)</label>

          {showLocationNotice && (
            <div
              className="mb-3 rounded-lg border p-3 text-sm"
              style={{
                borderColor:
                  locationStatus === 'denied'
                    ? '#f59e0b'
                    : locationStatus === 'error'
                    ? '#ef4444'
                    : '#93c5fd',
                background:
                  locationStatus === 'denied'
                    ? '#fffbeb'
                    : locationStatus === 'error'
                    ? '#fef2f2'
                    : '#eff6ff',
                color: '#374151',
              }}
            >
              <div className="mb-2 font-medium">We need your location to create an event.</div>
              {locationStatus === 'loading' && <div>📍 Getting your location…</div>}
              {locationStatus === 'denied' && (
                <div>
                  ⚠️ Location is blocked for this site. Click the lock icon → Site settings → Allow Location, then come back and Retry.
                </div>
              )}
              {locationStatus === 'error' && (
                <div>❌ Could not get a GPS fix. Move outdoors, check device location settings, then Retry or pick the spot manually below.</div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1" onClick={requestLocation}>
                  Use my current location
                </button>
                <a className="rounded border px-3 py-1" href="/map" target="_blank" rel="noreferrer">
                  Open map in new tab
                </a>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="Latitude"
              value={lat}
              onChange={(e) => handleManualLatChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="Longitude"
              value={lng}
              onChange={(e) => handleManualLngChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <p className="mt-2 text-sm text-gray-600">
            Coordinates are required; you can type them directly or click the map above to populate both fields.
            The button below will enable once both numbers are set to valid decimal values.
          </p>
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Price (EUR)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="15.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        {/* Date and Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Starts At
            </label>
            <input
              type="datetime-local"
              value={startsAt || defaultStart}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Ends At
            </label>
            <input
              type="datetime-local"
              value={endsAt || defaultEnd}
              onChange={(e) => setEndsAt(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Description (Optional)
          </label>
          <textarea
            placeholder="Tell people what to expect..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={disableSubmit}
          className="w-full rounded-lg bg-brand-teal px-4 py-3 text-white font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Creating Event...' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
