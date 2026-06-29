import { describe, it, expect, vi } from 'vitest';
import { ActionRegistry } from './actions';

describe('ActionRegistry', () => {
  it('dispatches a registered handler', async () => {
    const r = new ActionRegistry();
    const fn = vi.fn();
    r.register('document.save', fn);
    await r.dispatch('document.save');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('has() reflects registration', () => {
    const r = new ActionRegistry();
    expect(r.has('x')).toBe(false);
    r.register('x', () => {});
    expect(r.has('x')).toBe(true);
  });

  it('dispatching an unknown action is a no-op (no throw)', async () => {
    const r = new ActionRegistry();
    await expect(r.dispatch('nope')).resolves.toBeUndefined();
  });

  it('awaits async handlers', async () => {
    const r = new ActionRegistry();
    let done = false;
    r.register('a', async () => {
      await Promise.resolve();
      done = true;
    });
    await r.dispatch('a');
    expect(done).toBe(true);
  });
});
