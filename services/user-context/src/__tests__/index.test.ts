import { describe, expect, it } from 'vitest';

describe('S4: service listener safety', () => {
  it('binds to loopback by default', async () => {
    const { getListenHost } = await import('../index.js');

    expect(getListenHost({})).toBe('127.0.0.1');
  });
});
