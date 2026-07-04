const { chromium, request } = require('playwright');
async function openSD(opts = {}) {
  const rc = await request.newContext({ proxy: { server: process.env.HTTPS_PROXY } });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 950 },
    storageState: opts.session || 'sd-session.json'
  });
  await ctx.route('**/*', async (route) => {
    try {
      const req = route.request();
      const resp = await rc.fetch(req.url(), {
        method: req.method(), headers: req.headers(),
        data: req.postDataBuffer() || undefined, maxRedirects: 0, timeout: 30000
      });
      const h = resp.headers();
      delete h['content-encoding']; delete h['content-length'];
      h['access-control-allow-origin'] = '*';
      await route.fulfill({ status: resp.status(), headers: h, body: await resp.body() });
    } catch (e) { try { await route.abort(); } catch(_){} }
  });
  const page = await ctx.newPage();
  return { browser, ctx, page, rc };
}
module.exports = { openSD };
