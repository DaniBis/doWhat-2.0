"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { SavePayload } from "@dowhat/shared";
import { useSavedActivities } from "@/contexts/SavedActivitiesContext";

const base = "inline-flex items-center rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";
const sizeClasses: Record<"sm" | "md", string> = {
  sm: "px-sm py-xxs text-xs",
  md: "px-md py-xs text-sm",
};

export type SaveToggleButtonProps = {
  payload: SavePayload | null;
  savedLabel?: string;
  unsavedLabel?: string;
  className?: string;
  size?: "sm" | "md";
};

export default function SaveToggleButton({
  payload,
  savedLabel = "Saved",
  unsavedLabel = "Save",
  className = "",
  size = "sm",
}: SaveToggleButtonProps) {
  const { isSaved, toggle, pendingIds } = useSavedActivities();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const payloadId = payload?.id;
  const pending = payloadId ? pendingIds.has(payloadId) : false;
  const saved = payloadId ? isSaved(payloadId) : false;

  const redirectTarget = useMemo(() => {
    const basePath = pathname ?? "/";
    const query = typeof window !== "undefined" ? window.location.search : searchParams?.toString();
    if (query && query.length > 1) {
      return `${basePath}${query}`;
    }
    return basePath;
  }, [pathname, searchParams]);

  const handlePress = useCallback(async () => {
    if (!payloadId || !payload) return;
    if (pending) return;
    try {
      await toggle(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/sign in/i.test(message)) {
        const destination = `/auth?redirect=${encodeURIComponent(redirectTarget)}` as Route;
        router.push(destination);
        return;
      }
      console.error("[save-toggle] failed to toggle", error);
    }
  }, [payloadId, pending, toggle, payload, redirectTarget, router]);

  if (!payloadId || !payload) return null;

  const appearance = saved
    ? "bg-emerald-600 text-white shadow-sm"
    : "border border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50";

  const disabledClasses = pending ? "opacity-60 cursor-not-allowed" : "";
  const sizeClass = sizeClasses[size];
  const composed = [base, sizeClass, appearance, disabledClasses, className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={pending}
      aria-pressed={saved}
      className={composed}
    >
      {saved ? savedLabel : unsavedLabel}
    </button>
  );
}
