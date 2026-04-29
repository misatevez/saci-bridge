import { describe, it, expect } from 'vitest';
import { computeNextRetry } from '../src/saci-client.js';

describe('computeNextRetry', () => {
  it('retry 1 with base 1000ms gives ~2s delay', () => {
    const before = Date.now();
    const next = computeNextRetry(1, 1000);
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 2000 - 50);
    expect(next.getTime()).toBeLessThanOrEqual(before + 2000 + 200);
  });

  it('retry 2 gives ~4s delay', () => {
    const before = Date.now();
    const next = computeNextRetry(2, 1000);
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 4000 - 50);
  });

  it('retry 3 gives ~8s delay', () => {
    const before = Date.now();
    const next = computeNextRetry(3, 1000);
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 8000 - 50);
  });

  it('scales with custom backoff base', () => {
    const before = Date.now();
    const next = computeNextRetry(1, 500);
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 1000 - 50);
    expect(next.getTime()).toBeLessThanOrEqual(before + 1000 + 200);
  });
});
