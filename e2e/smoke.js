// Димовий тест ТЕСТ-версії скрипта на живій CRM (read-only, нічого не зберігає).
// Використання: NODE_PATH=$(npm root -g) node e2e/smoke.js [#/order/update/ID]
const fs = require('fs');
const { openSD } = require('./bridge');
(async () => {
  const script = fs.readFileSync(__dirname + '/../salesdrive.dev.user.js', 'utf8');
  const shim = fs.readFileSync(__dirname + '/gm-shim-page.js', 'utf8');
  const hash = process.argv[2] || '#/order/index';
  const { browser, page, rc } = await openSD();
  const logs = [];
  page.on('console', m => logs.push('['+m.type()+'] '+m.text().slice(0,160)));
  page.on('pageerror', e => logs.push('[PAGEERROR] '+String(e).slice(0,200)));
  await page.goto('https://komplektom.salesdrive.me/ua/index.html?formId=1'+hash, { waitUntil:'domcontentloaded', timeout:45000 }).catch(()=>{});
  await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(3000);
  await page.addScriptTag({ content: shim + '\n' + script });
  await page.waitForTimeout(8000);
  const st = await page.evaluate(() => ({
    cashBtn: !!document.getElementById('lk-cash-btn'),
    kbBtn: !!document.getElementById('sd-kb-btn'),
    pickupBtn: !!document.getElementById('lk-pickup-btn'),
    upsell: !!document.getElementById('sd-upsell-hint')
  }));
  console.log('STATE:', JSON.stringify(st));
  const bad = logs.filter(l => /PAGEERROR|модуль .* не запустився/i.test(l));
  console.log(bad.length ? 'ПОМИЛКИ:\n'+bad.join('\n') : 'ПОМИЛОК НЕМАЄ ✅');
  await page.screenshot({ path: __dirname + '/smoke.png' });
  await browser.close(); await rc.dispose();
})();
