"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { submitTraitVotesAction } from "@/app/actions/traits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import { MAX_VOTE_TRAITS_PER_USER } from "@/lib/validation/traits";
import { resolveTraitIcon } from "@/components/traits/icon-utils";
import type { TraitOption, TraitVoteRequest } from "@/types/traits";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type TraitVoteRecipient = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
};

type TraitVoteDialogProps = {
  sessionId: string;
  participants: TraitVoteRecipient[];
  trigger?: React.ReactNode;
  triggerLabel?: string;
  onSubmitted?: () => void;
  className?: string;
};

type SelectionState = Record<string, string[]>;

export function TraitVoteDialog({
  sessionId,
  participants,
  trigger,
  triggerLabel = "Give post-session vibes",
  onSubmitted,
  className,
}: TraitVoteDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [traits, setTraits] = React.useState<TraitOption[]>([]);
  const [loadingTraits, setLoadingTraits] = React.useState(false);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<SelectionState>(() => buildEmptySelection(participants));
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const participantsKey = React.useMemo(
    () =>
      participants
        .map((participant) => `${participant.id}:${participant.name}:${participant.subtitle ?? ""}`)
        .sort()
        .join("|"),
    [participants]
  );
  const sortedParticipants = React.useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name)),
    // Depend on participantsKey so we only recompute when the underlying data actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participantsKey]
  );

  React.useEffect(() => {
    setSelection((prev) => {
      const next: SelectionState = {};
      participants.forEach((participant) => {
        next[participant.id] = prev[participant.id] ?? [];
      });
      return next;
    });
    // We intentionally key off participantsKey so existing picks are preserved when parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsKey]);

  const loadTraits = React.useCallback(async () => {
    setCatalogError(null);
    setLoadingTraits(true);
    try {
      const { data, error } = await supabase
        .from("traits")
        .select("id, name, color, icon")
        .order("name", { ascending: true });
      if (error) {
        throw error;
      }
      setTraits(data ?? []);
    } catch (error) {
      console.error("Trait catalog fetch failed", error);
      setCatalogError("Could not load traits.");
    } finally {
      setLoadingTraits(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && traits.length === 0 && !loadingTraits && !catalogError) {
      loadTraits();
    }
  }, [open, traits.length, loadingTraits, catalogError, loadTraits]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSubmitError(null);
      setSubmitSuccess(null);
      setSelection(buildEmptySelection(participants));
    }
  };

  const toggleTrait = React.useCallback((participantId: string, traitId: string) => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSelection((prev) => {
      const current = prev[participantId] ?? [];
      let nextForParticipant = current;
      if (current.includes(traitId)) {
        nextForParticipant = current.filter((id) => id !== traitId);
      } else if (current.length < MAX_VOTE_TRAITS_PER_USER) {
        nextForParticipant = [...current, traitId];
      }
      if (nextForParticipant === current) {
        return prev;
      }
      return { ...prev, [participantId]: nextForParticipant };
    });
  }, []);

  const clearParticipant = React.useCallback((participantId: string) => {
    setSelection((prev) => {
      if (!(participantId in prev)) return prev;
      if (prev[participantId]?.length === 0) return prev;
      return { ...prev, [participantId]: [] };
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setSelection(buildEmptySelection(participants));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsKey]);

  const votes = React.useMemo(() =>
    Object.entries(selection)
      .map(([toUserId, traitsIds]) => ({ toUserId, traits: traitsIds }))
      .filter((entry) => entry.traits.length > 0),
  [selection]
  );

  const totalTraitsSelected = React.useMemo(() => votes.reduce((sum, entry) => sum + entry.traits.length, 0), [votes]);
  const disableSubmit = pending || totalTraitsSelected === 0 || participants.length === 0 || traits.length === 0;

  const handleSubmit = React.useCallback(() => {
    if (disableSubmit) {
      if (participants.length === 0) {
        setSubmitError("Nobody else attended this session.");
      } else if (totalTraitsSelected === 0) {
        setSubmitError("Pick at least one trait to share.");
      }
      return;
    }
    setSubmitError(null);
    setSubmitSuccess(null);
    const payload: TraitVoteRequest = { votes };
    startTransition(async () => {
      const result = await submitTraitVotesAction(sessionId, payload);
      if (!result.ok) {
        setSubmitError(result.error || "Could not submit votes.");
        return;
      }
      setSubmitSuccess("Votes recorded! Thanks for the vibes.");
      onSubmitted?.();
      setSelection(buildEmptySelection(participants));
      setTimeout(() => {
        setSubmitSuccess(null);
        setOpen(false);
      }, 1200);
    });
  }, [disableSubmit, votes, sessionId, onSubmitted, participants, totalTraitsSelected]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className={className}>
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <Sparkles className="h-4 w-4" />
            <span>Post-session vibes</span>
          </div>
          <DialogTitle>Nominate traits for your crew</DialogTitle>
          <DialogDescription>
            Choose up to {MAX_VOTE_TRAITS_PER_USER} traits per person. Votes unlock 24 hours after the session ends.
          </DialogDescription>
        </DialogHeader>

        {participants.length === 0 && (
          <EmptyState message="Looks like you were the only attendee." />
        )}

        {participants.length > 0 && (
          <div className="space-y-4">
            {catalogError && (
              <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-center justify-between">
                  <span>{catalogError}</span>
                  <Button variant="outline" size="sm" onClick={loadTraits} disabled={loadingTraits}>
                    {loadingTraits ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
                  </Button>
                </div>
              </Card>
            )}

            {traits.length === 0 && !catalogError && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading traits…
              </div>
            )}

            {traits.length > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{totalTraitsSelected} trait{totalTraitsSelected === 1 ? "" : "s"} selected</span>
                  <button type="button" className="text-gray-500 underline-offset-4 hover:underline" onClick={clearAll}>
                    Clear all
                  </button>
                </div>
                <ScrollArea className="max-h-[55vh] pr-2">
                  <div className="space-y-4">
                    <TooltipProvider>
                      {sortedParticipants.map((participant) => (
                        <ParticipantCard
                          key={participant.id}
                          participant={participant}
                          traits={traits}
                          selection={selection[participant.id] ?? []}
                          onToggle={(traitId) => toggleTrait(participant.id, traitId)}
                          onClear={() => clearParticipant(participant.id)}
                        />
                      ))}
                    </TooltipProvider>
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-emerald-600">{submitSuccess}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={disableSubmit} className="min-w-[150px]">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit votes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantCard({
  participant,
  traits,
  selection,
  onToggle,
  onClear,
}: {
  participant: TraitVoteRecipient;
  traits: TraitOption[];
  selection: string[];
  onToggle: (traitId: string) => void;
  onClear: () => void;
}) {
  const initials = React.useMemo(() => getInitials(participant.name), [participant.name]);
  return (
    <div className="rounded-3xl border border-gray-100 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="h-12 w-12">
          {participant.avatarUrl ? (
            <AvatarImage src={participant.avatarUrl} alt={participant.name} />
          ) : (
            <AvatarFallback>{initials}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-semibold text-gray-900">{participant.name}</p>
          {participant.subtitle && <p className="text-xs text-gray-500">{participant.subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            {selection.length}/{MAX_VOTE_TRAITS_PER_USER}
          </span>
          <button type="button" onClick={onClear} className="text-gray-500 underline-offset-4 hover:underline">
            Clear
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {traits.map((trait) => (
          <TraitToggle
            key={trait.id}
            trait={trait}
            active={selection.includes(trait.id)}
            disabled={!selection.includes(trait.id) && selection.length >= MAX_VOTE_TRAITS_PER_USER}
            onClick={() => onToggle(trait.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TraitToggle({
  trait,
  active,
  disabled,
  onClick,
}: {
  trait: TraitOption;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = resolveTraitIcon(trait.icon);
  const accent = trait.color || "#0EA5E9";
  const chipBg = `${accent}14`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled && !active}
          className={cn(
            "flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition",
            active
              ? "border-transparent bg-gray-900 text-white"
              : "border-gray-100 bg-white text-gray-800 hover:border-gray-200",
            disabled && !active && "opacity-50"
          )}
          style={active ? undefined : { borderColor: accent }}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl" style={{ backgroundColor: active ? "rgba(255,255,255,0.12)" : chipBg }}>
              <Icon className={cn("h-4 w-4", active ? "text-white" : "text-gray-700")} />
            </span>
            <span className="text-sm font-medium">{trait.name}</span>
          </span>
          {active && <Sparkles className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{trait.name}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-600">
      {message}
    </Card>
  );
}

function buildEmptySelection(participants: TraitVoteRecipient[]): SelectionState {
  const base: SelectionState = {};
  participants.forEach((participant) => {
    base[participant.id] = [];
  });
  return base;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "");
}
