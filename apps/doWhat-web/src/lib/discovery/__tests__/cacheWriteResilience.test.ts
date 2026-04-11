import { __discoveryEngineTestUtils } from '@/lib/discovery/engine';

describe('discovery cache write resilience', () => {
  test('swallows cache write failure and still resolves', async () => {
    const writer = jest.fn().mockRejectedValue(new Error('statement timeout'));

    await expect(__discoveryEngineTestUtils.scheduleDiscoveryCacheWrite(writer)).resolves.toBeUndefined();
    expect(writer).toHaveBeenCalledTimes(1);
  });
});