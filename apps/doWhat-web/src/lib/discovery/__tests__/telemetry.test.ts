import { __telemetryTesting, recordDiscoveryExposure } from '../telemetry';

const insertMock = jest.fn();
const fromMock = jest.fn(() => ({ insert: insertMock }));
const getOptionalServiceClientMock = jest.fn(() => ({ from: fromMock }));

jest.mock('@/lib/supabase/service', () => ({
  getOptionalServiceClient: () => getOptionalServiceClientMock(),
}));

describe('discovery telemetry', () => {
  const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockClear();
    getOptionalServiceClientMock.mockClear();
    __telemetryTesting.resetWarnings();
    process.env.DISCOVERY_EXPOSURE_ALLOW_IN_TEST = '1';
    process.env.DISCOVERY_EXPOSURE_BATCH_SIZE = '1';
    process.env.DISCOVERY_EXPOSURE_FLUSH_MS = '10';
  });

  afterAll(() => {
    delete process.env.DISCOVERY_EXPOSURE_ALLOW_IN_TEST;
    delete process.env.DISCOVERY_EXPOSURE_BATCH_SIZE;
    delete process.env.DISCOVERY_EXPOSURE_FLUSH_MS;
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('persists sampled exposure when sampling rate is 1', async () => {
    process.env.DISCOVERY_EXPOSURE_SAMPLE_RATE = '1';
    insertMock.mockResolvedValue({ error: null });

    await recordDiscoveryExposure({
      requestId: 'req-1',
      query: {
        lat: 1,
        lng: 2,
        radiusMeters: 1000,
        limit: 10,
        filtersApplied: 2,
      },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 1,
        items: [
          {
            id: 'activity-1',
            name: 'Chess',
            lat: 1,
            lng: 2,
            source: 'activities',
            rank_score: 0.91,
            quality_confidence: 0.88,
            dedupe_key: 'activity:activity-1:place:place-1',
          },
        ],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: { activities: 1 },
      },
    });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[discovery.exposure]'), expect.any(String));
    expect(fromMock).toHaveBeenCalledWith('discovery_exposures');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const firstInsertPayload = insertMock.mock.calls[0]?.[0] as Array<{ request_id: string }>;
    expect(firstInsertPayload).toHaveLength(1);
    expect(firstInsertPayload[0]).toEqual(
      expect.objectContaining({
        request_id: 'req-1',
      }),
    );
  });

  it('skips exposure when sampling rate is 0', async () => {
    process.env.DISCOVERY_EXPOSURE_SAMPLE_RATE = '0';

    await recordDiscoveryExposure({
      requestId: 'req-2',
      query: {
        lat: 1,
        lng: 2,
        radiusMeters: 1000,
        limit: 10,
        filtersApplied: 0,
      },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 0,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
      },
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('flushes queued rows as a batch when threshold reached', async () => {
    process.env.DISCOVERY_EXPOSURE_SAMPLE_RATE = '1';
    process.env.DISCOVERY_EXPOSURE_BATCH_SIZE = '2';
    insertMock.mockResolvedValue({ error: null });

    await recordDiscoveryExposure({
      requestId: 'batch-1',
      query: { lat: 1, lng: 2, radiusMeters: 1000, limit: 10, filtersApplied: 0 },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 0,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
      },
    });

    expect(insertMock).not.toHaveBeenCalled();

    await recordDiscoveryExposure({
      requestId: 'batch-2',
      query: { lat: 1, lng: 2, radiusMeters: 1000, limit: 10, filtersApplied: 0 },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 0,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
      },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const batchPayload = insertMock.mock.calls[0]?.[0] as Array<{ request_id: string }>;
    expect(batchPayload).toHaveLength(2);
    expect(batchPayload[0]?.request_id).toBe('batch-1');
    expect(batchPayload[1]?.request_id).toBe('batch-2');
  });

  it('disables telemetry persistence after a missing discovery_exposures schema error', async () => {
    process.env.DISCOVERY_EXPOSURE_SAMPLE_RATE = '1';
    insertMock.mockResolvedValue({
      error: { message: 'relation "discovery_exposures" does not exist' },
    });

    await recordDiscoveryExposure({
      requestId: 'missing-schema-1',
      query: { lat: 1, lng: 2, radiusMeters: 1000, limit: 10, filtersApplied: 0 },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 0,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
      },
    });

    await recordDiscoveryExposure({
      requestId: 'missing-schema-2',
      query: { lat: 1, lng: 2, radiusMeters: 1000, limit: 10, filtersApplied: 0 },
      result: {
        center: { lat: 1, lng: 2 },
        radiusMeters: 1000,
        count: 0,
        items: [],
        filterSupport: {
          activityTypes: true,
          tags: true,
          traits: true,
          taxonomyCategories: true,
          priceLevels: true,
          capacityKey: true,
          timeWindow: true,
        },
        facets: {
          activityTypes: [],
          tags: [],
          traits: [],
          taxonomyCategories: [],
          priceLevels: [],
          capacityKey: [],
          timeWindow: [],
        },
        sourceBreakdown: {},
      },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[discovery.exposure] failed to persist sampled exposure batch',
      expect.objectContaining({ message: expect.stringContaining('discovery_exposures') }),
    );
  });
});
