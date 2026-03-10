"use client";

import { useEffect, useMemo, useState } from "react";

import { resolvePlaceBranding } from "@dowhat/shared";

type Props = {
  name?: string | null;
  website?: string | null;
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
};

export default function PlaceBrandMark({ name, website, size = "md", className = "" }: Props) {
  const [logoState, setLogoState] = useState<"primary" | "fallback" | "failed">("primary");
  const branding = useMemo(
    () => resolvePlaceBranding({ name, website, logoProxyBaseUrl: "/api/place-logo" }),
    [name, website],
  );
  const sizeClass = SIZE_CLASS[size];
  const activeLogoUrl =
    logoState === "primary"
      ? branding.logoUrl
      : logoState === "fallback"
        ? branding.fallbackLogoUrl
        : null;

  useEffect(() => {
    setLogoState("primary");
  }, [branding.logoUrl, branding.fallbackLogoUrl]);

  if (activeLogoUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-2xl border border-midnight-border/20 bg-white shadow-sm ${sizeClass} ${className}`.trim()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeLogoUrl}
          alt={name ? `${name} logo` : "Place logo"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            setLogoState((current) => {
              if (
                current === "primary"
                && branding.fallbackLogoUrl
                && branding.fallbackLogoUrl !== branding.logoUrl
              ) {
                return "fallback";
              }
              return "failed";
            });
          }}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl border border-brand-teal/20 bg-brand-teal/10 font-semibold text-brand-teal shadow-sm ${sizeClass} ${className}`.trim()}
      aria-label={name ? `${name} initials` : "Place initials"}
    >
      {branding.initials}
    </span>
  );
}
