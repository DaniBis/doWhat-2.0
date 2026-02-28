import { formatDateTimeLocalInput, toUtcIsoFromDateTimeLocal } from '../dateTime';

describe('create/dateTime', () => {
  it('formats a Date to datetime-local string in local timezone', () => {
    const localDate = new Date(2026, 1, 14, 9, 5, 23, 0);
    expect(formatDateTimeLocalInput(localDate)).toBe('2026-02-14T09:05');
  });

  it('converts datetime-local input to UTC ISO using local timezone semantics', () => {
    const input = '2026-02-14T09:05';
    const expected = new Date(2026, 1, 14, 9, 5, 0, 0).toISOString();
    expect(toUtcIsoFromDateTimeLocal(input)).toBe(expected);
  });

  it('throws when datetime-local input format is invalid', () => {
    expect(() => toUtcIsoFromDateTimeLocal('2026-02-14 09:05')).toThrow(
      'Invalid local date/time format.',
    );
  });
});
