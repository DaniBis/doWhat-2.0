import { computeReliabilityIndex } from '../reliability';

describe('computeReliabilityIndex', () => {
  it('high attendance no reviews -> score ~ high attendance, confidence mid', () => {
    const w30 = { attended: 5, no_shows: 0, late_cancels: 0, excused: 1, on_time: 5, late: 0 };
    const w90 = { attended: 12, no_shows: 0, late_cancels: 1, excused: 2, on_time: 11, late: 1 };
    const res = computeReliabilityIndex(w30, w90, null, 0, 0, 0, 1);
    expect(res.score).toBeGreaterThan(80);
    expect(res.components.RS).toBeNull();
  });
  it('penalizes no-shows heavily', () => {
    const w30 = { attended: 2, no_shows: 2, late_cancels: 0, excused: 0, on_time: 1, late: 1 };
    const w90 = { attended: 4, no_shows: 3, late_cancels: 1, excused: 0, on_time: 2, late: 2 };
    const res = computeReliabilityIndex(w30, w90, 4.5, 5, 0, 3, 2);
    expect(res.score).toBeLessThan(60);
  });
});
