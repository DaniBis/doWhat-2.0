import "./globals.css";

import React from "react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Script from 'next/script';
import Providers from "./providers";
import { OnboardingNavLink } from "@/components/nav/OnboardingNavLink";
import AppLiveUpdates from "@/components/AppLiveUpdates";
import { chunkLoadRecoveryScript } from '@/lib/chunkLoadRecovery';

type AuthButtonsProps = {
  variant?: "panel" | "inline";
};

const AuthButtons = dynamic<AuthButtonsProps>(() => import("@/components/AuthButtons"), { ssr: false });
const GeoRequirementBanner = dynamic(() => import("@/components/GeoRequirement"), { ssr: false }) as unknown as React.FC;
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "doWhat",
  description: "Discover places, plan activities, and join events with doWhat.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/logo.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface-canvas font-sans text-ink antialiased">
        <Script id="dowhat-chunk-load-recovery" strategy="beforeInteractive">
          {chunkLoadRecoveryScript}
        </Script>
        <header className="sticky top-0 z-50 border-b border-white/40 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-6">
              <BrandLogo />
              <nav className="hidden gap-4 text-sm font-medium text-slate-600 md:flex">
                <a href="/venues" className="rounded-full px-3 py-1 text-ink-medium hover:bg-slate-100 hover:text-ink-strong">Venues</a>
                <a href="/map" className="rounded-full px-3 py-1 text-ink-medium hover:bg-slate-100 hover:text-ink-strong">Map</a>
                <a href="/create" className="rounded-full px-3 py-1 text-ink-medium hover:bg-slate-100 hover:text-ink-strong">Create</a>
                <OnboardingNavLink className="ml-2 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 hover:border-emerald-300" />
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <OnboardingNavLink className="md:hidden rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700" />
              {/* Fallback link shows immediately (SSR) and is hidden once AuthButtons hydrates */}
              <a
                id="auth-fallback-link"
                href="/auth"
                className="inline-flex items-center rounded-full border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
              >
                Sign in
              </a>
              <AuthButtons variant="inline" />
            </div>
          </div>
        </header>
        {/* Geolocation requirement banner */}
        <GeoRequirementBanner />
        <Providers>
          <AppLiveUpdates />
          <main className="relative">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
