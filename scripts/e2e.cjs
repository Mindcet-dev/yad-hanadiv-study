const { chromium } = require('playwright');
const fs = require('fs');
const sbLog = [];
const DIST = __dirname + '/../dist';
const cfg = who => `window.LIVE_CONFIG={siteName:"מרחב הלמידה המשותף",supabase:${process.env.SB_BUNDLE ? '{url:"https://sb.test",anonKey:"anon",bucket:"yad-hanadiv-study"}' : "null"},firebase:{apiKey:"fake",authDomain:"demo-yad.firebaseapp.com",projectId:"demo-yad",storageBucket:"demo-yad.appspot.com",appId:"x"},emulators:{host:"127.0.0.1",signInAs:${JSON.stringify(who)}}};`;
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
  // Supabase: SDK from a local bundle (SB_BUNDLE), Storage API mocked; the mock deletes only objects named after the caller's uid.
  if (process.env.SB_BUNDLE) {
    await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**', r => r.fulfill({ body: fs.readFileSync(process.env.SB_BUNDLE), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await ctx.route('https://sb.test/**', r => {
      const q = r.request(), h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
      if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
      const tok = (q.headers().authorization || '').split(' ')[1] || '';
      const claims = JSON.parse(Buffer.from(tok.split('.')[1] || 'e30', 'base64url').toString());
      const sub = claims.iss && claims.iss.startsWith('https://securetoken.google.com/') ? claims.sub : null;
      sbLog.push(q.method() + ' ' + new URL(q.url()).pathname + ' sub=' + !!sub);
      if (!sub) return r.fulfill({ status: 403, headers: h, json: { statusCode: '403', error: 'Unauthorized', message: 'no firebase token' } });
      if (q.method() === 'POST') {
        const name = decodeURIComponent(new URL(q.url()).pathname.split('/').pop());
        if (!name.startsWith(sub + '-')) return r.fulfill({ status: 400, headers: h, json: { statusCode: '403', error: 'Unauthorized', message: 'row-level security' } });
        return r.fulfill({ headers: h, json: { Key: 'yad-hanadiv-study/' + name, Id: 'x' } });
      }
      if (q.method() === 'DELETE') {
        const names = JSON.parse(q.postData() || '{}').prefixes || [];
        return r.fulfill({ headers: h, json: names.filter(n => n.startsWith(sub + '-') || claims.email === 'fac@example.com').map(n => ({ name: n })) });
      }
      r.fulfill({ status: 404, headers: h, body: '' });
    });
  }
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
  const hrefs = await fac.$$eval('a[href*="9199"], a[href*="seed/files"]', as => as.map(a => a.href));
  console.log('material links:', hrefs.length);
  if (hrefs[0]) console.log('file status:', await fac.evaluate(u => fetch(u).then(r => r.status), hrefs[0]));
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
    out.assets = !!assets;
    if (!assets) return out;
    await t('uploadPdf', async () => { out.up = (await assets.upload(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { type: 'application/pdf' })).id; });
    await t('uploadDocx', () => assets.upload(new Blob(['x']), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    await t('deleteSeedAsset', () => assets.delete('11567f1ef526c6abeb26f4f6bc01e1a9'));
    await t('deleteOthersAsset', () => assets.delete('someoneelse-0123'));
    out.upUrl = __blobUrl(out.up);
    await t('deleteOwnAsset', () => assets.delete(out.up));
    return out;
  });
  console.log(r);
  const fr = await fac.evaluate(async () => { const db = await claude.use('db'); return new Promise(res => db.collection('feedback').onSnapshot(s => res(s.docs.length), e => res('ERR ' + e.code))); });
  console.log('fac reads feedback count:', fr);
  if (sbLog.length) console.log('supabase calls:', sbLog);
  await browser.close();
})();
