"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UrlObject } from "url";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

interface SessionHostActionsProps {
  sessionId: string;
  editHref?: Route | UrlObject;
  redirectHref?: Route;
  className?: string;
}

export function SessionHostActions(props: SessionHostActionsProps) {
  const { sessionId, className } = props;
  const editHref = useMemo<UrlObject | Route>(() => {
    if (props.editHref) return props.editHref;
    return { pathname: "/create", query: { sessionId } } satisfies UrlObject;
  }, [props.editHref, sessionId]);
  const redirectHref: Route = props.redirectHref ?? "/sessions";
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleDelete() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Deleting this session will remove attendee data. This can't be undone. Continue?",
      );
      if (!confirmed) return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      let payload: { error?: string } = {};
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to delete session.");
      }
      setSuccess("Session deleted.");
      router.push(redirectHref);
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-sm">
        <Button asChild variant="outline">
          <Link href={editHref}>
            Edit Session
          </Link>
        </Button>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete Session"}
        </Button>
      </div>
      {error && <p className="mt-xs text-sm text-red-600">{error}</p>}
      {success && <p className="mt-xs text-sm text-emerald-600">{success}</p>}
      <p className="mt-xs text-xs text-ink-muted">
        Only hosts can manage a session. API routes already enforce this, and this UI matches those rules.
      </p>
    </div>
  );
}
