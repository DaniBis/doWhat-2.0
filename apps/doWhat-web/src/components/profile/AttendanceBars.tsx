"use client";
import { AttendanceMetrics } from '@/types/profile';

export function AttendanceBars({ metrics }: { metrics?: AttendanceMetrics }) {
  const total30 = (metrics?.attended30||0)+(metrics?.noShow30||0)+(metrics?.lateCancel30||0)+(metrics?.excused30||0);
  const total90 = (metrics?.attended90||0)+(metrics?.noShow90||0)+(metrics?.lateCancel90||0)+(metrics?.excused90||0);
  return (
    <div className="rounded-xl bg-surface border border-midnight-border/40 p-lg shadow-sm flex flex-col gap-md">
      <h3 className="font-semibold text-ink-strong">Attendance (30 / 90d)</h3>
      <Bar label="30d" attended={metrics?.attended30||0} noShow={metrics?.noShow30||0} lateCancel={metrics?.lateCancel30||0} excused={metrics?.excused30||0} total={total30} />
      <Bar label="90d" attended={metrics?.attended90||0} noShow={metrics?.noShow90||0} lateCancel={metrics?.lateCancel90||0} excused={metrics?.excused90||0} total={total90} />
    </div>
  );
}

function Bar({ label, attended, noShow, lateCancel, excused, total }: { label: string; attended: number; noShow: number; lateCancel: number; excused: number; total: number }) {
  const seg = (n: number) => total ? (n/total)*100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-xxs text-xs text-ink-medium"><span className="font-medium text-ink-strong">{label}</span><span className="tabular-nums">{total} events</span></div>
      <div className="h-3 w-full rounded-full overflow-hidden bg-surface-alt flex">
        <span style={{ width: seg(attended)+'%' }} className="bg-emerald-500" />
        <span style={{ width: seg(noShow)+'%' }} className="bg-red-500" />
        <span style={{ width: seg(lateCancel)+'%' }} className="bg-amber-500" />
        <span style={{ width: seg(excused)+'%' }} className="bg-ink-subtle" />
      </div>
      <div className="mt-xxs flex gap-sm flex-wrap text-[10px] text-ink-muted">
        <Legend swatch="bg-emerald-500" label="Att" value={attended} />
        <Legend swatch="bg-red-500" label="NoShow" value={noShow} />
        <Legend swatch="bg-amber-500" label="LateCancel" value={lateCancel} />
        <Legend swatch="bg-ink-subtle" label="Excused" value={excused} />
      </div>
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return <span className="flex items-center gap-xxs"><span className={`w-2 h-2 rounded ${swatch}`} />{label}:{value}</span>;
}
