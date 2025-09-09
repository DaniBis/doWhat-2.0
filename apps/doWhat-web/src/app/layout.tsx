import { Inter } from "next/font/google";
import React from "react";
import "./globals.css";
import dynamic from "next/dynamic";
const AuthButtons = dynamic(() => import("@/components/AuthButtons"), { ssr: false });
const GeoRequirementBanner = dynamic(() => import("@/components/GeoRequirement"), { ssr: false });
import BrandLogo from "@/components/BrandLogo";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-brand-bg text-gray-900">
        <header className="border-b bg-[#16B3A3] text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-sm">
            <BrandLogo />
            <nav className="flex items-center gap-4">
              <a href="/map" className="hover:underline">Map</a>
              <a href="/profile" className="hover:underline">Profile</a>
              <a href="/create" className="hover:underline">Create</a>
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
