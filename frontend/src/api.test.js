import { normalizeMeetingId, normalizePasscode } from './api';

describe('meeting connection helpers', () => {
  it('normalizes an entered meeting ID to the canonical uppercase format', () => {
    expect(normalizeMeetingId(' ab-12 ')).toBe('AB12');
  });

  it('trims and preserves passcodes safely for join requests', () => {
    expect(normalizePasscode('  1234  ')).toBe('1234');
  });
});
