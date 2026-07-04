// Вхід у SalesDrive і збереження сесії (e2e/sd-session.json).
// Використання: SD_LOGIN=... SD_PASS=... NODE_PATH=$(npm root -g) node e2e/login.js
const { openSD } = require('./bridge');
(async () => {
  const { browser, page, ctx, rc } = await openSD({ session: undefined });
  await page.goto('https://komplektom.salesdrive.me/auth/login/', { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(()=>{});
  await page.waitForSelector('input[name="login"]', { timeout: 20000 });
  await page.fill('input[name="login"]', process.env.SD_LOGIN);
  await page.fill('input[name="password"]', process.env.SD_PASS);
  await Promise.all([
    page.waitForNavigation({ timeout: 30000 }).catch(()=>{}),
    page.click('button[type="submit"], input[type="submit"], .btn-primary')
  ]);
  await page.waitForTimeout(4000);
  await ctx.storageState({ path: __dirname + '/sd-session.json' });
  console.log('SESSION SAVED -> e2e/sd-session.json');
  await browser.close(); await rc.dispose();
})();
