import type { EventSummary } from '@dowhat/shared';

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
  },
}));

import { queryEventsWithFallback } from '../queryEventsWithFallback';

type ExecutionResult = { data: EventSummary[] | null; error: { message?: string | null } | null };

const mockExecute = (responses: ExecutionResult[]) => {
  const calls: string[][] = [];
  const fn = jest.fn(async (columns: string[]) => {
    calls.push(columns);
    const next = responses.shift();
    if (!next) {
      throw new Error('No more responses configured');
    }
    return next;
  });
  return { fn, calls } as const;
};

describe('queryEventsWithFallback', () => {
  it('retries without event_state when the column is missing', async () => {
    const responses: ExecutionResult[] = [
      { data: null, error: { message: 'column events.event_state does not exist' } },
      { data: [{ id: 'event-1' } as EventSummary], error: null },
    ];
    const { fn, calls } = mockExecute(responses);

    const result = await queryEventsWithFallback(fn);

    expect(calls[0]).toContain('event_state');
    expect(calls[1]).not.toContain('event_state');
    expect(result.events).toHaveLength(1);
    expect(result.omittedEventState).toBe(true);
    expect(result.omittedReliabilityScore).toBe(false);
    expect(result.omittedVerificationConfirmations).toBe(false);
    expect(result.omittedVerificationRequired).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns first successful response when event_state column exists', async () => {
    const responses: ExecutionResult[] = [{ data: [{ id: 'event-2' } as EventSummary], error: null }];
    const { fn, calls } = mockExecute(responses);

    const result = await queryEventsWithFallback(fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('event_state');
    expect(result.events[0]?.id).toBe('event-2');
    expect(result.omittedEventState).toBe(false);
    expect(result.omittedReliabilityScore).toBe(false);
    expect(result.omittedVerificationConfirmations).toBe(false);
    expect(result.omittedVerificationRequired).toBe(false);
    expect(result.error).toBeNull();
  });

  it('retries without reliability_score when the column is missing', async () => {
    const responses: ExecutionResult[] = [
      { data: null, error: { message: 'column events.reliability_score does not exist' } },
      { data: [{ id: 'event-3' } as EventSummary], error: null },
    ];
    const { fn, calls } = mockExecute(responses);

    const result = await queryEventsWithFallback(fn);

    expect(calls[0]).toContain('reliability_score');
    expect(calls[1]).not.toContain('reliability_score');
    expect(result.events).toHaveLength(1);
    expect(result.omittedEventState).toBe(false);
    expect(result.omittedReliabilityScore).toBe(true);
    expect(result.omittedVerificationConfirmations).toBe(false);
    expect(result.omittedVerificationRequired).toBe(false);
    expect(result.error).toBeNull();
  });

  it('retries without verification columns when they are missing', async () => {
    const responses: ExecutionResult[] = [
      { data: null, error: { message: 'column events.verification_confirmations does not exist' } },
      { data: null, error: { message: 'column events.verification_required does not exist' } },
      { data: [{ id: 'event-4' } as EventSummary], error: null },
    ];
    const { fn, calls } = mockExecute(responses);

    const result = await queryEventsWithFallback(fn);

    expect(calls[0]).toContain('verification_confirmations');
    expect(calls[1]).not.toContain('verification_confirmations');
    expect(calls[1]).toContain('verification_required');
    expect(calls[2]).not.toContain('verification_required');
    expect(result.events).toHaveLength(1);
    expect(result.omittedVerificationConfirmations).toBe(true);
    expect(result.omittedVerificationRequired).toBe(true);
    expect(result.omittedEventState).toBe(false);
    expect(result.omittedReliabilityScore).toBe(false);
    expect(result.error).toBeNull();
  });
});
