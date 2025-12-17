"use client";

import * as React from "react";

type Activity = { id: string; name: string };

type Props = {
  options: Activity[];
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  /**
   * When true, shows "Select all" / "Clear" helpers.
   * Defaults to true.
   */
  showHelpers?: boolean;
};

export default function ActivitiesFilter({
  options,
  selected,
  onChange,
  label = "Activities",
  disabled = false,
  className = "",
  showHelpers = true,
}: Props) {
  // toggle one id in/out of the selected list
  const toggle = (id: string) => {
    if (disabled) return;
    const has = selected.includes(id);
    const next = has ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  const selectAll = () => {
    if (disabled) return;
    onChange(options.map((o) => o.id));
  };
  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <fieldset className={`w-full ${className}`} aria-disabled={disabled}>
      <legend className="mb-xs block text-sm font-medium text-ink">
        {label}
      </legend>

      {/* Helpers */}
      {showHelpers && (
        <div className="mb-xs flex items-center gap-xs text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="rounded border px-xs py-xxs hover:bg-surface-alt disabled:opacity-50"
            disabled={disabled || selected.length === options.length}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded border px-xs py-xxs hover:bg-surface-alt disabled:opacity-50"
            disabled={disabled || selected.length === 0}
          >
            Clear
          </button>
          <span className="ml-auto text-ink-muted">
            {selected.length}/{options.length} selected
          </span>
        </div>
      )}

      {/* Mobile: horizontal chip scroller */}
      <div className="sm:hidden">
        <div className="flex snap-x snap-mandatory gap-xs overflow-x-auto pb-xs">
          {options.map((o) => {
            const active = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggle(o.id)}
                disabled={disabled}
                className={[
                  "snap-start whitespace-nowrap rounded-full border px-sm py-xs text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2",
                  active
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700 focus:ring-emerald-600"
                    : "border-midnight-border/60 bg-surface text-ink-strong hover:bg-surface-alt focus:ring-gray-400",
                  disabled && "opacity-50 cursor-not-allowed",
                ].join(" ")}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: responsive grid of pills */}
      <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-xs">
        {options.map((o) => {
          const active = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(o.id)}
              disabled={disabled}
              className={[
                "w-full rounded-full border px-sm py-xs text-sm text-left",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                active
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 focus:ring-emerald-600"
                  : "border-midnight-border/60 bg-surface text-ink-strong hover:bg-surface-alt focus:ring-gray-400",
                disabled && "opacity-50 cursor-not-allowed",
              ].join(" ")}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
