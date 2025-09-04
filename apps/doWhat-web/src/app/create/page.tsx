"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Option = { id: string; name: string };

export default function CreateEventPage() {
  const router = useRouter();
  const [activities, setActivities] = useState<Option[]>([]);
  const [venues, setVenues] = useState<Option[]>([]);

  const [activityId, setActivityId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [venueId, setVenueId] = useState('');
  const [venueName, setVenueName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await supabase.from('activities').select('id,name').order('name');
      if (!a.error) setActivities((a.data ?? []) as Option[]);
      
      const v = await supabase.from('venues').select('id,name').order('name');
      if (!v.error) setVenues((v.data ?? []) as Option[]);

      // Try to get user's location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLat(String(position.coords.latitude.toFixed(6)));
            setLng(String(position.coords.longitude.toFixed(6)));
          },
          () => {
            // Silently fail - user can enter manually
          }
        );
      }
    })();
  }, []);

  async function ensureActivity(): Promise<string> {
    if (activityId) return activityId;
    const name = activityName.trim();
    if (!name) throw new Error('Enter an activity name or choose one.');
    const { data, error } = await supabase.from('activities').insert({ name }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  }

  async function ensureVenue(): Promise<string> {
    if (venueId) return venueId;
    const name = venueName.trim();
    if (!name) throw new Error('Enter a venue name or choose one.');
    const la = parseFloat(lat); 
    const ln = parseFloat(lng);
    const payload: any = { name };
    if (!Number.isNaN(la)) payload.lat = la;
    if (!Number.isNaN(ln)) payload.lng = ln;
    const { data, error } = await supabase.from('venues').insert(payload).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setErr(null); 
      setMsg(null); 
      setSaving(true);
      
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id; 
      if (!uid) throw new Error('Please sign in.');
      
      const act = await ensureActivity();
      const ven = await ensureVenue();
      
      if (!startsAt || !endsAt) throw new Error('Start and end times are required.');
      
      const cents = Math.round((Number(price) || 0) * 100);
      const payload: any = {
        activity_id: act,
        venue_id: ven,
        price_cents: cents,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        created_by: uid,
      };
      
      if (description.trim()) {
        payload.description = description.trim();
      }
      
      const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
      if (error) throw error;
      
      setMsg('Event created successfully!');
      setTimeout(() => {
        router.push(`/sessions/${(data as any).id}`);
      }, 1000);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create event');
    } finally { 
      setSaving(false); 
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultStart = tomorrow.toISOString().slice(0, 16);
  
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(tomorrowEnd.getHours() + 2);
  const defaultEnd = tomorrowEnd.toISOString().slice(0, 16);

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
                setVenueId(e.target.value);
                if (e.target.value) setVenueName('');
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

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Location (Optional)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
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
          disabled={saving}
          className="w-full rounded-lg bg-brand-teal px-4 py-3 text-white font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Creating Event...' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
