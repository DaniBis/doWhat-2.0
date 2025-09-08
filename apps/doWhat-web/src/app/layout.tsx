import { Inter } from "next/font/google";
import React from "react";
import "./globals.css";
import dynamic from "next/dynamic";
const AuthButtons = dynamic(() => import("@/components/AuthButtons"), { ssr: false });
const GeoRequirementBanner = dynamic(() => import("@/components/GeoRequirement"), { ssr: false });

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-brand-bg text-gray-900">
        <header className="border-b bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-sm">
            <a href="/" className="font-semibold text-brand-teal">doWhat</a>
            <nav className="flex items-center gap-4">
              <a href="/map" className="text-brand-teal">Map</a>
              <a href="/my/rsvps" className="text-brand-teal">My RSVPs</a>
              <a href="/profile" className="text-brand-teal">Profile</a>
              <a href="/create" className="text-brand-teal">Create</a>
            </nav>
            <AuthButtons />
          </div>
        </header>
        {/* Geolocation requirement banner */}
        <GeoRequirementBanner />
        <main>{children}</main>
      </body>
    </html>
  );
}
