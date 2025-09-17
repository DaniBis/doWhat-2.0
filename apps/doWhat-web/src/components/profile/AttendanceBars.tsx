"use client";
import { AttendanceMetrics } from '@/types/profile';

export function AttendanceBars({ metrics }: { metrics?: AttendanceMetrics }) {
  const total30 = (metrics?.attended30||0)+(metrics?.noShow30||0)+(metrics?.lateCancel30||0)+(metrics?.excused30||0);
  const total90 = (metrics?.attended90||0)+(metrics?.noShow90||0)+(metrics?.lateCancel90||0)+(metrics?.excused90||0);
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
      <h3 className="font-semibold text-gray-800">Attendance (30 / 90d)</h3>
      <Bar label="30d" attended={metrics?.attended30||0} noShow={metrics?.noShow30||0} lateCancel={metrics?.lateCancel30||0} excused={metrics?.excused30||0} total={total30} />
      <Bar label="90d" attended={metrics?.attended90||0} noShow={metrics?.noShow90||0} lateCancel={metrics?.lateCancel90||0} excused={metrics?.excused90||0} total={total90} />
    </div>
  );
}

function Bar({ label, attended, noShow, lateCancel, excused, total }: { label: string; attended: number; noShow: number; lateCancel: number; excused: number; total: number }) {
  const seg = (n: number) => total ? (n/total)*100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs text-gray-600"><span className="font-medium text-gray-800">{label}</span><span className="tabular-nums">{total} events</span></div>
      <div className="h-3 w-full rounded-full overflow-hidden bg-gray-100 flex">
        <span style={{ width: seg(attended)+'%' }} className="bg-emerald-500" />
        <span style={{ width: seg(noShow)+'%' }} className="bg-red-500" />
        <span style={{ width: seg(lateCancel)+'%' }} className="bg-amber-500" />
        <span style={{ width: seg(excused)+'%' }} className="bg-gray-400" />
      </div>
      <div className="mt-1 flex gap-3 flex-wrap text-[10px] text-gray-500">
        <Legend swatch="bg-emerald-500" label="Att" value={attended} />
        <Legend swatch="bg-red-500" label="NoShow" value={noShow} />
        <Legend swatch="bg-amber-500" label="LateCancel" value={lateCancel} />
        <Legend swatch="bg-gray-400" label="Excused" value={excused} />
      </div>
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded ${swatch}`} />{label}:{value}</span>;
}
