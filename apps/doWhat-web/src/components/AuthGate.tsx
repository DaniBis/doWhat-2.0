import type { Route } from "next";
import Link from "next/link";

type AuthGateProps = {
  title: string;
  description: string;
  redirectTo?: string;
  actionLabel?: string;
  className?: string;
};

const buildAuthHref = (redirectTo?: string) =>
  redirectTo ? `/auth?redirect=${encodeURIComponent(redirectTo)}` : "/auth";

export default function AuthGate({
  title,
  description,
  redirectTo,
  actionLabel = "Sign in",
  className = "",
}: AuthGateProps) {
  return (
    <div className={`glass-panel p-6 text-center ${className}`}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/10 text-2xl">
        🔐
      </div>
      <h2 className="text-xl font-semibold text-ink-strong">{title}</h2>
      <p className="mt-2 text-sm text-ink-medium">{description}</p>
      <Link
        href={buildAuthHref(redirectTo) as Route}
        className="btn-primary mt-5"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
