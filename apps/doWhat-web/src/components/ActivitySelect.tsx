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
    <div className="mt-3">
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        multiple
        size={size}
        value={value}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions, (o) => o.value))
        }
        className="w-full rounded border px-2 py-1"
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
