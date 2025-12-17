"use client";

import * as React from "react";
import { Check, Loader2, Search, Sparkles, X } from "lucide-react";

import { completeTraitOnboardingAction } from "@/app/actions/traits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/browser";
import { MAX_ONBOARDING_TRAITS } from "@/lib/validation/traits";
import { cn } from "@/lib/utils/cn";
import { resolveTraitIcon } from "@/components/traits/icon-utils";
import type { TraitOption } from "@/types/traits";

type TraitSelectorProps = {
  onCompleted?: () => void;
  className?: string;
};

export function TraitSelector({ onCompleted, className }: TraitSelectorProps) {
  const mountedRef = React.useRef(true);
  const [traits, setTraits] = React.useState<TraitOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);

  const loadCatalog = React.useCallback(async () => {
    setCatalogError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("traits")
        .select("id, name, color, icon")
        .order("name", { ascending: true });
      if (!mountedRef.current) return;
      if (error) {
        throw error;
      }
      setTraits(data ?? []);
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("Trait catalog fetch failed", error);
      setCatalogError("Could not load traits.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    loadCatalog();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCatalog]);

  const filteredTraits = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return traits;
    return traits.filter((trait) => trait.name.toLowerCase().includes(term));
  }, [query, traits]);

  const selectedTraits = React.useMemo(() => {
    return selection
      .map((id) => traits.find((trait) => trait.id === id))
      .filter((trait): trait is TraitOption => Boolean(trait));
  }, [selection, traits]);

  const remaining = MAX_ONBOARDING_TRAITS - selection.length;
  const canSubmit = !loading && !pending && remaining === 0;

  const toggleTrait = React.useCallback((traitId: string) => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSelection((prev) => {
      if (prev.includes(traitId)) {
        return prev.filter((value) => value !== traitId);
      }
      if (prev.length >= MAX_ONBOARDING_TRAITS) {
        return prev;
      }
      return [...prev, traitId];
    });
  }, []);

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitSuccess(null);
    startTransition(async () => {
      const result = await completeTraitOnboardingAction({ traitIds: selection });
      if (!result.ok) {
        setSubmitError(result.error || "Could not save traits.");
        return;
      }
      setSubmitSuccess("Traits saved! You can always update them later.");
      onCompleted?.();
    });
  }, [canSubmit, onCompleted, selection]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="space-y-sm">
        <div className="flex items-center gap-xs text-sm font-semibold text-emerald-600">
          <Sparkles className="h-4 w-4" />
          <span>Pick your base vibes</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Choose exactly five traits</h2>
            <p className="text-sm text-ink-medium">
              These become your starting stack. Teammates can nominate more traits after shared sessions.
            </p>
          </div>
          <div className="text-sm font-semibold text-ink-strong">
            {selection.length} / {MAX_ONBOARDING_TRAITS}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-xxs/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search traits"
            className="w-full rounded-2xl border border-midnight-border/40 bg-surface py-xs pl-11 pr-md text-sm focus:border-emerald-400 focus:outline-none"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-xl">
        {selectedTraits.length > 0 && (
          <div className="space-y-xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected</p>
            <div className="flex flex-wrap gap-xs">
              {selectedTraits.map((trait) => (
                <button
                  key={trait.id}
                  type="button"
                  onClick={() => toggleTrait(trait.id)}
                  className="inline-flex items-center gap-xs rounded-full border border-midnight-border/40 bg-surface-alt px-md py-1.5 text-sm font-medium text-ink-strong transition hover:border-midnight-border/60"
                >
                  <span>{trait.name}</span>
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Remove {trait.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <TooltipProvider>
          <ScrollArea className="h-[360px] rounded-2xl border border-midnight-border/30 p-xs">
            <div className="grid gap-sm sm:grid-cols-2">
              {loading && (
                <div className="col-span-2 flex items-center justify-center py-xxxl text-ink-muted">
                  <Loader2 className="mr-xs h-4 w-4 animate-spin" /> Loading traits…
                </div>
              )}

              {!loading && catalogError && (
                <div className="col-span-2 flex flex-col items-center gap-sm py-gutter text-center text-sm text-ink-muted">
                  <p>{catalogError}</p>
                  <Button variant="outline" size="sm" onClick={loadCatalog} disabled={loading}>
                    Try again
                  </Button>
                </div>
              )}

              {!loading && !catalogError && filteredTraits.length === 0 && (
                <div className="col-span-2 text-center text-sm text-ink-muted">No traits match that search.</div>
              )}

              {!catalogError &&
                filteredTraits.map((trait) => (
                  <TraitOptionCard
                    key={trait.id}
                    trait={trait}
                    selected={selection.includes(trait.id)}
                    disabled={!selection.includes(trait.id) && remaining === 0}
                    onToggle={() => toggleTrait(trait.id)}
                  />
                ))}
            </div>
          </ScrollArea>
          <div className="flex flex-wrap items-center justify-between gap-sm text-sm text-ink-medium">
            <span>
              {remaining > 0
                ? `Select ${remaining} more ${remaining === 1 ? "trait" : "traits"}.`
                : "All set! Save to continue."}
            </span>
            {submitError && <span className="text-red-600">{submitError}</span>}
            {submitSuccess && <span className="text-emerald-600">{submitSuccess}</span>}
          </div>
          <div className="flex items-center justify-end gap-sm">
            {catalogError && (
              <Button variant="outline" size="sm" onClick={loadCatalog} disabled={loading}>
                Retry
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={!canSubmit} className="min-w-[160px]">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save traits"}
            </Button>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

type TraitOptionCardProps = {
  trait: TraitOption;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
};

function TraitOptionCard({ trait, selected, disabled, onToggle }: TraitOptionCardProps) {
  const Icon = resolveTraitIcon(trait.icon);
  const accent = trait.color || "#10B981";
  const chipFill = `${accent}1A`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-2xl border px-md py-sm text-left transition",
            selected
              ? "border-transparent bg-midnight text-white"
              : "border-midnight-border/30 bg-surface text-ink-strong hover:border-midnight-border/40",
            disabled && !selected && "opacity-50"
          )}
          style={selected ? undefined : { borderColor: accent }}
          aria-pressed={selected}
        >
          <div className="flex items-center gap-sm">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: selected ? "rgba(255,255,255,0.12)" : chipFill }}
            >
              <Icon className={cn("h-5 w-5", selected ? "text-white" : "text-ink-strong")} />
            </span>
            <div>
              <p className="font-semibold">{trait.name}</p>
              <p className="text-xs text-ink-muted">Tap to {selected ? "remove" : "add"}</p>
            </div>
          </div>
          {selected && <Check className="h-4 w-4" aria-hidden />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{trait.name}</TooltipContent>
    </Tooltip>
  );
}
