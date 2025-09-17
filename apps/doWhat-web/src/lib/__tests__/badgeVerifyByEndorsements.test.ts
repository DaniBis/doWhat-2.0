import { verifyByEndorsements } from '@/lib/badges';

// We'll mock the supabase client methods we use inside verifyByEndorsements.
function mockSupabase({ endorsements }: { endorsements: number }) {
  return {
    from: (table: string) => {
      return {
        select: function () { return this; },
        eq: function () { return this; },
        maybeSingle: async () => {
          if (table === 'badges') {
            return { data: { id: 'b1', code: 'reliable', name: 'Reliable' }, error: null };
          }
          if (table === 'v_badge_endorsement_counts') {
            return { data: { endorsements }, error: null };
          }
          return { data: null, error: null };
        },
        update: function () { return this; },
      } as any;
    }
  } as any;
}

describe('verifyByEndorsements', () => {
  test('returns false when below threshold', async () => {
    const sb = mockSupabase({ endorsements: 2 });
    const result = await verifyByEndorsements(sb, 'user1', 'reliable', 3);
    expect(result).toBe(false);
  });
  test('returns true and updates when threshold met', async () => {
    const updates: any[] = [];
    const sb = {
      from: (table: string) => ({
        select: function () { return this; },
        eq: function () { return this; },
        maybeSingle: async () => {
          if (table === 'badges') return { data: { id: 'b1', code: 'reliable', name: 'Reliable' }, error: null };
          if (table === 'v_badge_endorsement_counts') return { data: { endorsements: 5 }, error: null };
          return { data: null, error: null };
        },
        update: function (patch: any) { updates.push({ table, patch }); return this; }
      })
    } as any;
    const result = await verifyByEndorsements(sb, 'user1', 'reliable', 3);
    expect(result).toBe(true);
    expect(updates.length).toBe(1);
    expect(updates[0].patch.status).toBe('verified');
  });
});
