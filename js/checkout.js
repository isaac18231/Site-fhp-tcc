/* Checkout da FHP Fibra: assinatura de plano (?plano=) e pagamento de fatura (?fatura=AAAA-MM).
   Dois modos, escolhidos por js/config.js:
   - simulado: Pix, cartão e boleto de mentira, sem cobrar nada (padrão);
   - Mercado Pago: leva ao Checkout Pro e, na volta (?pedido=...&retorno=mp),
     confirma o status com o servidor (servidor/pagamentos.js).
   Os pedidos ficam em localStorage (veja a parte de pagamentos em js/fhp.js).
   Número e CVV do cartão nunca são gravados: só a bandeira e os 4 últimos dígitos. */
(() => {
  const A = window.FHP;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = A.esc;
  const params = new URLSearchParams(location.search);
  const digits = value => String(value || '').replace(/\D/g, '');
  const DRAFT_KEY = 'fhpCheckoutInstalacao';
  const PIX_MINUTES = 10;
  const BOLETO_DAYS = 3;
  const METHOD_LABELS = { pix: 'Pix', cartao: 'Cartão de crédito', boleto: 'Boleto' };

  const state = {
    plan: null,      // plano escolhido
    install: null,   // endereço e dia de vencimento
    order: null,     // pedido criado ao escolher a forma de pagamento
    step: 1,
    locked: false,   // true depois de concluir: não dá para voltar etapas
    busy: false,
    pixTimer: null,
    fatura: null,    // fatura sendo paga (modo ?fatura=)
    mode: null,      // { modo: 'simulado' | 'mercadopago' | 'indisponivel', ... }
    modeReady: null  // promessa que resolve o modo
  };

  /* ---------- Máscaras e validações ---------- */

  const masks = {
    cpf: value => digits(value).slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2'),
    telefone: value => {
      const d = digits(value).slice(0, 11);
      if (d.length < 3) return d;
      const rest = d.slice(2);
      if (rest.length <= 4) return `(${d.slice(0, 2)}) ${rest}`;
      const cut = rest.length > 8 ? 5 : 4;
      return `(${d.slice(0, 2)}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
    },
    cep: value => digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
    numero: value => digits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '),
    validade: value => digits(value).slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2'),
    cvv: value => digits(value).slice(0, 4)
  };

  const validCpf = value => {
    const cpf = digits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const checkDigit = length => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
      return ((sum * 10) % 11) % 10;
    };
    return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
  };

  // Algoritmo de Luhn: confere o dígito verificador do número do cartão.
  const validCardNumber = value => {
    const number = digits(value);
    if (number.length < 13 || number.length > 19) return false;
    let sum = 0;
    [...number].reverse().forEach((char, index) => {
      let digit = Number(char);
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    });
    return sum % 10 === 0;
  };

  const cardBrand = value => {
    const number = digits(value);
    if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) return 'Elo';
    if (/^(606282|3841)/.test(number)) return 'Hipercard';
    if (/^3[47]/.test(number)) return 'Amex';
    if (/^4/.test(number)) return 'Visa';
    if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(number)) return 'Mastercard';
    return '';
  };

  const validExpiry = value => {
    const match = /^(\d{2})\/(\d{2})$/.exec(value);
    if (!match) return false;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return false;
    const now = new Date();
    return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
  };

  /* ---------- Utilidades de tela ---------- */

  const setFieldError = (input, message) => {
    const slot = $('.field-error', input.closest('.field'));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (slot) slot.textContent = message || '';
  };

  // rules: { nomeDoCampo: valor => 'mensagem de erro' ou '' }
  const validateForm = (form, rules) => {
    let firstInvalid = null;
    Object.entries(rules).forEach(([name, rule]) => {
      const input = form.elements[name];
      const message = rule(input.value.trim());
      setFieldError(input, message);
      if (message && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  };

  const showMessage = (selector, message) => {
    const element = $(selector);
    element.textContent = message || '';
    element.classList.toggle('visible', !!message);
  };

  let toastTimer;
  const toast = message => {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 2400);
  };

  const formatDate = iso => new Date(iso).toLocaleDateString('pt-BR');
  const formatDateTime = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const formatAddress = install =>
    `${install.logradouro}${install.complemento ? `, ${install.complemento}` : ''} – ${install.bairro}, ${install.cidade} – CEP ${install.cep}`;
  const customer = () => A.read(A.K.clients, []).find(user => user.email === A.session()?.email);

  // Mostra uma mensagem no lugar do checkout quando a compra não pode seguir.
  const block = (title, text, actions) => {
    $('#checkout-flow').hidden = true;
    $('#summary').hidden = true;
    $('.checkout').classList.add('single');
    const card = $('#checkout-state');
    card.hidden = false;
    card.innerHTML = `<h1>${esc(title)}</h1><p>${esc(text)}</p><div class="step-actions center">${actions
      .map(([label, href], index) => `<a class="btn ${index ? 'btn-ghost' : 'btn-primary'}" href="${esc(href)}">${esc(label)}</a>`)
      .join('')}</div>`;
  };

  /* ---------- Etapas ---------- */

  const goTo = step => {
    state.step = step;
    $$('.step').forEach(section => { section.hidden = section.id !== `step-${step}`; });
    $$('#stepper li').forEach(item => {
      const number = Number(item.dataset.step);
      const done = number < step || (state.locked && number === 4);
      item.classList.toggle('current', number === step && !done);
      item.classList.toggle('done', done);
      const button = $('button', item);
      button.disabled = state.locked || number >= step;
      if (number === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      $('.num', item).textContent = done ? '✓' : number;
    });
    $('#summary').hidden = step === 4;
    $('.checkout').classList.toggle('single', step === 4);
    const heading = $(`#step-${step} h2`);
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  const renderSummary = () => {
    const plan = state.plan;
    const price = A.priceToNumber(plan.valor);
    if (state.fatura) {
      $('#summary').innerHTML = `
        <h2>Resumo da fatura</h2>
        <div class="summary-plan">
          <span class="eyebrow">FATURA</span>
          <strong>${esc(capitalize(state.fatura.nome))}</strong>
          <span>${esc(plan.nome)} · ${esc(plan.velocidade)}</span>
        </div>
        <dl>
          <div><dt>Vencimento</dt><dd>${esc(state.fatura.vencimento.toLocaleDateString('pt-BR'))}</dd></div>
          <div class="total"><dt>Total</dt><dd>${esc(A.money(price))}</dd></div>
        </dl>
        ${state.order ? `<p class="summary-order">Pedido <b>${esc(state.order.id)}</b></p>` : '<a class="text-action" href="painel.html?secao=faturas">Ver todas as faturas</a>'}`;
      $('#card-pay').textContent = `Pagar ${A.money(price)}`;
      $('#mp-pay').textContent = `Pagar ${A.money(price)} com Mercado Pago`;
      return;
    }
    const dueDay = state.install?.vencimento || state.order?.vencimento;
    const current = customer()?.plano;
    const replacing = current && current.status === 'Ativo' && current.pedido !== state.order?.id;
    $('#summary').innerHTML = `
      <h2>Resumo do pedido</h2>
      <div class="summary-plan">
        <span class="eyebrow">PLANO</span>
        <strong>${esc(plan.nome)}</strong>
        <span>${esc(plan.velocidade)} de fibra óptica com Wi-Fi</span>
      </div>
      <dl>
        <div><dt>Mensalidade</dt><dd>${esc(A.money(price))}</dd></div>
        <div class="total"><dt>Total hoje</dt><dd>${esc(A.money(price))}</dd></div>
      </dl>
      <p class="summary-note">Você paga agora a 1ª mensalidade.${dueDay ? ` As próximas vencem todo dia ${esc(dueDay)}.` : ''}</p>
      ${replacing ? `<p class="summary-note warn">Você já tem o plano ${esc(current.nome)}. Ao concluir o pagamento, ele será trocado por este.</p>` : ''}
      ${state.order ? `<p class="summary-order">Pedido <b>${esc(state.order.id)}</b></p>` : '<a class="text-action" href="planos.html">Trocar de plano</a>'}`;
    $('#card-pay').textContent = `Pagar ${A.money(price)}`;
    $('#mp-pay').textContent = `Pagar ${A.money(price)} com Mercado Pago`;
  };

  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

  /* ---------- 1. Seus dados ---------- */

  const setupAccount = () => {
    const user = A.session();
    $('#known-account').hidden = !user;
    $('#known-actions').hidden = !user;
    $('#account-form').hidden = !!user;
    if (user) {
      $('#known-name').textContent = user.nome;
      $('#known-email').textContent = user.email;
      $('#known-avatar').textContent = user.nome.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
    }
    $('#login-link').href = `login.html?plano=${encodeURIComponent(state.plan.nome)}`;
  };

  const bindAccount = () => {
    const form = $('#account-form');
    ['cpf', 'telefone'].forEach(name => {
      form.elements[name].addEventListener('input', event => { event.target.value = masks[name](event.target.value); });
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      showMessage('#account-form .form-error', '');
      const valid = validateForm(form, {
        nome: value => (value.split(/\s+/).length < 2 ? 'Informe nome e sobrenome.' : ''),
        email: value => (/^\S+@\S+\.\S+$/.test(value) ? '' : 'Informe um e-mail válido.'),
        telefone: value => (digits(value).length >= 10 ? '' : 'Informe o celular com DDD.'),
        cpf: value => (validCpf(value) ? '' : 'CPF inválido. Confira os números.'),
        senha: () => (form.elements.senha.value.length >= 8 ? '' : 'A senha precisa de pelo menos 8 caracteres.'),
        confirmar: () => (form.elements.confirmar.value === form.elements.senha.value ? '' : 'As senhas não são iguais.')
      });
      if (!valid) return;
      try {
        A.signup({ ...Object.fromEntries(new FormData(form)), endereco: '' });
      } catch (error) {
        if (/já possui/.test(error.message)) {
          setFieldError(form.elements.email, 'Este e-mail já tem conta. Use "Já tenho conta" para entrar.');
          form.elements.email.focus();
        } else {
          showMessage('#account-form .form-error', error.message);
        }
        return;
      }
      form.reset();
      setupAccount();
      goTo(2);
    });

    $('#switch-account').addEventListener('click', () => {
      localStorage.removeItem(A.K.session);
      location.href = `login.html?plano=${encodeURIComponent(state.plan.nome)}`;
    });
  };

  /* ---------- 2. Instalação ---------- */

  const fillInstall = () => {
    const form = $('#install-form');
    let draft = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    } catch { /* rascunho ilegível: ignora */ }
    // Sem rascunho, reaproveita o endereço do último pedido ou o do cadastro.
    const lastOrder = A.session() ? A.orders().find(order => order.cliente === A.session().email && order.instalacao) : null;
    const data = state.install || draft || lastOrder?.instalacao || { logradouro: customer()?.endereco || '' };
    ['cep', 'logradouro', 'complemento', 'bairro', 'cidade', 'vencimento'].forEach(name => {
      if (data[name]) form.elements[name].value = data[name];
    });
  };

  const bindInstall = () => {
    const form = $('#install-form');
    form.elements.cep.addEventListener('input', event => { event.target.value = masks.cep(event.target.value); });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const valid = validateForm(form, {
        cep: value => (digits(value).length === 8 ? '' : 'Informe o CEP com 8 números.'),
        logradouro: value => (value.length >= 5 ? '' : 'Informe a rua e o número.'),
        bairro: value => (value ? '' : 'Informe o bairro.'),
        cidade: value => (value ? '' : 'Informe a cidade.')
      });
      if (!valid) return;
      state.install = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state.install));
      try {
        if (!customer()?.endereco) A.updateClient({ endereco: formatAddress(state.install) });
        if (state.order) {
          state.order = A.updateOrder(state.order.id, {
            endereco: formatAddress(state.install),
            instalacao: state.install,
            vencimento: state.install.vencimento
          });
        }
      } catch (error) {
        toast(error.message);
        return;
      }
      renderSummary();
      goTo(3);
    });
  };

  /* ---------- 3. Pagamento ---------- */

  const selectedMethod = () => $('input[name="metodo"]:checked').value;

  const showMethod = method => {
    Object.keys(METHOD_LABELS).forEach(name => { $(`#panel-${name}`).hidden = name !== method; });
    showMessage('#pay-error', '');
  };

  const acceptedTerms = () => {
    const accepted = $('#terms').checked;
    showMessage('#terms-error', accepted ? '' : 'Aceite as condições para continuar.');
    if (!accepted) $('#terms').focus();
    return accepted;
  };

  // Cria o pedido na primeira tentativa de pagamento e registra a forma escolhida.
  const ensureOrder = method => {
    if (!state.order) {
      state.order = state.fatura
        ? A.createOrder({
          plano: state.plan.nome,
          endereco: customer()?.enderecoInstalacao || customer()?.endereco || '',
          vencimento: customer()?.plano?.vencimento,
          tipo: 'fatura',
          competencia: state.fatura.competencia
        })
        : A.createOrder({
          plano: state.plan.nome,
          endereco: formatAddress(state.install),
          instalacao: state.install,
          vencimento: state.install.vencimento
        });
      // Guarda o pedido na URL: recarregar a página retoma o mesmo pedido.
      try {
        history.replaceState(null, '', `${location.pathname}?pedido=${encodeURIComponent(state.order.id)}`);
      } catch { /* alguns navegadores bloqueiam em file:// */ }
    }
    state.order = A.updateOrder(state.order.id, { metodo: method });
    renderSummary();
    return state.order;
  };

  // Executa uma ação de pagamento mostrando o erro na tela, se houver.
  const attempt = action => {
    showMessage('#pay-error', '');
    try {
      action();
    } catch (error) {
      showMessage('#pay-error', error.message);
    }
  };

  /* Pix */

  const stopPixTimer = () => {
    clearInterval(state.pixTimer);
    state.pixTimer = null;
  };

  const showPix = () => {
    const { pixCodigo, pixExpiraEm } = state.order.detalhes;
    const tick = () => {
      const remaining = Math.max(0, Math.round((pixExpiraEm - Date.now()) / 1000));
      $('#pix-timer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      if (remaining > 0) return;
      stopPixTimer();
      $('#pix-result').hidden = true;
      $('#pix-expired').hidden = false;
      try {
        state.order = A.updateOrder(state.order.id, { status: 'Expirado' });
      } catch { /* pedido já pago ou sessão encerrada: nada a atualizar */ }
    };
    $('#pix-start').hidden = true;
    $('#pix-expired').hidden = true;
    $('#pix-result').hidden = false;
    $('#pix-code').value = pixCodigo;
    $('#pix-qr').innerHTML = window.FHPQR.svg(pixCodigo);
    stopPixTimer();
    state.pixTimer = setInterval(tick, 1000);
    tick();
  };

  const generatePix = () => {
    if (!acceptedTerms()) return;
    attempt(() => {
      const order = ensureOrder('pix');
      // Texto de teste: não segue o padrão do Pix e não é pagável.
      const amount = A.money(order.valor).replace(/\s/g, ' ');
      state.order = A.updateOrder(order.id, {
        status: 'Aguardando pagamento',
        detalhes: {
          pixCodigo: `FHP FIBRA | PIX DE TESTE | Pedido ${order.id} | ${amount} | SEM VALOR REAL`,
          pixExpiraEm: Date.now() + PIX_MINUTES * 60 * 1000
        }
      });
      showPix();
    });
  };

  /* Cartão */

  const bindCard = () => {
    const form = $('#card-form');
    ['numero', 'validade', 'cvv'].forEach(name => {
      form.elements[name].addEventListener('input', event => { event.target.value = masks[name](event.target.value); });
    });
    form.elements.numero.addEventListener('input', () => {
      $('#card-brand').textContent = cardBrand(form.elements.numero.value);
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (state.busy) return;
      showMessage('#card-error', '');
      const number = digits(form.elements.numero.value);
      const brand = cardBrand(number);
      const valid = validateForm(form, {
        numero: value => (validCardNumber(value) ? '' : 'Número de cartão inválido.'),
        titular: value => (/\p{L}{2,}/u.test(value) ? '' : 'Informe o nome como está no cartão.'),
        validade: value => (validExpiry(value) ? '' : 'Validade inválida ou cartão vencido.'),
        cvv: value => (value.length === (brand === 'Amex' ? 4 : 3) ? '' : `Informe os ${brand === 'Amex' ? 4 : 3} dígitos do CVV.`)
      });
      if (!valid || !acceptedTerms()) return;

      let order;
      try {
        order = ensureOrder('cartao');
      } catch (error) {
        showMessage('#card-error', error.message);
        return;
      }

      // Simula o tempo de resposta da operadora do cartão.
      const button = $('#card-pay');
      const label = button.textContent;
      state.busy = true;
      button.disabled = true;
      button.textContent = 'Processando…';
      setTimeout(() => {
        state.busy = false;
        button.disabled = false;
        button.textContent = label;
        // Cartões de teste: o final do número decide o resultado.
        const refusal = number.endsWith('0002')
          ? 'Pagamento recusado pelo emissor do cartão. Tente outro cartão ou outra forma de pagamento.'
          : number.endsWith('9995')
            ? 'Cartão sem limite disponível. Tente outro cartão ou outra forma de pagamento.'
            : '';
        try {
          if (refusal) {
            state.order = A.updateOrder(order.id, {
              status: 'Recusado',
              detalhes: { tentativasCartao: (order.detalhes.tentativasCartao || 0) + 1 }
            });
            form.elements.cvv.value = '';
            showMessage('#card-error', refusal);
            return;
          }
          A.confirmPayment(order.id, { bandeira: brand || 'Cartão', final: number.slice(-4) });
          form.reset();
          finish();
        } catch (error) {
          showMessage('#card-error', error.message);
        }
      }, 1600);
    });
  };

  /* Boleto */

  // Monta uma linha digitável no formato visual de um boleto, com banco "000" (inexistente).
  const boletoLine = (amount, dueDate) => {
    const random = length => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
    const days = Math.floor((Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()) - Date.UTC(1997, 9, 7)) / 86400000);
    const factor = String(days >= 10000 ? days - 9000 : days).padStart(4, '0');
    const value = String(Math.round(amount * 100)).padStart(10, '0');
    const fields = [`0009${random(6)}`, random(11), random(11)].map(field => `${field.slice(0, 5)}.${field.slice(5)}`);
    return `${fields.join(' ')} ${random(1)} ${factor}${value}`;
  };

  // Desenho de barras apenas ilustrativo, derivado dos dígitos da linha.
  const barcode = line => {
    let x = 0;
    let bars = '';
    [...digits(line)].forEach(char => {
      const digit = Number(char);
      const width = (digit % 3) + 1;
      bars += `<rect x="${x}" width="${width}" height="50"/>`;
      x += width + (digit % 2) + 1;
    });
    return `<svg class="barcode" viewBox="0 0 ${x} 50" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  };

  const showBoleto = () => {
    const order = state.order;
    const { boletoLinha, boletoVencimento } = order.detalhes;
    $('#boleto-card').innerHTML = `
      <header><strong><span>FHP</span> FIBRA</strong><span>Boleto de teste</span></header>
      <dl>
        <div><dt>Beneficiário</dt><dd>FHP Fibra (projeto acadêmico)</dd></div>
        <div><dt>Pagador</dt><dd>${esc(order.nome)}</dd></div>
        <div><dt>Pedido</dt><dd>${esc(order.id)}</dd></div>
        <div><dt>Vencimento</dt><dd>${esc(formatDate(boletoVencimento))}</dd></div>
        <div><dt>Valor</dt><dd>${esc(A.money(order.valor))}</dd></div>
      </dl>
      <label class="field">Linha digitável
        <span class="copy-row">
          <input id="boleto-line" readonly value="${esc(boletoLinha)}">
          <button class="btn btn-ghost" type="button" data-copy="#boleto-line">Copiar</button>
        </span>
      </label>
      ${barcode(boletoLinha)}`;
    $('#boleto-start').hidden = true;
    $('#boleto-result').hidden = false;
  };

  const generateBoleto = () => {
    if (!acceptedTerms()) return;
    attempt(() => {
      const order = ensureOrder('boleto');
      const due = new Date();
      due.setDate(due.getDate() + BOLETO_DAYS);
      state.order = A.updateOrder(order.id, {
        status: 'Aguardando pagamento',
        detalhes: { boletoLinha: boletoLine(order.valor, due), boletoVencimento: due.toISOString() }
      });
      showBoleto();
    });
  };

  /* Mercado Pago */

  const mpStatusLabels = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito', debito: 'Cartão de débito', saldo: 'Saldo no Mercado Pago' };

  const payWithMercadoPago = async () => {
    if (state.busy || !acceptedTerms()) return;
    showMessage('#pay-error', '');
    const button = $('#mp-pay');
    const label = button.textContent;
    state.busy = true;
    button.disabled = true;
    button.textContent = 'Conectando ao Mercado Pago…';
    const slow = setTimeout(() => {
      $('#mp-note').textContent = 'O servidor de pagamentos está iniciando. Isso pode levar até 1 minuto na primeira vez.';
    }, 5000);
    try {
      const order = ensureOrder('mercadopago');
      if (!/^https?:$/.test(location.protocol)) throw Error('Para pagar, abra o site por um endereço http(s), não pelo arquivo no computador.');
      const retorno = `${location.origin}${location.pathname}?pedido=${encodeURIComponent(order.id)}&retorno=mp`;
      const data = await A.startCheckout({ order, retorno });
      state.order = A.updateOrder(order.id, { detalhes: { mpUrl: data.url, mpPreferencia: data.preferencia } });
      location.href = data.url;
    } catch (error) {
      showMessage('#pay-error', error.message);
      state.busy = false;
      button.disabled = false;
      button.textContent = label;
    } finally {
      clearTimeout(slow);
    }
  };

  // Confere com o servidor como está o pagamento deste pedido no Mercado Pago.
  const checkRemote = async ({ fresh = false, fromReturn = false } = {}) => {
    const order = state.order;
    showLoading('Confirmando o pagamento com o Mercado Pago…');
    let info;
    try {
      info = (await A.remoteStatus([order.ref], fresh))[order.ref];
    } catch (error) {
      showPanels();
      showMessage('#pay-error', `${error.message} Se você já pagou, confira de novo em instantes em "Meu plano".`);
      return;
    }
    if (info?.status === 'pago') {
      A.updateOrder(order.id, { metodo: info.metodo });
      A.confirmPayment(order.id, { mpId: info.id, bandeira: info.bandeira, final: info.final }, info.pagoEm);
      finish();
      return;
    }
    if (info?.status === 'processando') {
      state.order = A.updateOrder(order.id, { metodo: info.metodo, detalhes: { mpId: info.id } });
      A.deferPayment(order.id);
      finish();
      return;
    }
    showPanels();
    if (info?.status === 'recusado' || info?.status === 'cancelado') {
      showMessage('#pay-error', 'O pagamento não foi aprovado pelo Mercado Pago. Tente de novo, se possível com outra forma de pagamento.');
    } else if (info?.status === 'estornado') {
      showMessage('#pay-error', 'Este pagamento foi estornado. Para continuar, faça um novo pagamento.');
    } else if (fromReturn) {
      showMessage('#pay-error', 'O pagamento não foi concluído. Você pode tentar de novo quando quiser.');
    }
  };

  /* Modo de pagamento: simulado ou Mercado Pago */

  const showLoading = text => {
    $('#panel-loading').hidden = false;
    $('#loading-text').textContent = text;
    ['#methods', '#panel-mp', '#panel-pix', '#panel-cartao', '#panel-boleto'].forEach(sel => { $(sel).hidden = true; });
  };

  // Mostra os painéis do modo atual (depois de carregar ou de uma consulta).
  const showPanels = () => {
    $('#panel-loading').hidden = true;
    const mp = state.mode?.modo === 'mercadopago';
    $('#methods').hidden = mp;
    $('#panel-mp').hidden = !mp;
    if (mp) ['#panel-pix', '#panel-cartao', '#panel-boleto'].forEach(sel => { $(sel).hidden = true; });
    else showMethod(selectedMethod());
  };

  const applyMode = mode => {
    state.mode = mode;
    const banner = $('#demo-banner');
    if (mode.modo === 'mercadopago') {
      $('#demo-tag').hidden = true;
      if (!state.fatura) $('#terms').closest('.terms').querySelector('span').textContent = 'Li e aceito as condições de contratação deste plano.';
      if (mode.ambiente === 'producao') {
        banner.hidden = true;
      } else {
        banner.innerHTML = '<strong>Modo de teste do Mercado Pago.</strong> Use uma conta de teste e os cartões de teste do Mercado Pago. Nenhum valor real é cobrado.';
      }
    }
    if (mode.modo === 'indisponivel') {
      $('#panel-loading').hidden = true;
      showMessage('#pay-error', mode.erro);
      return;
    }
    showPanels();
  };

  const bindPayment = () => {
    $('#mp-pay').addEventListener('click', payWithMercadoPago);
    $$('input[name="metodo"]').forEach(radio => radio.addEventListener('change', () => showMethod(radio.value)));
    $('#terms').addEventListener('change', () => showMessage('#terms-error', ''));

    $('#pix-generate').addEventListener('click', generatePix);
    $('#pix-regenerate').addEventListener('click', generatePix);
    $('#pix-confirm').addEventListener('click', () => attempt(() => {
      A.updateOrder(state.order.id, { metodo: 'pix' });
      A.confirmPayment(state.order.id);
      finish();
    }));

    $('#boleto-generate').addEventListener('click', generateBoleto);
    $('#boleto-confirm').addEventListener('click', () => attempt(() => {
      A.updateOrder(state.order.id, { metodo: 'boleto' });
      A.confirmPayment(state.order.id);
      finish();
    }));
    $('#boleto-later').addEventListener('click', () => attempt(() => {
      A.updateOrder(state.order.id, { metodo: 'boleto' });
      A.deferPayment(state.order.id);
      finish();
    }));
    $('#boleto-print').addEventListener('click', () => printOnly('print-boleto'));

    bindCard();
  };

  /* ---------- 4. Confirmação ---------- */

  const methodText = order => {
    if ((order.metodo === 'cartao' || order.metodo === 'debito') && order.detalhes.final) {
      const brand = order.detalhes.bandeira ? ` ${capitalize(order.detalhes.bandeira)}` : '';
      return `${mpStatusLabels[order.metodo]}${brand} final ${order.detalhes.final}`;
    }
    if (order.metodo === 'mercadopago') return 'Mercado Pago';
    return mpStatusLabels[order.metodo] || METHOD_LABELS[order.metodo] || '—';
  };

  const renderConfirmation = () => {
    const order = state.order;
    const paid = order.status === 'Pago';
    const mp = state.mode?.modo === 'mercadopago';
    const fatura = order.tipo === 'fatura';
    const boleto = order.metodo === 'boleto';
    const pendingText = mp
      ? (boleto
        ? 'O boleto é compensado em até 3 dias úteis. A confirmação aparece aqui e em "Meu plano".'
        : 'Assim que o Mercado Pago confirmar o pagamento, ele aparece aqui e em "Meu plano".')
      : 'Será confirmado quando o boleto for compensado.';
    const rows = [
      ['Pedido', order.id],
      ...(fatura ? [['Fatura', capitalize(A.monthName(order.competencia))]] : []),
      ['Plano', `${order.plano.nome} · ${order.plano.velocidade}`],
      [paid ? 'Valor pago' : 'Valor', A.money(order.valor)],
      ['Forma de pagamento', methodText(order)],
      paid
        ? ['Data do pagamento', formatDateTime(order.pagoEm)]
        : (order.detalhes.boletoVencimento ? ['Vencimento do boleto', formatDate(order.detalhes.boletoVencimento)] : null),
      ...(order.detalhes.mpId ? [['Pagamento no Mercado Pago', `nº ${order.detalhes.mpId}`]] : []),
      ...(fatura ? [] : [['Endereço de instalação', order.endereco], ['Próximas mensalidades', `Todo dia ${order.vencimento}`]]),
      ['Situação', paid ? 'Pago' : 'Aguardando pagamento']
    ].filter(Boolean);
    const title = paid ? (fatura ? 'Fatura paga' : 'Pagamento aprovado') : (fatura ? 'Pagamento em processamento' : 'Pedido registrado');
    const text = paid
      ? (fatura
        ? `Recebemos a mensalidade de ${esc(A.monthName(order.competencia))} do plano <b>${esc(order.plano.nome)}</b>.`
        : `Recebemos a 1ª mensalidade do plano <b>${esc(order.plano.nome)}</b>.`)
      : `${fatura ? 'A fatura' : `O plano <b>${esc(order.plano.nome)}</b>`} ainda aguarda o pagamento. ${esc(pendingText)}`;
    const note = mp
      ? (state.mode.ambiente === 'producao'
        ? 'Comprovante do pedido. O recibo oficial do pagamento fica no Mercado Pago e é enviado ao seu e-mail.'
        : 'Modo de teste do Mercado Pago: nenhum valor real é cobrado.')
      : 'Comprovante de teste, sem valor fiscal. Nenhum valor foi cobrado.';
    const mainAction = fatura
      ? '<a class="btn btn-primary" href="painel.html?secao=faturas">Ver faturas</a>'
      : '<a class="btn btn-primary" href="painel.html?secao=meu-plano">Ver meu plano</a>';
    let secondary;
    if (paid) secondary = '<button class="btn btn-ghost" type="button" id="receipt-print">Imprimir comprovante</button>';
    else if (mp) {
      secondary = `<button class="btn btn-ghost" type="button" id="refresh-status">Atualizar status</button>${order.detalhes.mpUrl
        ? `<a class="btn btn-ghost" href="${esc(order.detalhes.mpUrl)}">Abrir o pagamento no Mercado Pago</a>` : ''}`;
    } else secondary = `<a class="btn btn-ghost" href="checkout.html?pedido=${encodeURIComponent(order.id)}">Voltar ao boleto</a>`;
    $('#confirmation').innerHTML = `
      <div class="confirm ${paid ? 'ok' : 'pending'}">
        <span class="confirm-icon" aria-hidden="true">${paid ? '✓' : '…'}</span>
        <h2 tabindex="-1">${title}</h2>
        <p>${text}</p>
      </div>
      <dl class="receipt" id="receipt">
        ${rows.map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join('')}
      </dl>
      <p class="demo-note">${esc(note)}</p>
      <p class="form-error" id="refresh-error" role="alert"></p>
      <div class="step-actions center wrap">${mainAction}${secondary}</div>
      ${paid && !fatura ? `<div class="next-steps">
        <h3>Próximos passos</h3>
        <ol>
          <li>A equipe FHP entra em contato pelo celular cadastrado para agendar a instalação.</li>
          <li>Acompanhe o plano, as faturas e fale com o atendimento na sua conta.</li>
        </ol>
      </div>` : ''}`;
    $('#receipt-print')?.addEventListener('click', () => printOnly('print-receipt'));
    $('#refresh-status')?.addEventListener('click', refreshStatus);
  };

  // Na tela de confirmação pendente: consulta o Mercado Pago de novo.
  const refreshStatus = async () => {
    const button = $('#refresh-status');
    button.disabled = true;
    button.textContent = 'Consultando…';
    try {
      const info = (await A.remoteStatus([state.order.ref], true))[state.order.ref];
      if (info?.status === 'pago') {
        A.updateOrder(state.order.id, { metodo: info.metodo });
        A.confirmPayment(state.order.id, { mpId: info.id, bandeira: info.bandeira, final: info.final }, info.pagoEm);
        finish();
        return;
      }
      showMessage('#refresh-error', info?.status === 'recusado' || info?.status === 'cancelado'
        ? 'O Mercado Pago não aprovou este pagamento. Abra o pagamento de novo para tentar outra forma.'
        : 'O pagamento ainda não foi confirmado. Tente de novo em alguns minutos.');
    } catch (error) {
      showMessage('#refresh-error', error.message);
    }
    button.disabled = false;
    button.textContent = 'Atualizar status';
  };

  const finish = () => {
    stopPixTimer();
    sessionStorage.removeItem(DRAFT_KEY);
    state.order = A.findOrder(state.order.id);
    state.locked = true;
    renderConfirmation();
    goTo(4);
  };

  // Imprime só o boleto ou só o comprovante (as regras estão no fim de css/checkout.css).
  const printOnly = className => {
    document.body.classList.add(className);
    window.addEventListener('afterprint', () => document.body.classList.remove(className), { once: true });
    window.print();
  };

  const bindCopy = () => {
    document.addEventListener('click', async event => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      const input = $(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(input.value);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      toast('Código copiado.');
    });
  };

  /* ---------- Início ---------- */

  const bindNavigation = () => {
    // O erro de um campo some assim que a pessoa volta a digitar nele.
    document.addEventListener('input', event => {
      if (event.target.matches('.field input, .field select')) setFieldError(event.target, '');
    });
    $$('#stepper button').forEach(button => button.addEventListener('click', () => {
      goTo(Number(button.closest('li').dataset.step));
    }));
    $$('[data-back]').forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.back))));
    $$('[data-next]').forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.next))));
  };

  const open = () => {
    $('#checkout-flow').hidden = false;
    $('#summary').hidden = false;
    bindNavigation();
    bindAccount();
    bindInstall();
    bindPayment();
    bindCopy();
    setupAccount();
    fillInstall();
    renderSummary();
    // Descobre o modo já na abertura: acorda o servidor gratuito enquanto a pessoa preenche os dados.
    const slow = setTimeout(() => {
      $('#loading-text').textContent = 'Conectando ao servidor de pagamentos. Na primeira vez isso pode levar até 1 minuto…';
    }, 4000);
    state.modeReady = A.paymentMode().then(mode => {
      clearTimeout(slow);
      applyMode(mode);
      return mode;
    });
  };

  // Ajusta a tela para pagar uma fatura mensal (sem as etapas de assinatura).
  const setupInvoiceScreen = () => {
    $('#stepper').hidden = true;
    $('#pay-actions').hidden = true;
    $('#checkout-title').textContent = 'Pagar fatura';
    $('#pay-title').textContent = `Fatura de ${state.fatura.nome}`;
    $('.back-link').href = 'painel.html?secao=faturas';
    $('.back-link').textContent = '← Voltar às faturas';
    $('#terms').closest('.terms').querySelector('span').textContent = 'Confirmo o pagamento desta mensalidade.';
  };

  const invoiceFor = (email, month) => A.invoices(email).find(item => item.competencia === month) || null;

  // Retoma um pedido já criado: checkout.html?pedido=FHP-000000 (e a volta do Mercado Pago: &retorno=mp)
  const resume = async id => {
    const user = A.session();
    if (!user) {
      location.replace(`login.html?pedido=${encodeURIComponent(id)}`);
      return;
    }
    const order = user.nivel === 'cliente' ? A.findOrder(id) : null;
    if (!order) {
      block('Pedido não encontrado', 'Não encontramos este pedido na sua conta.', [['Ver planos', 'planos.html'], ['Minha conta', 'painel.html']]);
      return;
    }
    state.order = order;
    state.plan = order.plano;
    state.install = order.instalacao || { logradouro: order.endereco, vencimento: order.vencimento };
    if (order.tipo === 'fatura') {
      state.fatura = invoiceFor(user.email, order.competencia) || {
        competencia: order.competencia,
        nome: A.monthName(order.competencia),
        vencimento: new Date(order.criadoEm)
      };
    }
    open();
    if (state.fatura) setupInvoiceScreen();
    if (order.status === 'Pago') {
      state.locked = true;
      renderConfirmation();
      goTo(4);
      return;
    }
    $('#terms').checked = true;
    goTo(3);
    const mode = await state.modeReady;
    if (mode.modo === 'mercadopago') {
      // Volta do Mercado Pago ou pedido aberto de novo: o servidor diz se já foi pago.
      if (order.ref && (order.metodo === 'mercadopago' || order.detalhes.mpUrl || params.get('retorno') === 'mp' || order.detalhes.mpId)) {
        try {
          history.replaceState(null, '', `${location.pathname}?pedido=${encodeURIComponent(order.id)}`);
        } catch { /* file:// */ }
        await checkRemote({ fresh: true, fromReturn: params.get('retorno') === 'mp' });
      }
      return;
    }
    if (mode.modo !== 'simulado') return;
    const method = METHOD_LABELS[order.metodo] ? order.metodo : 'pix';
    $(`input[name="metodo"][value="${method}"]`).checked = true;
    showMethod(method);
    if (order.detalhes.pixCodigo) {
      if (order.detalhes.pixExpiraEm > Date.now()) showPix();
      else {
        $('#pix-start').hidden = true;
        $('#pix-expired').hidden = false;
      }
    }
    if (order.detalhes.boletoLinha) showBoleto();
  };

  // Pagar uma fatura do plano atual: checkout.html?fatura=AAAA-MM
  const startInvoice = month => {
    const user = A.session();
    if (!user) {
      location.replace(`login.html?fatura=${encodeURIComponent(month)}`);
      return;
    }
    const plan = user.nivel === 'cliente' ? customer()?.plano : null;
    const invoice = plan ? invoiceFor(user.email, month) : null;
    if (!invoice) {
      block('Fatura não encontrada', 'Não encontramos esta fatura no seu plano atual.', [['Ver faturas', 'painel.html?secao=faturas'], ['Minha conta', 'painel.html']]);
      return;
    }
    // Já existe um pedido em aberto para esta fatura: continua nele.
    const mine = A.orders().filter(order => order.ref === invoice.ref && order.cliente === user.email);
    const existing = mine.find(order => order.status === 'Pago') || mine.find(order => order.tipo === 'fatura');
    if (existing) {
      location.replace(`checkout.html?pedido=${encodeURIComponent(existing.id)}`);
      return;
    }
    state.fatura = invoice;
    state.plan = A.plans.find(item => item.nome === plan.nome) || plan;
    state.install = { vencimento: plan.vencimento };
    open();
    setupInvoiceScreen();
    goTo(3);
  };

  const start = () => {
    const orderId = params.get('pedido');
    if (orderId) {
      resume(orderId);
      return;
    }
    if (params.get('fatura')) {
      startInvoice(params.get('fatura'));
      return;
    }
    const user = A.session();
    const plan = A.plans.find(item => item.nome === params.get('plano'));
    if (!plan) {
      block('Escolha um plano', 'Para assinar, selecione um dos planos disponíveis.', [['Ver planos', 'planos.html']]);
      return;
    }
    if (!A.priceToNumber(plan.valor)) {
      block(`${plan.nome}: sob consulta`, 'Os planos empresariais são contratados com a nossa equipe, que monta a proposta para o seu negócio.',
        [['Falar com a equipe', `fale-conosco.html?assunto=${encodeURIComponent(`Proposta ${plan.nome}`)}`], ['Ver planos residenciais', 'planos.html']]);
      return;
    }
    if (user && user.nivel !== 'cliente') {
      block('Conta de equipe', 'Contas de funcionário não assinam planos. Entre com uma conta de cliente para continuar.',
        [['Abrir painel', 'painel.html'], ['Ver planos', 'planos.html']]);
      return;
    }
    state.plan = plan;
    open();
    goTo(user ? 2 : 1);
  };

  document.addEventListener('DOMContentLoaded', start);
})();
