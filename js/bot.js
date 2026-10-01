(() => {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const L = (href, txt) => `<a href="${href}">${txt}</a>`;

  const topics = [
    { k: ['oi','ola','bom dia','boa tarde','boa noite','e ai','hello'],
      r: 'Olá! 👋 Sou o assistente virtual da FHP Fibra. Posso falar sobre planos, suporte, contato e Área do Cliente. Como posso ajudar?' },
    { k: ['plano','planos','valor','preco','quanto custa','mega','giga','velocidade'],
      r: `Nossos planos residenciais (valores demonstrativos):<br>• <b>FHP Start</b> — 300 Mega, R$ 79,90/mês<br>• <b>FHP Turbo</b> — 500 Mega, R$ 99,90/mês ⭐<br>• <b>FHP Ultra</b> — 700 Mega, R$ 119,90/mês<br>• <b>FHP Gamer</b> — 1 Giga, R$ 149,90/mês<br>${L('planos.html','Ver todos os planos')}` },
    { k: ['empresa','empresarial','business','negocio','cnpj'],
      r: `Para empresas temos o <b>Business 500</b>, <b>Business 700</b> e <b>Business 1 Giga</b>. ${L('planos.html#empresarial','Ver planos empresariais')} ou ${L('fale-conosco.html?assunto=Planos%20empresariais','fale com a equipe')}.` },
    { k: ['contratar','assinar','quero','interesse','instalacao','instalar'],
      r: `Que bom! Escolha um plano em ${L('planos.html','Planos')} e clique em "Tenho interesse", ou envie uma mensagem em ${L('fale-conosco.html','Fale Conosco')}. A instalação está inclusa nos planos residenciais.` },
    { k: ['lenta','lento','caiu','sem internet','nao funciona','travando','oscilando','suporte','problema','wifi','wi-fi','roteador'],
      r: `Sinto muito pelo problema! Tente isto:<br>1. Desligue o roteador da tomada por 1 minuto e ligue de novo.<br>2. Confira se os cabos estão bem encaixados.<br>3. Veja se há luz vermelha no equipamento.<br>Se continuar, ${L('fale-conosco.html?assunto=Suporte','abra um pedido de suporte')}.` },
    { k: ['login','entrar','area do cliente','senha','acesso','painel','fatura','boleto','2 via','segunda via'],
      r: `Acesse a ${L('login.html','Área do Cliente')} para ver seu plano, dados e solicitações. A recuperação de senha desta demonstração é ilustrativa.` },
    { k: ['fibra','optica','tecnologia'],
      r: 'A fibra óptica transmite dados por pulsos de luz, com alta velocidade e estabilidade. É a tecnologia base de todos os nossos planos. ✨' },
    { k: ['onde','cobertura','regiao','bairro','zona oeste','atende','endereco'],
      r: `A FHP Fibra atua na <b>Zona Oeste do Rio de Janeiro</b>. Para saber se atendemos seu endereço, ${L('fale-conosco.html?assunto=Cobertura','fale com a equipe')}.` },
    { k: ['quem somos','sobre','missao','visao','valores','empresa fhp'],
      r: `A FHP é uma provedora de fibra óptica focada em pessoas, empresas e comunidades. Conheça mais em ${L('quem-somos.html','Quem Somos')}.` },
    { k: ['contato','falar','atendente','humano','telefone','email','mensagem','whatsapp'],
      r: `Para falar com a equipe, use o ${L('fale-conosco.html','formulário de Fale Conosco')}. Este site é demonstrativo, então não há atendimento real por telefone.` },
    { k: ['horario','funcionamento','aberto'],
      r: 'Este é um projeto demonstrativo, então não há horário de atendimento oficial definido.' },
    { k: ['obrigado','obrigada','valeu','thanks','tchau'],
      r: 'Por nada! Se precisar de mais alguma coisa, é só chamar. 💜' }
  ];
  const fallback = `Não entendi muito bem 🤔. Posso ajudar com <b>planos</b>, <b>suporte</b>, <b>cobertura</b> e <b>Área do Cliente</b>. Ou ${L('fale-conosco.html','fale com a equipe')}.`;
  const chips = ['Ver planos', 'Suporte técnico', 'Planos empresariais', 'Área do cliente', 'Falar com a equipe'];

  document.addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'css/bot.css';
    document.head.appendChild(css);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button class="bot-fab" aria-label="Abrir assistente virtual" aria-expanded="false">💬</button>
      <section class="bot-panel" role="dialog" aria-label="Assistente virtual FHP">
        <header class="bot-head"><span class="bot-avatar">🤖</span><div><b>Assistente FHP</b><small class="bot-status">● Online · Demonstrativo</small></div><button class="bot-close" aria-label="Fechar">✕</button></header>
        <div class="bot-body" aria-live="polite"></div>
        <div class="bot-chips"></div>
        <form class="bot-form"><input type="text" placeholder="Digite sua dúvida..." aria-label="Mensagem" autocomplete="off"><button type="submit">Enviar</button></form>
        <p class="bot-note">Respostas de IA podem conter erros. Projeto demonstrativo.</p>
      </section>`;
    document.body.append(...wrap.children);

    const fab = document.querySelector('.bot-fab'), panel = document.querySelector('.bot-panel');
    const body = panel.querySelector('.bot-body'), chipBox = panel.querySelector('.bot-chips');
    const form = panel.querySelector('.bot-form'), input = form.querySelector('input');
    let greeted = false;

    const add = (html, who, asText) => {
      const m = document.createElement('div');
      m.className = 'bot-msg ' + who;
      asText ? (m.textContent = html) : (m.innerHTML = html);
      body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
    };
    const ENDPOINT = (window.FHP_BOT && window.FHP_BOT.endpoint) || (location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat');
    const status = panel.querySelector('.bot-status');
    const history = []; let busy = false;
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|[a-z0-9-]+\.html)[^)\s]*)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/\n/g, '<br>');
    const ruleReply = text => {
      const t = norm(text);
      const hit = topics.find(x => x.k.some(w => new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t)));
      return hit ? hit.r : fallback;
    };
    const reply = async text => {
      busy = true;
      const typing = document.createElement('div');
      typing.className = 'bot-msg bot bot-typing'; typing.innerHTML = '<i></i><i></i><i></i>';
      body.appendChild(typing); body.scrollTop = body.scrollHeight;
      history.push({ role: 'user', content: text });
      let out;
      try {
        const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
        if (r.status === 429) { history.pop(); out = 'Você enviou muitas mensagens em pouco tempo. Aguarde um minutinho e tente de novo. 🙂'; }
        else if (!r.ok) throw new Error(r.status);
        else {
          const d = await r.json();
          history.push({ role: 'assistant', content: d.reply });
          out = fmt(d.reply); status.textContent = '● Online · IA';
        }
      } catch (e) {
        history.pop();
        status.textContent = '● Modo básico (IA indisponível)';
        out = ruleReply(text);
      }
      typing.remove(); add(out, 'bot'); busy = false;
    };
    const send = text => { text = text.trim(); if (!text || busy) return; add(text, 'user', true); reply(text); };

    chips.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
      b.onclick = () => send(c); chipBox.appendChild(b);
    });

    const toggle = open => {
      panel.classList.toggle('open', open);
      fab.setAttribute('aria-expanded', open);
      fab.textContent = open ? '✕' : '💬';
      if (open) {
        if (!greeted) { greeted = true; add('Olá! 👋 Sou o assistente virtual da <b>FHP Fibra</b>. Escolha uma opção abaixo ou digite sua dúvida.', 'bot'); }
        input.focus();
      }
    };
    fab.onclick = () => toggle(!panel.classList.contains('open'));
    panel.querySelector('.bot-close').onclick = () => toggle(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    form.addEventListener('submit', e => { e.preventDefault(); send(input.value); input.value = ''; });
  });
})();
