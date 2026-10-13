/*
 * Medição da landing e das páginas de busca.
 *
 * A conversão que importa é uma só: o clique no WhatsApp, que é onde a
 * conversa com o lojista começa. As campanhas da Meta e do Google Ads
 * otimizam para ela — sem este aviso, elas gastam a verba às cegas.
 *
 * Um arquivo para todas as páginas: trocar um ID aqui vale para a landing
 * e para as cinco páginas de busca (que saem de scripts/gerar-paginas-seo.py).
 */
(function () {
  var PIXEL_META = '1439814911458702';
  /* Conversão "Contato" do Google Ads: preencher quando ela for criada,
     no formato { id: 'AW-123456789', rotulo: 'AbCdEfGh' }. */
  var GOOGLE_ADS = null;

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

  /* Qualquer botão de WhatsApp, de qualquer página, sem marcar um por um:
     botão novo na landing já entra na conta. Só o caminho da página vai
     junto — nada do visitante. */
  var pagina = location.pathname.replace(/\/+$/, '') || '/';
  document.addEventListener('click', function (ev) {
    var alvo = ev.target && ev.target.closest
      && ev.target.closest('a[href*="wa.me/"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]');
    if (!alvo) return;
    try { fbq('track', 'Contact', { content_name: pagina }); } catch (e) { /* medição nunca trava o clique */ }
    if (GOOGLE_ADS && window.gtag) {
      try { window.gtag('event', 'conversion', { send_to: GOOGLE_ADS.id + '/' + GOOGLE_ADS.rotulo }); } catch (e) { /* idem */ }
    }
  }, true);
})();
