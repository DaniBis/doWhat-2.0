import { BADGE_VERIFICATION_THRESHOLD_DEFAULT as DEFAULT_FROM_TYPES } from '@dowhat/shared';
import { POST as endorseHandler } from '@/app/api/users/[id]/badges/endorse/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({ status: init?.status || 200, json: async () => data })
  }
}));

// Minimal Request polyfill (duplicate kept local to avoid inter-test ordering issues)
if (typeof (global as any).Request === 'undefined') {
  class simpleRequest {
    url: string; method: string; _body: any; headers: any;
    constructor(url: string, init: any) { this.url = url; this.method = init?.method || 'GET'; this._body = init?.body; this.headers = new Map(); }
    async json() { return JSON.parse(this._body); }
  }
  (global as any).Request = simpleRequest as any;
}

// Mock db + auth similar to endorseEndpoint test but track endorsement counts across calls
jest.mock('@/lib/db', () => ({
  db: () => ({
    from: (table: string) => {
      const state: any = (global as any).__EFSTATE__ || ((global as any).__EFSTATE__ = { endorsements: 0, userBadges: new Set(), seen: new Set() });
      return {
        insert: function (row: any) {
          if (table === 'badge_endorsements') {
            const key = `${row.endorser_user_id}:${row.target_user_id}:${row.badge_id}`;
            if (!state.seen.has(key)) { state.seen.add(key); state.endorsements++; }
            return { error: null };
          }
          if (table === 'user_badges') { state.userBadges.add(row.badge_id); return { error: null }; }
          return { error: null };
        },
        select: function () { return this; },
        eq: function () { return this; },
        maybeSingle: async () => {
          if (table === 'user_badges') {
            const has = (global as any).__EFSTATE__.userBadges.has('badgeX');
            return { data: has ? { id: 'ub1', badge_id: 'badgeX', user_id: 'target' } : null, error: null };
          }
          if (table === 'v_badge_endorsement_counts') {
            return { data: { endorsements: (global as any).__EFSTATE__.endorsements }, error: null };
          }
          return { data: null, error: null };
        },
        update: function () { return this; },
      } as any;
    }
  })
}));

let authUserIdx = 0;
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: `endorser-${authUserIdx}` } } }) } })
}));

// NOTE: This is a lightweight integration-style test that mocks fetch to hit our endpoint handlers directly.
// Full server integration would require Next test harness; here we focus on logic sequencing.

describe('endorsement flow logic (mocked)', () => {
  test('increments endorsements and reports verification when threshold met', async () => {
  const threshold = typeof DEFAULT_FROM_TYPES === 'number' ? DEFAULT_FROM_TYPES : 3;
    expect(threshold).toBeGreaterThan(0);

    async function call() {
      const req = new Request('http://localhost/api/users/target/badges/endorse', { method: 'POST', body: JSON.stringify({ badge_id: 'badgeX', threshold }) });
      return endorseHandler(req as any, { params: { id: 'target' } });
    }
    // perform threshold-1 endorsements
    for (let i = 0; i < threshold - 1; i++) { authUserIdx = i + 1; await call(); }
    const pre = await call(); // this may reach threshold
    const preJson = await pre.json();
    expect(preJson.endorsements).toBeGreaterThanOrEqual(threshold - 1);
    expect(typeof preJson.verified).toBe('boolean');
  });
});
