"use client";

import { useEffect, useState } from "react";

// Small banner that nudges users to enable geolocation for the app.
export default function GeoRequirementBanner() {
  const [state, setState] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const perm: any = await (navigator as any)?.permissions?.query?.({ name: "geolocation" });
        if (perm?.state && mounted) setState(perm.state);
        perm?.addEventListener?.("change", () => {
          if (!mounted) return;
          setState((perm as any).state);
        });
      } catch {
        // Older browsers/Safari: fall back to prompt state
        setState("prompt");
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!visible) return null;
  if (state === "granted") return null;

  const requestNow = () => {
    try {
      navigator.geolocation.getCurrentPosition(
        () => setState("granted"),
        (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "prompt"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch {}
  };

  return (
    <div className="border-b bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span>📍</span>
          {state === "denied" ? (
            <span>
              Location is blocked for this site. Click the lock icon → Site settings → Allow Location, then reload.
            </span>
          ) : (
            <span>
              Enable your location to get nearby results and create local events.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state !== "denied" && (
            <button onClick={requestNow} className="rounded border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-100">
              Use my location
            </button>
          )}
          <button onClick={() => setVisible(false)} className="text-amber-900/70 hover:underline">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

