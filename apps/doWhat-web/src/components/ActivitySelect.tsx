// src/components/ActivitySelect.tsx
"use client";

type Props = {
  label?: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  size?: number;
};

export default function ActivitySelect({
  label = "Activities",
  options,
  value,
  onChange,
  size = 8,
}: Props) {
  return (
    <div className="mt-sm">
      <label className="mb-xxs block text-sm font-medium">{label}</label>
      <select
        multiple
        size={size}
        value={value}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions, (o) => o.value))
        }
        className="w-full rounded border px-xs py-xxs"
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
