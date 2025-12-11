import "./globals.css";

import { Inter } from "next/font/google";
import React from "react";
import dynamic from "next/dynamic";
import Providers from "./providers";
import { OnboardingNavLink } from "@/components/nav/OnboardingNavLink";

type AuthButtonsProps = {
  variant?: "panel" | "inline";
};

const AuthButtons = dynamic<AuthButtonsProps>(() => import("@/components/AuthButtons"), { ssr: false });
const GeoRequirementBanner = dynamic(() => import("@/components/GeoRequirement"), { ssr: false }) as unknown as React.FC;
import BrandLogo from "@/components/BrandLogo";

const inter = Inter({ subsets: ["latin"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-dvh bg-brand-bg text-slate-900`}>
        <header className="border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-6">
              <BrandLogo />
              <nav className="hidden gap-4 text-sm font-medium text-slate-600 md:flex">
                <a href="/venues" className="rounded-full px-3 py-1 hover:bg-slate-100 hover:text-slate-900">Venues</a>
                <a href="/map" className="rounded-full px-3 py-1 hover:bg-slate-100 hover:text-slate-900">Map</a>
                <a href="/create" className="rounded-full px-3 py-1 hover:bg-slate-100 hover:text-slate-900">Create</a>
                <OnboardingNavLink className="ml-2" />
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <OnboardingNavLink className="md:hidden" />
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
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
