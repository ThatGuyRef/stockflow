import { describe, expect, it } from 'vitest';
import { formatRupiah, timeAgo } from './format';

describe('formatRupiah', () => {
  it('formats positive integers to IDR format', () => {
    const formatted = formatRupiah(52000);
    // id-ID format might contain regular or non-breaking space
    expect(formatted.replace(/\s+/g, ' ')).toBe('Rp 52.000');
  });

  it('formats zero to IDR format', () => {
    const formatted = formatRupiah(0);
    expect(formatted.replace(/\s+/g, ' ')).toBe('Rp 0');
  });
});

describe('timeAgo', () => {
  const baseNow = new Date('2026-10-22T19:30:00Z');

  it('returns em dash for null or undefined', () => {
    expect(timeAgo(null, baseNow)).toBe('—');
    expect(timeAgo(undefined, baseNow)).toBe('—');
  });

  it('returns em dash for invalid ISO strings', () => {
    expect(timeAgo('invalid-date', baseNow)).toBe('—');
  });

  it('returns just now for future or very recent timestamps (< 60s)', () => {
    const recent = new Date(baseNow.getTime() - 25 * 1000).toISOString();
    expect(timeAgo(recent, baseNow)).toBe('just now');

    const future = new Date(baseNow.getTime() + 10 * 1000).toISOString();
    expect(timeAgo(future, baseNow)).toBe('just now');
  });

  it('returns Xm ago for minutes (< 60m)', () => {
    const fiveMinutesAgo = new Date(baseNow.getTime() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fiveMinutesAgo, baseNow)).toBe('5m ago');

    const fiftyNineMinAgo = new Date(baseNow.getTime() - 59 * 60 * 1000).toISOString();
    expect(timeAgo(fiftyNineMinAgo, baseNow)).toBe('59m ago');
  });

  it('returns Xh ago for hours (< 24h)', () => {
    const twoHoursAgo = new Date(baseNow.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twoHoursAgo, baseNow)).toBe('2h ago');

    const twentyThreeHoursAgo = new Date(baseNow.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twentyThreeHoursAgo, baseNow)).toBe('23h ago');
  });

  it('returns Xd ago for days (>= 24h)', () => {
    const oneDayAgo = new Date(baseNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneDayAgo, baseNow)).toBe('1d ago');

    const fiveDaysAgo = new Date(baseNow.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fiveDaysAgo, baseNow)).toBe('5d ago');
  });
});
