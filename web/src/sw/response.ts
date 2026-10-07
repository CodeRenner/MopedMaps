/**
 * Safari refuses a navigation answered by the service worker with a response
 * whose `redirected` flag is set ("Response served by service worker has
 * redirections"). Cloudflare Pages redirects /index.html -> / (308), so the
 * precached shell is such a response. Copying body, status and headers into a
 * new Response clears the flag.
 */
export async function withoutRedirect(res: Response): Promise<Response> {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
