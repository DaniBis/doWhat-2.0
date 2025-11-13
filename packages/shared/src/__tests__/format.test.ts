import { formatPrice, formatDateRange } from '../format';

describe('formatPrice', () => {
  it('should format price correctly in EUR', () => {
    expect(formatPrice(1500)).toBe('€15.00');
    expect(formatPrice(999)).toBe('€9.99');
    expect(formatPrice(0)).toBe('€0.00');
  });

  it('should handle null and undefined values', () => {
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
  });

  it('should handle different currencies', () => {
    expect(formatPrice(1500, 'USD')).toMatch(/\$15\.00/);
  });

  it('should fallback to EUR format if currency is invalid', () => {
    expect(formatPrice(1500, 'INVALID')).toBe('€15.00');
  });
});

describe('formatDateRange', () => {
  it('should format date range correctly', () => {
    const start = new Date('2023-12-01T10:00:00Z');
    const end = new Date('2023-12-01T12:00:00Z');
    const result = formatDateRange(start, end);
    expect(result).toContain('12/1/2023');
    expect(result).toContain(' - ');
  });

  it('should handle string dates', () => {
    const start = '2023-12-01T10:00:00Z';
    const end = '2023-12-01T12:00:00Z';
    const result = formatDateRange(start, end);
    expect(result).toContain('12/1/2023');
    expect(result).toContain(' - ');
  });

  it('should handle null and undefined values', () => {
    expect(formatDateRange(null, null)).toBe('');
    expect(formatDateRange(undefined, undefined)).toBe('');
    expect(formatDateRange(new Date(), null)).toBe('');
    expect(formatDateRange(null, new Date())).toBe('');
  });
});
