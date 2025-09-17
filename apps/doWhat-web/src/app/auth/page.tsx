"use client";
import dynamic from 'next/dynamic';
import Link from 'next/link';

const AuthButtons = dynamic(() => import('@/components/AuthButtons'), { ssr: false });

export default function AuthPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-24 px-4 bg-gray-50">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">Sign in to doWhat</h1>
        <p className="text-center text-sm text-gray-600">Choose a method below to continue</p>
        <div className="border rounded-lg bg-white p-6 shadow-sm">
          <AuthButtons />
        </div>
        <div className="text-center">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Back home</Link>
        </div>
      </div>
    </div>
  );
}
