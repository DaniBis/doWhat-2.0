"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { resolveTraitIcon } from "@/components/traits/icon-utils";
import type { TraitSummary } from "@/types/traits";

export type TraitCarouselProps = {
  traits: TraitSummary[];
  title?: string;
  description?: string;
  className?: string;
  emptyState?: React.ReactNode;
};

export function TraitCarousel({
  traits,
  title = "Top vibes",
  description = "Stack settles as peers nominate you after sessions.",
  className,
  emptyState = <p className="text-sm text-gray-500">No traits tracked yet.</p>,
}: TraitCarouselProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const { scrollLeft, scrollWidth, clientWidth } = node;
    setCanScrollLeft(scrollLeft > 12);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 12);
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    updateScrollState();
    const handleScroll = () => updateScrollState();
    node.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);
    return () => {
      node.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [updateScrollState, traits.length]);

  const scrollBy = React.useCallback(
    (direction: "left" | "right") => {
      const node = scrollRef.current;
      if (!node) return;
      const delta = direction === "left" ? -280 : 280;
      node.scrollBy({ left: delta, behavior: "smooth" });
      window.requestAnimationFrame(updateScrollState);
    },
    [updateScrollState]
  );

  if (!traits || traits.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <Sparkles className="h-4 w-4" />
            <span>{title}</span>
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </CardHeader>
        <CardContent>{emptyState}</CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
          <Sparkles className="h-4 w-4" />
          <span>{title}</span>
        </div>
        <p className="text-sm text-gray-600">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-4 pr-4 scroll-smooth"
            style={{ scrollbarWidth: "none" }}
          >
            <TooltipProvider>
              {traits.map((trait) => (
                <TraitSummaryCard key={trait.id} trait={trait} />
              ))}
            </TooltipProvider>
          </div>
          <CarouselControl direction="left" onClick={() => scrollBy("left")} disabled={!canScrollLeft} />
          <CarouselControl direction="right" onClick={() => scrollBy("right")} disabled={!canScrollRight} />
        </div>
      </CardContent>
    </Card>
  );
}

function TraitSummaryCard({ trait }: { trait: TraitSummary }) {
  const Icon = resolveTraitIcon(trait.icon);
  const accent = trait.color || "#0EA5E9";
  const chipFill = `${accent}14`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="min-w-[220px] rounded-3xl border border-gray-100 bg-white p-4 shadow-sm"
          style={{ borderColor: accent }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: chipFill }}>
              <Icon className="h-5 w-5 text-gray-700" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{trait.name}</p>
              <p className="text-xs text-gray-500">Updated {new Date(trait.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Score</p>
              <p className="text-2xl font-bold text-gray-900">{trait.score}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>Base picks: {trait.baseCount}</p>
              <p>Votes: {trait.voteCount}</p>
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        Score {trait.score} · Base {trait.baseCount} · Votes {trait.voteCount}
      </TooltipContent>
    </Tooltip>
  );
}

function CarouselControl({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right";
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/90 p-2 shadow-md transition",
        direction === "left" ? "-left-3" : "-right-3",
        disabled && "pointer-events-none opacity-40"
      )}
      onClick={onClick}
      aria-label={direction === "left" ? "Scroll traits left" : "Scroll traits right"}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
