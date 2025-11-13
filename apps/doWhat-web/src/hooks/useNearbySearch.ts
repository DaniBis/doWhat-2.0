// src/hooks/useNearbySearch.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

export type SessionRow = {
  session_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number | null;
  activity_id: string;
  activity_name: string;
  venue_id: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  distance_km: number;
};

export function useNearbySearch() {
  // data
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [km, setKm] = useState("25");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [activityOptions, setActivityOptions] = useState<string[]>([]);

  // prefill coords once
  useEffect(() => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      (e) => setErr(e.message)
    );
  }, []);

  // load activity names (fallback to a static list)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("name")
        .order("name");
      if (cancelled) return;

      if (error) {
        setActivityOptions([
          "Archery",
          "Board Games",
          "Bowling",
          "Dance",
          "Hiking",
          "Ice Skating",
          "Rock Climbing",
          "Running",
          "Tennis",
          "Yoga",
        ]);
      } else {
        setActivityOptions((data ?? []).map((r: { name: string }) => r.name));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const useMyLocation = useCallback(async () => {
    try {
      const perm = await navigator?.permissions?.query?.({
        name: "geolocation",
      });
      if (perm?.state === "denied") {
        setErr(
          "Location permission is blocked. Click the lock icon → Site settings → Allow Location, then reload."
        );
        return;
      }
    } catch {} // ignore if not supported

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setErr(null);
      },
      (e) => setErr(e.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const search = useCallback(async () => {
    setErr(null);
    setRows(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const kmNum = parseFloat(km);

    if ([latNum, lngNum, kmNum].some((n) => Number.isNaN(n))) {
      setErr("Please enter valid numbers for lat, lng and km.");
      return;
    }

    const acts = selectedActivities.length ? selectedActivities : null;
    const day = date || null;

    setLoading(true);
    const { data, error } = await supabase
      .rpc("sessions_nearby", {
        lat: latNum,
        lng: lngNum,
        p_km: kmNum,
        activities: acts,
        day,
      });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const arr = (data ?? []) as SessionRow[];
    const deduped = Array.from(new Map(arr.map((r) => [r.session_id, r]))).map(
      ([, r]) => r
    );

    deduped.sort(
      (a: SessionRow, b: SessionRow) =>
        a.distance_km - b.distance_km ||
        +new Date(a.starts_at) - +new Date(b.starts_at)
    );

    setRows(deduped);
    setLoading(false);
  }, [lat, lng, km, selectedActivities, date]);

  const filters = useMemo(
    () => ({
      lat,
      setLat,
      lng,
      setLng,
      km,
      setKm,
      date,
      setDate,
      selectedActivities,
      setSelectedActivities,
      activityOptions,
    }),
    [lat, lng, km, date, selectedActivities, activityOptions]
  );

  return { rows, loading, err, setErr, search, useMyLocation, filters };
}
