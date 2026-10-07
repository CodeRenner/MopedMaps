import { describe, expect, it } from 'vitest';
import { withoutRedirect } from '../src/sw/response';

describe('withoutRedirect', () => {
  it('returns non-redirected responses unchanged', async () => {
    const r = new Response('x');
    expect(await withoutRedirect(r)).toBe(r);
  });

  it('copies redirected responses into a clean one', async () => {
    const r = new Response('<html>shell</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(r, 'redirected', { value: true });
    const clean = await withoutRedirect(r);
    expect(clean).not.toBe(r);
    expect(clean.redirected).toBe(false);
    expect(clean.status).toBe(200);
    expect(clean.headers.get('content-type')).toBe('text/html');
    expect(await clean.text()).toBe('<html>shell</html>');
  });
});
