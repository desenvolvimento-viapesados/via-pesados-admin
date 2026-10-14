/*
 * Medição da landing e das páginas de busca.
 *
 * A conversão que importa é uma só: o clique no WhatsApp, que é onde a
 * conversa com o lojista começa. As campanhas da Meta e do Google Ads
 * otimizam para ela — sem este aviso, elas gastam a verba às cegas.
 *
 * Um arquivo para todas as páginas: trocar um ID aqui vale para a landing
 * e para as cinco páginas de busca (que saem de scripts/gerar-paginas-seo.py).
 *
 * O navegador guarda este arquivo por 4 horas: ao mudá-lo, suba o "?v=" em
 * public/conheca/index.html e em scripts/gerar-paginas-seo.py (e rode o
 * gerador), senão quem já visitou continua com a versão velha.
 */
(function () {
  var PIXEL_META = '1439814911458702';
  /* Google Ads: a tag da conta e a conversão "Clique no WhatsApp"
     (categoria Contato, primária). O rótulo vem do snippet de evento. */
  var GOOGLE_ADS = { id: 'AW-18511315341', rotulo: 'pfmFCK2U55sdEI2D8fpE' };

  /* Pixel da Meta, o código oficial. */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL_META);
  fbq('track', 'PageView');

  if (GOOGLE_ADS) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GOOGLE_ADS.id;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GOOGLE_ADS.id);
  }

  /* O mesmo clique também vai pelo servidor (API de Conversões, função
     meta-conversao): o navegador que bloqueia o pixel não bloqueia isto. O
     event_id é o mesmo nos dois, e a Meta conta uma vez só. */
  var SERVIDOR = 'https://ktjvyysqhsyvjmhumjly.supabase.co/functions/v1/meta-conversao';
  var cookie = function (nome) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  };
  var fbclid = new URLSearchParams(location.search).get('fbclid');
  var idDoEvento = function () {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  };

  /* Qualquer botão de WhatsApp, de qualquer página, sem marcar um por um:
     botão novo na landing já entra na conta. Só o caminho da página e os
     cookies do próprio pixel vão junto — nada que o visitante digitou. */
  var pagina = location.pathname.replace(/\/+$/, '') || '/';
  document.addEventListener('click', function (ev) {
    var alvo = ev.target && ev.target.closest
      && ev.target.closest('a[href*="wa.me/"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]');
    if (!alvo) return;
    var id = idDoEvento();
    /* data-cta diz qual botão da página foi: mostra que chamada converte */
    var lugar = alvo.getAttribute('data-cta');
    var nome = lugar ? pagina + ' · ' + lugar : pagina;
    try { fbq('track', 'Contact', { content_name: nome }, { eventID: id }); } catch (e) { /* medição nunca trava o clique */ }
    try {
      var fbc = cookie('_fbc') || (fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : undefined);
      var corpo = JSON.stringify({
        event_name: 'Contact', event_id: id, url: location.href, content_name: nome,
        fbp: cookie('_fbp'), fbc: fbc,
      });
      if (navigator.sendBeacon) navigator.sendBeacon(SERVIDOR, new Blob([corpo], { type: 'text/plain' }));
      else fetch(SERVIDOR, { method: 'POST', body: corpo, keepalive: true, mode: 'cors' });
    } catch (e) { /* idem */ }
    if (GOOGLE_ADS && GOOGLE_ADS.rotulo && window.gtag) {
      try { window.gtag('event', 'conversion', { send_to: GOOGLE_ADS.id + '/' + GOOGLE_ADS.rotulo }); } catch (e) { /* idem */ }
    }
  }, true);
})();
