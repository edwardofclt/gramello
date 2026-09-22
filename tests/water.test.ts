import { describe, expect, it } from 'vitest';
import { waterToMl, waterFromMl, waterLabel, waterAmountSchema, waterDateSchema } from '../lib/water';

describe('water volumes', () => {
  it('converts US fluid ounces accurately and keeps fractional volumes', () => {
    expect(waterToMl(16, 'fl-oz')).toBeCloseTo(473.176473, 6);
    expect(waterFromMl(waterToMl(16.9, 'fl-oz'), 'fl-oz')).toBeCloseTo(16.9, 10);
    expect(waterToMl(250.5, 'ml')).toBe(250.5);
    expect(waterLabel(473.176473, 'fl-oz')).toBe('16 US fl oz');
    expect(waterLabel(473.176473, 'ml')).toBe('473.2 mL');
    expect(waterLabel(1, 'fl-oz')).toBe('0.034 US fl oz');
  });
  it('rejects nonfinite and out-of-range amounts and validates actual calendar dates', () => {
    for (const value of [NaN, Infinity, -Infinity, 0, -1, 10001, '250', null]) expect(waterAmountSchema.safeParse(value).success).toBe(false);
    expect(waterDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(waterDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(waterDateSchema.safeParse('2026-09-19T00:00:00Z').success).toBe(false);
  });
});
