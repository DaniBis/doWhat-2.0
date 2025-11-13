"use client";
import dynamic from 'next/dynamic';
import Link from 'next/link';

type AuthButtonsProps = {
  variant?: 'panel' | 'inline';
};

const AuthButtons = dynamic<AuthButtonsProps>(() => import('@/components/AuthButtons'), { ssr: false });

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-16">
      <div className="absolute inset-0 -z-10">
        <div className="pointer-events-none absolute left-1/2 top-12 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200 opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-12 right-6 h-80 w-80 rounded-full bg-emerald-200 opacity-30 blur-3xl" />
      </div>

      <div className="w-full max-w-xl rounded-3xl border border-white/70 bg-white/80 p-10 shadow-xl backdrop-blur">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">Welcome back</p>
          <h1 className="text-3xl font-extrabold text-slate-900">Sign in to doWhat</h1>
          <p className="text-base text-slate-600">
            Find experiences nearby, connect with people you vibe with, and plan your next activity together.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-100 bg-white p-8 shadow-lg shadow-indigo-100">
          <div className="pb-6">
            <p className="text-center text-sm font-semibold text-slate-800">Continue to your account</p>
          </div>
          <AuthButtons variant="panel" />
        </div>

        <div className="mt-8 text-center text-sm">
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
