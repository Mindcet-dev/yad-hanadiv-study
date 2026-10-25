const { chromium } = require('playwright');
const fs = require('fs');
const DIST = __dirname + '/../dist';
const cfg = who => `window.LIVE_CONFIG={siteName:"מרחב הלמידה המשותף",firebase:{apiKey:"fake",authDomain:"demo-yad.firebaseapp.com",projectId:"demo-yad",storageBucket:"demo-yad.appspot.com",appId:"x"},emulators:{host:"127.0.0.1",signInAs:${JSON.stringify(who)}}};`;
async function page(browser, who) {
  const ctx = await browser.newContext();
  await ctx.route('http://127.0.0.1:5555/**', r => {
    let p = new URL(r.request().url()).pathname; if (p === '/') p = '/index.html';
    if (p === '/config.js') return r.fulfill({ body: cfg(who), contentType: 'text/javascript' });
    const f = DIST + decodeURIComponent(p);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const ct = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/pdf';
    r.fulfill({ body: fs.readFileSync(f), contentType: ct });
  });
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => {
    const name = new URL(r.request().url()).pathname.split('/').pop();
    r.fulfill({ body: fs.readFileSync(require.resolve('firebase/package.json').replace('package.json', '') + name), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const pg = await ctx.newPage();
  //pg.on('requestfailed', q => console.log('FAILED', q.url().slice(0,120), q.failure()?.errorText));
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://127.0.0.1:5555/');
  return pg;
}
(async () => {
  await fetch('http://127.0.0.1:8080/v1/projects/demo-yad/databases/(default)/documents/facilitators/fac@example.com', { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{"fields":{}}' });
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const fac = await page(browser, { uid: 'fac1', email: 'fac@example.com', name: 'Facilitator' });
  await fac.waitForSelector('#live-seed button', { timeout: 20000 });
  await fac.click('#live-seed button');
  await fac.waitForFunction(() => document.querySelector('#live-seed span')?.textContent.includes('הושלם') || document.querySelector('#live-seed span')?.textContent.includes('נכשל'), null, { timeout: 30000 });
  console.log('seed:', await fac.textContent('#live-seed span'));
  await fac.waitForTimeout(1500);
  console.log('fac pill:', await fac.$eval('#who', e => e.textContent));
  await fac.goto('http://127.0.0.1:5555/#session-1'); await fac.waitForTimeout(3000);
  const hrefs = await fac.$$eval('a[href*="9199"]', as => as.map(a => a.href));
  console.log('material links:', hrefs.length);
  if (hrefs[0]) console.log('pdf status:', (await fetch(hrefs[0])).status);
  await fac.screenshot({ path: 'fac.png', fullPage: false });

  const p = await page(browser, { uid: 'p1', email: 'p@example.com', name: 'Participant' });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(async () => {
    const db = await claude.use('db'); const out = {}; const me = (await (await claude.use('user')).me()).id; const others = (await new Promise(r => db.collection('profiles').onSnapshot(r))).docs.map(d => d.id).filter(i => i !== me);
    const t = async (k, f) => { try { await f(); out[k] = 'ok'; } catch (e) { out[k] = 'ERR ' + e.code; } };
    let ref;
    await t('addOwnInsight', async () => { ref = await db.collection('insights').add({ text: 'hi', createdBy: me, createdAt: Date.now() }); });
    await t('updateOwn', () => ref.update({ text: 'hi2' }));
    await t('makeOwnOfficial', () => ref.update({ official: true }));
    await t('addOfficialMaterial', () => db.collection('materials').add({ title: 'x', createdBy: me, official: true }));
    await t('editHome', () => db.doc('official/home').update({ purpose: 'hacked' }));
    await t('deleteSeedMaterial', () => db.doc('materials/s1-summary-he').delete());
    await t('writeOwnFeedback', () => db.doc('feedback/' + me).set({ responses: {} }));
    await t('writeOthersPeople', () => db.doc('people/' + others[0]).set({ name: 'x' }));
    const user = await claude.use('user'); out.isOwner = await user.isOwner();
    out.profiles = JSON.stringify(await user.profiles(others));
    const assets = await claude.use('assets');
    await t('uploadPdf', async () => { out.up = (await assets.upload(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { type: 'application/pdf' })).id; });
    await t('uploadDocx', () => assets.upload(new Blob(['x']), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    await t('deleteSeedAsset', () => assets.delete('11567f1ef526c6abeb26f4f6bc01e1a9'));
    await t('deleteOwnAsset', () => assets.delete(out.up));
    return out;
  });
  console.log(r);
  const fr = await fac.evaluate(async () => { const db = await claude.use('db'); return new Promise(res => db.collection('feedback').onSnapshot(s => res(s.docs.length), e => res('ERR ' + e.code))); });
  console.log('fac reads feedback count:', fr);
  await browser.close();
})();
