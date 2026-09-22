import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isHostDisabled, normalizeSettings } from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ policy: 'nope', confidenceThreshold: 'a' })).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps threshold and normalizes endpoint/hosts', () => {
    const s = normalizeSettings({ confidenceThreshold: 5, openjev: { endpoint: ' https://jev.local/ ' }, disabledHosts: ['A.CZ', 3, ' b.cz '] });
    expect(s.confidenceThreshold).toBe(0.95);
    expect(s.openjev.endpoint).toBe('https://jev.local');
    expect(s.disabledHosts).toEqual(['a.cz', 'b.cz']);
  });
});

describe('isHostDisabled', () => {
  it('matches exact and subdomains', () => {
    expect(isHostDisabled('www.example.com', ['example.com'])).toBe(true);
    expect(isHostDisabled('example.com', ['example.com'])).toBe(true);
    expect(isHostDisabled('notexample.com', ['example.com'])).toBe(false);
    expect(isHostDisabled('x.cz', [])).toBe(false);
  });
});
