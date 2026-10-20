/* Atendimento pelo WhatsApp (clique para conversar).
   O número fica em js/config.js (whatsapp). Sem número, nada aparece.
   A mensagem pronta muda conforme a página: plano escolhido, pedido, fatura, cliente logado. */
(() => {
  const config = window.FHP_CONFIG || {};
  const number = String(config.whatsapp || '').replace(/\D/g, '');
  if (number.length < 12) {
    window.FHPWhats = { ativo: false, link: () => '', numero: '' };
    return;
  }

  const display = (() => {
    const local = number.slice(2);
    return `(${local.slice(0, 2)}) ${local.slice(2, local.length - 4)}-${local.slice(-4)}`;
  })();
  const link = text => `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  window.FHPWhats = { ativo: true, link, numero: display };

  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  const A = window.FHP;
  const session = () => A?.session?.() || null;
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const monthName = month => {
    const [year, m] = String(month || '').split('-').map(Number);
    return MONTHS[m - 1] ? `${MONTHS[m - 1]} de ${year}` : month;
  };

  // Mensagem pronta para a página atual (calculada na hora do clique).
  const messageForPage = () => {
    const params = new URLSearchParams(location.search); // o checkout troca a URL ao criar o pedido
    const user = session();
    const who = user?.nivel === 'cliente' ? ` Sou cliente, ${user.nome.split(' ')[0]}.` : '';
    if (page === 'checkout') {
      const order = params.get('pedido') && A?.findOrder ? A.findOrder(params.get('pedido')) : null;
      if (order?.tipo === 'fatura') return `Oi! Preciso de ajuda com o pagamento da fatura de ${monthName(order.competencia)} (pedido ${order.id}).${who}`;
      if (order) return `Oi! Estou assinando o plano ${order.plano.nome} pelo site e fiquei com uma dúvida (pedido ${order.id}).`;
      if (params.get('fatura')) return `Oi! Preciso de ajuda com a fatura de ${monthName(params.get('fatura'))}.${who}`;
      if (params.get('plano')) return `Oi! Estou assinando o plano ${params.get('plano')} pelo site e fiquei com uma dúvida.`;
    }
    if (page === 'painel') return `Oi! Preciso de ajuda com a minha conta FHP.${who}`;
    if (page === 'planos') return 'Oi! Vim pelo site e quero saber mais sobre os planos da FHP Fibra.';
    if (page === 'fale-conosco') return 'Oi! Vim pelo site da FHP Fibra e quero falar com a equipe.';
    return 'Oi! Vim pelo site da FHP Fibra e quero tirar uma dúvida.';
  };

  const icon = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 3.5C9.1 3.5 3.5 8.9 3.5 15.6c0 2.4.7 4.6 1.9 6.5L3.8 28.5l6.7-1.8c1.7.9 3.5 1.3 5.5 1.3 6.9 0 12.5-5.4 12.5-12.2S22.9 3.5 16 3.5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11.6 9.6c.4-.4 1.1-.4 1.4.1l1.5 2.1c.3.4.2 1-.1 1.3l-.8.8c.7 1.5 1.9 2.8 3.5 3.6l.8-.8c.3-.3.9-.4 1.3-.1l2.1 1.5c.5.3.5 1 .1 1.4l-1 1c-.6.6-1.5.8-2.3.5-3.3-1.2-5.8-3.7-7-7-.3-.8-.1-1.7.5-2.3z" fill="currentColor"/></svg>';

  const anchor = (className, html, message) => {
    const a = document.createElement('a');
    a.className = className;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = html;
    const update = () => { a.href = link(typeof message === 'function' ? message() : message); };
    update();
    // Atualiza a mensagem na hora do clique (o pedido ou a fatura podem ter mudado).
    ['pointerdown', 'focus', 'click'].forEach(type => a.addEventListener(type, update));
    return a;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'css/whatsapp.css';
    document.head.append(style);

    // Botão flutuante (no painel, só para clientes).
    const user = session();
    if (page !== 'painel' || user?.nivel === 'cliente') {
      const fab = anchor('wa-fab', `${icon}<span class="wa-tip">Fale no WhatsApp</span>`, messageForPage);
      fab.setAttribute('aria-label', `Falar com a FHP Fibra no WhatsApp, ${display}`);
      if (document.querySelector('script[src$="bot.js"]')) fab.classList.add('with-bot');
      document.body.append(fab);
    }

    // Planos: atalho para tirar dúvidas sobre cada plano.
    document.querySelectorAll('.plan-card [data-assinar]').forEach(button => {
      const name = button.dataset.assinar;
      const business = /business/i.test(name);
      const text = business
        ? `Oi! Tenho interesse no ${name} para a minha empresa. Podem me enviar uma proposta?`
        : `Oi! Vi o plano ${name} no site e quero tirar umas dúvidas antes de assinar.`;
      button.after(anchor('wa-inline', `${icon}<span>${business ? 'Pedir proposta no WhatsApp' : 'Dúvidas? Fale no WhatsApp'}</span>`, text));
    });

    // Fale Conosco: WhatsApp como primeiro canal.
    const notes = document.querySelector('.contact-notes');
    if (notes) {
      const card = anchor('wa-card', `${icon}<span><b>WhatsApp ${display}</b><small>O jeito mais rápido de falar com a equipe.</small></span>`, messageForPage);
      notes.prepend(card);
    }

    // Rodapé do site.
    document.querySelectorAll('.site-footer nav').forEach(nav => {
      nav.append(anchor('wa-footer', `WhatsApp ${display}`, 'Oi! Vim pelo site da FHP Fibra e quero tirar uma dúvida.'));
    });

    // Painel do cliente: botão no cartão "Precisa de ajuda?".
    if (page === 'painel' && user?.nivel === 'cliente') {
      const addToHelpCard = () => {
        const helpButton = document.querySelector('#panel-content [data-go="mensagens"]');
        if (helpButton && !helpButton.parentElement.querySelector('.wa-inline')) {
          helpButton.after(anchor('wa-inline', `${icon}<span>Falar no WhatsApp</span>`, messageForPage));
        }
      };
      addToHelpCard();
      const content = document.querySelector('#panel-content');
      if (content) new MutationObserver(addToHelpCard).observe(content, { childList: true });
    }
  });
})();
