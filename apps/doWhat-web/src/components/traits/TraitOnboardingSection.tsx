"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { TraitSelector } from "@/components/traits/TraitSelector";

type TraitOnboardingSectionProps = {
  redirectPath?: string;
  className?: string;
};

export function TraitOnboardingSection({
  redirectPath = "/onboarding/core-values",
  className,
}: TraitOnboardingSectionProps) {
  const router = useRouter();
  const handleCompleted = useCallback(() => {
    const target = (redirectPath ?? "/onboarding/core-values") as Route;
    router.push(target);
  }, [redirectPath, router]);

  return (
    <TraitSelector
      className={className}
      onCompleted={handleCompleted}
    />
  );
}
