import { useEffect, useMemo, useState } from "react";

import type { ActivityTaxonomy } from "@dowhat/shared";

type Props = {
  selectedIds: string[];
  onToggle: (tier3Id: string) => void;
  taxonomy: ActivityTaxonomy;
  className?: string;
};

const COLOR_TOKEN_MAP: Record<string, string> = {
  "emerald-500": "bg-emerald-600/10 text-emerald-700 border-emerald-600/40",
  "amber-500": "bg-amber-500/10 text-amber-700 border-amber-600/40",
  "sky-500": "bg-sky-500/10 text-sky-700 border-sky-600/40",
  "rose-500": "bg-rose-500/10 text-rose-700 border-rose-600/40",
  "lime-500": "bg-lime-500/10 text-lime-700 border-lime-600/40",
  "violet-500": "bg-violet-500/10 text-violet-700 border-violet-600/40",
};

const ICON_MAP = {
  "activity-run": "🏃",
  brush: "🎨",
  people: "🤝",
  compass: "🧭",
  leaf: "🍃",
  spark: "✨",
};

type IonIconKey = keyof typeof ICON_MAP;

const getColorTokens = (token: string) =>
  COLOR_TOKEN_MAP[token] ?? "bg-indigo-500/10 text-indigo-700 border-indigo-500/40";

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const buildInitialExpansionState = (taxonomy: ActivityTaxonomy) => {
  const map: Record<string, boolean> = {};
  taxonomy.forEach((tier1, index) => {
    map[tier1.id] = index === 0;
  });
  return map;
};

const TaxonomyCategoryPicker: React.FC<Props> = ({ selectedIds, onToggle, taxonomy, className }) => {
  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => buildInitialExpansionState(taxonomy));

  useEffect(() => {
    setExpanded((prev) => {
      const next = buildInitialExpansionState(taxonomy);
      Object.keys(next).forEach((key) => {
        if (prev[key] !== undefined) {
          next[key] = prev[key];
        }
      });
      return next;
    });
  }, [taxonomy]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className={classNames("space-y-4", className)}>
      {taxonomy.map((tier1) => {
        const tier1SelectionCount = tier1.children.reduce((sum, tier2) => {
          const tier2Count = tier2.children.filter((tier3) => selection.has(tier3.id)).length;
          return sum + tier2Count;
        }, 0);
        const isExpanded = expanded[tier1.id];
        const [iconBg, iconFg, iconBorder] = getColorTokens(tier1.colorToken).split(" ");
        const iconSymbol = ICON_MAP[tier1.iconKey as IonIconKey] ?? "🎯";

        return (
          <div key={tier1.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              onClick={() => toggleSection(tier1.id)}
            >
              <div className="flex items-center gap-4">
                <span className={classNames("flex h-12 w-12 items-center justify-center rounded-full border text-xl", iconBg, iconFg, iconBorder)}>
                  {iconSymbol}
                </span>
                <div>
                  <p className="text-base font-semibold text-slate-900">{tier1.label}</p>
                  <p className="text-sm text-slate-500">{tier1.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {tier1SelectionCount ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {tier1SelectionCount} selected
                  </span>
                ) : null}
                <svg
                  className={classNames(
                    "h-5 w-5 text-slate-500 transition",
                    isExpanded ? "rotate-180" : "rotate-0",
                  )}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </button>
            {isExpanded ? (
              <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                <div className="space-y-5">
                  {tier1.children.map((tier2) => (
                    <div key={tier2.id} className="space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{tier2.label}</p>
                        <p className="text-sm text-slate-500">{tier2.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {tier2.children.map((tier3) => {
                          const active = selection.has(tier3.id);
                          return (
                            <button
                              key={tier3.id}
                              type="button"
                              onClick={() => onToggle(tier3.id)}
                              className={classNames(
                                "rounded-full border px-3 py-1 text-sm font-medium transition",
                                active
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                              )}
                            >
                              {tier3.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default TaxonomyCategoryPicker;
