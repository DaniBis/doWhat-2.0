import { zscores, zToScore } from '@/lib/traits';

describe('traits math helpers', () => {
  test('zscores length matches and mean approximates 0', () => {
    const vals = [10,12,14,16,18];
    const zs = zscores(vals);
    expect(zs).toHaveLength(vals.length);
    const mean = zs.reduce((a,b)=>a+b,0)/zs.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });
  test('zToScore maps 0 to ~50 and positive larger', () => {
    expect(zToScore(0)).toBeGreaterThanOrEqual(48);
    expect(zToScore(0)).toBeLessThanOrEqual(52);
    expect(zToScore(2)).toBeGreaterThan(zToScore(0));
  });
});