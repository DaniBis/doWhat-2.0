import React from 'react';

interface Props {
  score: number; // 0..100
  confidence: number; // 0..1
  size?: number;
}

export const ReliabilityWidget: React.FC<Props> = ({ score, confidence, size = 72 }) => {
  const pct = Math.round(score);
  const confPct = Math.round(confidence * 100);
  const ringColor = score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', fontSize: 12 }}>
      <div style={{ position: 'relative', width: size, height: size }} title={`Reliability: ${pct} (confidence ${confPct}%)`}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={(size/2)-6} stroke="#eee" strokeWidth={6} fill="none" />
          <circle
            cx={size/2}
            cy={size/2}
            r={(size/2)-6}
            stroke={ringColor}
            strokeWidth={6}
            fill="none"
            strokeDasharray={`${(pct/100)*2*Math.PI*((size/2)-6)} ${2*Math.PI*((size/2)-6)}`}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            strokeLinecap="round"
          />
          <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={size*0.3} fontWeight={600}>{pct}</text>
        </svg>
      </div>
      <div style={{ opacity: 0.7 }}>conf {confPct}%</div>
    </div>
  );
};
