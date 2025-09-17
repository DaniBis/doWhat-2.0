import { recomputeUserTraits } from '@/lib/traits';

// Mock db() to supply controlled trait_events and peer agreements responses
jest.mock('@/lib/db', () => ({
  db: () => ({
    from: (table: string) => {
      const state: any = (global as any).__TSTATE__ || ((global as any).__TSTATE__ = { upserts: [] });
      return {
        select: function () { return this; },
        eq: function () { return this; },
        order: function () { return this; },
        limit: function () { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
        update: function () { return this; },
        insert: function () { return { error: null }; },
        upsert: function (row: any) { state.upserts.push({ table, row }); return { error: null }; }
      } as any;
    },
    rpc: () => ({})
  })
}));

describe('recomputeUserTraits (mocked)', () => {
  test('no events -> no throw', async () => {
    await expect(recomputeUserTraits('u1')).resolves.toBeUndefined();
  });
});