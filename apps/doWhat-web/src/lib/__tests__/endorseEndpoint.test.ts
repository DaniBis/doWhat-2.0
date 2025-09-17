import { POST as endorseHandler } from '@/app/api/users/[id]/badges/endorse/route';

// Mock minimal next/server exports before importing route (already imported but route only uses NextResponse)
jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: (data: any, init?: any) => ({
        status: (init?.status) || 200,
        json: async () => data
      })
    }
  };
});

// Minimal Request polyfill for tests
if (typeof (global as any).Request === 'undefined') {
  class simpleRequest {
    url: string; method: string; _body: any; headers: any;
    constructor(url: string, init: any) { this.url = url; this.method = init?.method || 'GET'; this._body = init?.body; this.headers = new Map(); }
    async json() { return JSON.parse(this._body); }
  }
  (global as any).Request = simpleRequest as any;
}

// We'll mock supabase server client creation used inside handler via module mocking.
jest.mock('@/lib/db', () => ({
  db: () => ({
    from: (table: string) => {
      const state: any = (global as any).__TEST_STATE__ || ((global as any).__TEST_STATE__ = { endorsements: 0, userBadges: new Set() });
      return {
        insert: function (row: any) {
          if (table === 'badge_endorsements') {
            // naive duplicate prevention: simulate unique constraint by ignoring if already endorsed from same endorser
            const key = `${row.endorser_user_id}:${row.target_user_id}:${row.badge_id}`;
            if (!state[key]) { state[key] = true; state.endorsements++; }
            return { error: null };
          }
          if (table === 'user_badges') {
            state.userBadges.add(row.badge_id);
            return { error: null };
          }
          return { error: null };
        },
        select: function () { return this; },
        eq: function () { return this; },
        maybeSingle: async () => {
          if (table === 'user_badges') {
            return { data: state.userBadges.has('b1') ? { id: 'ub1', badge_id: 'b1', user_id: 'target' } : null, error: null };
          }
          if (table === 'v_badge_endorsement_counts') {
            return { data: { endorsements: state.endorsements }, error: null };
          }
          return { data: null, error: null };
        },
        update: function () { return this; },
      } as any;
    }
  })
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: (global as any).__CURR_USER__ || 'endorser-1' } } })
    }
  })
}));

describe('endorse endpoint handler', () => {
  beforeEach(() => { (global as any).__TEST_STATE__ = undefined; });

  async function call(body: any, params = { id: 'target' }, userId?: string) {
    if (userId) (global as any).__CURR_USER__ = userId;
    const req = new Request('http://localhost/api/users/target/badges/endorse', { method: 'POST', body: JSON.stringify(body) });
  // @ts-expect-error params injection
    const res = await endorseHandler(req, { params });
    const json = await res.json();
    return { status: res.status, json };
  }

  test('endorses and stays unverified below threshold', async () => {
    const r1 = await call({ badge_id: 'b1', threshold: 3 });
    expect(r1.status).toBe(200);
    expect(r1.json.verified).toBe(false);
  });

  test('verifies when endorsements >= threshold (different endorsers)', async () => {
    await call({ badge_id: 'b1', threshold: 2 }, { id: 'target' }, 'endorser-1');
    const r2 = await call({ badge_id: 'b1', threshold: 2 }, { id: 'target' }, 'endorser-2');
    expect(r2.json.endorsements).toBeGreaterThanOrEqual(2);
  });

  test('rejects self endorsement', async () => {
    const r = await call({ badge_id: 'b1' }, { id: 'target' }, 'target');
    expect(r.status).toBe(400);
  });
});
