import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

const ICON_REGISTRY = LucideIcons as Record<string, LucideIcon>;
const iconCache = new Map<string | null | undefined, LucideIcon>();
const DEFAULT_ICON: LucideIcon = Sparkles;

export function resolveTraitIcon(name?: string | null): LucideIcon {
  if (!name) {
    return DEFAULT_ICON;
  }
  if (iconCache.has(name)) {
    return iconCache.get(name)!;
  }
  const resolved = ICON_REGISTRY[name] || DEFAULT_ICON;
  iconCache.set(name, resolved);
  return resolved;
}
