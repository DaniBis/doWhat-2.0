import { ImageResponse } from "next/og";
import { theme } from "@dowhat/shared";

import { fetchSessionOgContext, formatSessionOgDate } from "./og-data";

export const runtime = "edge";

const size = {
  width: 1200,
  height: 630,
};

const fontFamily = '"Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

async function SessionOpengraphImage({ params }: { params: { id: string } }) {
  const context = await fetchSessionOgContext(params.id);
  const { dateLabel, timeLabel } = formatSessionOgDate(context?.startsAt ?? null);

  const title = context?.title ?? "Social Sweat session";
  const venue = context?.venue ?? "Location TBA";
  const host = context?.hostName ?? "Host pending";
  const slotDescriptor = describeOpenSlots(context?.openSlots ?? 0);
  const skillDescriptor = context?.skillLabel ?? "All levels welcome";
  const timing = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(140deg, ${theme.palette.midnight.base}, ${theme.palette.brand.tealDark})`,
          color: theme.palette.surface.base,
          padding: "72px",
          fontFamily,
        }}
      >
        <div style={{ opacity: 0.85, letterSpacing: 6, fontSize: 26, textTransform: "uppercase" }}>Social Sweat</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <h1 style={{ fontSize: 78, lineHeight: 1.05, margin: 0 }}>{title}</h1>
          <p style={{ fontSize: 32, margin: 0, color: theme.palette.brand.yellow }}>
            {slotDescriptor} • {skillDescriptor}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "24px",
            padding: "32px",
            borderRadius: "32px",
            background: "rgba(4, 47, 46, 0.85)",
            border: `1px solid ${theme.palette.midnight.border}`,
          }}
        >
          <InfoBlock label="When" value={timing} />
          <InfoBlock label="Where" value={venue} />
          <InfoBlock label="Host" value={host} />
          <InfoBlock label="Ready for" value={skillDescriptor} />
        </div>
      </div>
    ),
    size,
  );
}

export default SessionOpengraphImage;

const InfoBlock = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      width: "50%",
      minWidth: "50%",
      maxWidth: "50%",
    }}
  >
    <span style={{ fontSize: 20, letterSpacing: 2, textTransform: "uppercase", color: theme.palette.midnight.muted }}>{label}</span>
    <span style={{ fontSize: 34, fontWeight: 600 }}>{value}</span>
  </div>
);

function describeOpenSlots(count: number): string {
  if (count <= 0) {
    return "Crew in progress";
  }
  return `Need ${count} player${count === 1 ? "" : "s"}`;
}
