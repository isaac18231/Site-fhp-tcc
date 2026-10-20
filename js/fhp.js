/* Contas, planos e chamados são simulados no armazenamento local do navegador. */
(() => {
  const K = {
    clients: 'fhp_clientes',
    staff: 'fhp_funcionarios',
    tickets: 'fhp_mensagens',
    session: 'fhp_sessao',
    plans: 'fhp_planos',
    payments: 'fhp_pagamentos'
  };

  const read = (key, fallback = []) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const session = () => read(K.session, null);
  const plans = [
    ['FHP Start', '300 Mega', 'R$ 79,90'],
    ['FHP Turbo', '500 Mega', 'R$ 99,90'],
    ['FHP Ultra', '700 Mega', 'R$ 119,90'],
    ['FHP Gamer', '1 Giga', 'R$ 149,90'],
    ['FHP Business 500', '500 Mega', ''],
    ['FHP Business 700', '700 Mega', ''],
    ['FHP Business 1 Giga', '1 Giga', '']
  ].map(([nome, velocidade, valor]) => ({ nome, velocidade, valor }));

  if (!read(K.plans, []).length) write(K.plans, plans);

  // Contas de teste para administração, atendimento e suporte técnico.
  const initialStaff = [
    { email: 'silvaxxisaac@gmail.com', senha: 'Flamengo10', nome: 'Administrador FHP', cargo: 'Administrador', nivel: 'admin', status: 'Ativo' },
    { email: 'migueljorgesilva10@gmail.com', senha: 'Migueljorge135', nome: 'Funcionário', cargo: 'Funcionário de Atendimento', nivel: 'atendimento', status: 'Ativo' },
    { email: 'tecnico@fhpfibra.demo', senha: 'Tecnico123', nome: 'Técnico de teste', cargo: 'Técnico de Internet', nivel: 'tecnico', status: 'Ativo' }
  ];
  const staff = read(K.staff, []);
  initialStaff.forEach(user => {
    if (!staff.some(saved => saved.email === user.email)) staff.push(user);
  });
  const supportUser = staff.find(user => user.email === 'migueljorgesilva10@gmail.com');
  if (supportUser) supportUser.nome = 'Funcionário';
  write(K.staff, staff);

  const currentSession = read(K.session, null);
  if (currentSession?.email === 'migueljorgesilva10@gmail.com' && currentSession.nome !== 'Funcionário') {
    write(K.session, { ...currentSession, nome: 'Funcionário' });
  }

  // Migra as mensagens e a sessão criadas pela versão anterior do projeto.
  if (!localStorage.getItem(K.tickets) && localStorage.getItem('fhpMessages')) {
    const oldMessages = read('fhpMessages', []);
    write(K.tickets, oldMessages.map((message, index) => ({
      id: String(message.id || `legado-${index}`),
      cliente: message.email || '',
      nome: message.nome || 'Cliente',
      data: message.data || '',
      hora: '',
      assunto: message.assunto || 'Contato',
      mensagens: [{
        autor: message.nome || 'Cliente',
        tipo: 'cliente',
        texto: message.mensagem || '',
        data: message.data || ''
      }],
      status: message.status === 'Encerrado' ? 'Encerrado' : 'Aberto'
    })));
  }

  if (!localStorage.getItem(K.session) && localStorage.getItem('fhpSession')) {
    const previousSession = read('fhpSession', null);
    if (previousSession) {
      const customer = read(K.clients, []).find(user => user.email === previousSession.usuario);
      write(K.session, customer
        ? { email: customer.email, nome: customer.nome, nivel: 'cliente' }
        : {
            email: previousSession.usuario,
            nome: previousSession.nome,
            nivel: previousSession.nivel === 'admin' ? 'admin' : 'atendimento'
          });
    }
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  const login = (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const employee = read(K.staff, []).find(user => user.email.toLowerCase() === normalizedEmail && user.senha === password);
    const customer = read(K.clients, []).find(user => user.email.toLowerCase() === normalizedEmail && user.senha === password);
    const user = employee
      ? { email: employee.email, nome: employee.nome, nivel: employee.nivel }
      : customer
        ? { email: customer.email, nome: customer.nome, nivel: 'cliente' }
        : null;
    if (user) write(K.session, user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem(K.session);
    localStorage.removeItem('fhpSession');
    location.href = 'index.html';
  };

  const signup = data => {
    const customers = read(K.clients, []);
    const email = data.email.trim().toLowerCase();
    if (customers.some(user => user.email.toLowerCase() === email)) {
      throw Error('Este e-mail já possui uma conta.');
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) throw Error('Informe um e-mail válido.');
    if (data.senha.length < 8) throw Error('A senha deve ter pelo menos 8 caracteres.');
    if (data.senha !== data.confirmar) throw Error('As senhas não conferem.');
    if (!data.cpf.trim() || !data.telefone.trim()) throw Error('CPF e telefone são obrigatórios.');

    const customer = {
      id: crypto.randomUUID(),
      nome: data.nome.trim(),
      email,
      senha: data.senha,
      telefone: data.telefone.trim(),
      cpf: data.cpf.trim(),
      endereco: data.endereco.trim(),
      plano: null,
      preferencias: true
    };
    customers.push(customer);
    write(K.clients, customers);
    write(K.session, { email: customer.email, nome: customer.nome, nivel: 'cliente' });
    return customer;
  };

  const updateClient = values => {
    const customers = read(K.clients, []);
    const index = customers.findIndex(user => user.email === session()?.email);
    if (index < 0) throw Error('Conta não encontrada.');

    const newEmail = values.email?.trim().toLowerCase();
    if (newEmail && newEmail !== customers[index].email.toLowerCase() &&
        customers.some(user => user.email.toLowerCase() === newEmail)) {
      throw Error('Este e-mail já está em uso.');
    }

    const oldEmail = customers[index].email;
    customers[index] = { ...customers[index], ...values, ...(newEmail ? { email: newEmail } : {}) };
    write(K.clients, customers);

    if (oldEmail !== customers[index].email) {
      const conversations = read(K.tickets, []);
      conversations.forEach(ticket => {
        if (ticket.cliente === oldEmail) ticket.cliente = customers[index].email;
      });
      write(K.tickets, conversations);

      const savedOrders = read(K.payments, []);
      savedOrders.forEach(order => {
        if (order.cliente === oldEmail) order.cliente = customers[index].email;
      });
      write(K.payments, savedOrders);
    }

    write(K.session, { ...session(), email: customers[index].email, nome: customers[index].nome });
    return customers[index];
  };

  const contract = (name, address, dueDate) => {
    const customers = read(K.clients, []);
    const index = customers.findIndex(user => user.email === session()?.email);
    const plan = plans.find(item => item.nome === name);
    if (index < 0 || !plan) throw Error('Não foi possível contratar este plano.');
    customers[index].enderecoInstalacao = address;
    customers[index].plano = { ...plan, vencimento: dueDate, status: 'Ativo', pagamento: 'Pendente' };
    write(K.clients, customers);
    return customers[index];
  };

  /* Pagamentos.
     Modo simulado (padrão): os pedidos ficam em localStorage e nenhum valor é cobrado.
     Modo Mercado Pago: quando js/config.js aponta para o servidor (veja PAGAMENTOS.md),
     a cobrança acontece no Mercado Pago e o servidor confirma o status.
     Dados de cartão nunca são gravados aqui — no máximo a bandeira e os 4 últimos dígitos. */
  const priceToNumber = value => Number(String(value || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const orders = () => read(K.payments, []);
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const pad = number => String(number).padStart(2, '0');
  const monthOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  const addMonths = (month, amount) => {
    const [year, m] = month.split('-').map(Number);
    return monthOf(new Date(year, m - 1 + amount, 1));
  };
  const monthName = month => {
    const [year, m] = month.split('-').map(Number);
    return `${MONTHS[m - 1]} de ${year}`;
  };
  // Dia de vencimento dentro do mês (dia 30 em fevereiro vira o último dia do mês).
  const dueDate = (month, day) => {
    const [year, m] = month.split('-').map(Number);
    const last = new Date(year, m, 0).getDate();
    return new Date(year, m - 1, Math.min(Number(day) || 10, last));
  };
  const planSlug = name => String(name || '').replace(/^FHP\s+/i, '').trim().toLowerCase().replace(/\s+/g, '-');

  // Garante que o cliente tenha um id (contas antigas podem não ter).
  const customerId = email => {
    const customers = read(K.clients, []);
    const customer = customers.find(user => user.email === email);
    if (!customer) return null;
    if (!customer.id) {
      customer.id = crypto.randomUUID();
      write(K.clients, customers);
    }
    return customer.id;
  };
  // Referência do pagamento: liga cliente, mês e plano (o servidor usa o mesmo formato).
  const paymentRef = (id, month, planName) => `FHP:${String(id).toLowerCase()}:${month}:${planSlug(planName)}`;

  const findOrder = id => {
    const user = session();
    const order = orders().find(item => item.id === id);
    if (!user || !order) return null;
    return user.nivel !== 'cliente' || order.cliente === user.email ? order : null;
  };

  // tipo "plano": contratação (1ª mensalidade). tipo "fatura": mensalidade de um mês do plano atual.
  const createOrder = ({ plano, endereco, instalacao, vencimento, tipo = 'plano', competencia }) => {
    const user = session();
    if (!user || user.nivel !== 'cliente') throw Error('Entre com uma conta de cliente para assinar um plano.');
    const plan = plans.find(item => item.nome === plano);
    if (!plan || !priceToNumber(plan.valor)) throw Error('Este plano não está disponível para contratação online.');
    const month = competencia || monthOf(new Date());
    const all = orders();
    let id;
    do {
      id = `FHP-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (all.some(item => item.id === id));
    const order = {
      id,
      tipo,
      competencia: month,
      ref: paymentRef(customerId(user.email), month, plan.nome),
      cliente: user.email,
      nome: user.nome,
      plano: { ...plan },
      valor: priceToNumber(plan.valor),
      endereco,
      instalacao: instalacao || null,
      vencimento: String(vencimento),
      metodo: null,
      status: 'Aguardando pagamento',
      criadoEm: new Date().toISOString(),
      pagoEm: null,
      detalhes: {}
    };
    all.unshift(order);
    write(K.payments, all);
    return order;
  };

  const updateOrder = (id, changes) => {
    const all = orders();
    const order = all.find(item => item.id === id && item.cliente === session()?.email);
    if (!order) throw Error('Pedido não encontrado.');
    if (order.status === 'Pago') throw Error('Este pedido já foi pago.');
    Object.assign(order, changes, { detalhes: { ...order.detalhes, ...(changes.detalhes || {}) } });
    write(K.payments, all);
    return order;
  };

  // Grava o plano do pedido na conta do cliente, pago ou ainda aguardando pagamento.
  // Pagamento de fatura não muda o plano.
  const applyOrderToCustomer = (order, paid) => {
    if (order.tipo === 'fatura') return;
    const customers = read(K.clients, []);
    const customer = customers.find(user => user.email === order.cliente);
    if (!customer) throw Error('Conta não encontrada.');
    customer.enderecoInstalacao = order.endereco;
    customer.plano = {
      ...order.plano,
      vencimento: order.vencimento,
      status: paid ? 'Ativo' : 'Aguardando pagamento',
      pagamento: paid ? 'Pago' : 'Pendente',
      pedido: order.id,
      inicio: order.competencia || monthOf(new Date(order.criadoEm))
    };
    write(K.clients, customers);
  };

  const confirmPayment = (id, detalhes = {}, paidAt) => {
    const order = updateOrder(id, { status: 'Pago', pagoEm: paidAt || new Date().toISOString(), detalhes });
    applyOrderToCustomer(order, true);
    return order;
  };

  // Boleto ou Pix gerado para pagar depois: o plano fica reservado com pagamento pendente.
  const deferPayment = id => {
    const order = updateOrder(id, { status: 'Aguardando pagamento' });
    applyOrderToCustomer(order, false);
    return order;
  };

  /* Faturas mensais do plano atual: do mês da contratação até o mês atual,
     mais a do mês seguinte quando faltam 10 dias ou menos para o vencimento. */
  const invoices = email => {
    const customer = read(K.clients, []).find(user => user.email === email);
    const plan = customer?.plano;
    if (!plan || !priceToNumber(plan.valor)) return [];
    const firstOrder = orders().find(order => order.id === plan.pedido);
    const start = plan.inicio || firstOrder?.competencia || monthOf(new Date(firstOrder?.criadoEm || Date.now()));
    const now = new Date();
    const id = customerId(email);
    let last = monthOf(now);
    const next = addMonths(last, 1);
    if (dueDate(next, plan.vencimento) - now <= 10 * 86400000) last = next;
    const list = [];
    for (let month = start; month <= last && list.length < 36; month = addMonths(month, 1)) {
      list.push({
        competencia: month,
        nome: monthName(month),
        vencimento: dueDate(month, plan.vencimento),
        primeira: month === start,
        valor: priceToNumber(plan.valor),
        plano: plan.nome,
        ref: paymentRef(id, month, plan.nome)
      });
    }
    return list.reverse();
  };

  // Situação de uma fatura pelos pedidos deste navegador (modo simulado).
  const localInvoiceStatus = ref => {
    const related = orders().filter(order => order.ref === ref);
    const paid = related.find(order => order.status === 'Pago');
    if (paid) return { status: 'pago', metodo: paid.metodo, pagoEm: paid.pagoEm, pedido: paid.id };
    const waiting = related.find(order => order.status === 'Aguardando pagamento' && order.detalhes.boletoLinha);
    if (waiting) return { status: 'processando', metodo: 'boleto', pedido: waiting.id };
    return null;
  };

  /* Ligação com o servidor de pagamentos (Mercado Pago). */
  const config = window.FHP_CONFIG || {};
  const apiBase = String(config.apiUrl || '').replace(/\/+$/, '');
  let paymentModePromise = null;

  const api = async (path, options = {}) => {
    const response = await fetch(apiBase + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeout || 90000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'O servidor de pagamentos não respondeu. Tente de novo em instantes.');
    return data;
  };

  /* Resolve o modo de pagamento:
     - { modo: 'simulado' } quando não há servidor;
     - { modo: 'mercadopago', ambiente } quando o servidor está configurado;
     - { modo: 'indisponivel', erro } quando o site aponta para um servidor que não responde. */
  const paymentMode = () => {
    if (paymentModePromise) return paymentModePromise;
    const configured = !!apiBase;
    const sameOrigin = !configured && /^https?:$/.test(location.protocol) && !/\.github\.io$/i.test(location.hostname);
    paymentModePromise = (async () => {
      if (!configured && !sameOrigin) return { modo: 'simulado' };
      try {
        // Servidor gratuito pode levar até 1 minuto para acordar.
        const data = await api('/api/pagamentos/config', { timeout: configured ? 90000 : 4000 });
        if (data.ativo) return { modo: 'mercadopago', ambiente: data.ambiente };
        return configured ? { modo: 'indisponivel', erro: 'O servidor de pagamentos está sem as credenciais do Mercado Pago.' } : { modo: 'simulado' };
      } catch (error) {
        return configured ? { modo: 'indisponivel', erro: 'Não foi possível falar com o servidor de pagamentos. Tente de novo em instantes.' } : { modo: 'simulado' };
      }
    })();
    return paymentModePromise;
  };

  const startCheckout = ({ order, retorno }) => api('/api/pagamentos/preferencia', {
    method: 'POST',
    body: JSON.stringify({
      cliente: customerId(order.cliente),
      competencia: order.competencia,
      plano: order.plano.nome,
      tipo: order.tipo,
      pagador: { nome: order.nome, email: order.cliente },
      retorno
    })
  });

  const remoteStatus = (refs, atualizar = false) => api('/api/pagamentos/status', {
    method: 'POST',
    body: JSON.stringify({ refs, atualizar })
  }).then(data => data.status || {});

  const send = (subject, text) => {
    const user = session();
    if (!user) throw Error('Entre na sua conta para enviar uma solicitação.');
    const allTickets = read(K.tickets, []);
    const now = new Date();
    const ticket = {
      id: crypto.randomUUID(),
      cliente: user.email,
      nome: user.nome,
      data: now.toLocaleDateString('pt-BR'),
      hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      assunto: subject,
      mensagens: [{ autor: user.nome, tipo: 'cliente', texto: text, data: now.toLocaleString('pt-BR') }],
      status: 'Aberto'
    };
    allTickets.unshift(ticket);
    write(K.tickets, allTickets);
    return ticket;
  };

  const reply = (id, text, status) => {
    const user = session();
    if (!user || user.nivel === 'cliente') throw Error('Você não possui permissão para responder chamados.');
    const allTickets = read(K.tickets, []);
    const ticket = allTickets.find(item => item.id === id);
    if (!ticket) throw Error('Chamado não encontrado.');
    ticket.mensagens.push({ autor: user.nome, tipo: 'funcionario', texto: text, data: new Date().toLocaleString('pt-BR') });
    if (status) ticket.status = status;
    write(K.tickets, allTickets);
    return ticket;
  };

  const closeTicket = id => {
    const user = session();
    if (!user || user.nivel === 'cliente') throw Error('Você não possui permissão para encerrar chamados.');
    const allTickets = read(K.tickets, []);
    const ticket = allTickets.find(item => item.id === id);
    if (!ticket) throw Error('Chamado não encontrado.');
    ticket.status = 'Encerrado';
    write(K.tickets, allTickets);
    return ticket;
  };

  const setStaffLevel = (email, level) => {
    if (session()?.nivel !== 'admin') throw Error('Acesso negado. Somente o administrador pode alterar níveis.');
    if (!['atendimento', 'tecnico'].includes(level)) throw Error('Nível de acesso inválido.');
    const employees = read(K.staff, []);
    const employee = employees.find(user => user.email === email);
    if (!employee || employee.nivel === 'admin') throw Error('Funcionário não encontrado ou nível protegido.');
    employee.nivel = level;
    employee.cargo = level === 'tecnico' ? 'Técnico de Internet' : 'Funcionário de Atendimento';
    write(K.staff, employees);
    return employee;
  };

  // Recuperação local de teste: sem um serviço de e-mail, o código é exibido
  // numa caixa de entrada simulada na página de recuperação.
  const requestPasswordReset = email => {
    const normalizedEmail = email.trim().toLowerCase();
    const customerExists = read(K.clients, []).some(user => user.email.toLowerCase() === normalizedEmail);
    const employeeExists = read(K.staff, []).some(user => user.email.toLowerCase() === normalizedEmail);
    if (!customerExists && !employeeExists) throw Error('Não encontramos uma conta com esse e-mail.');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const reset = { email: normalizedEmail, code, expires: Date.now() + 10 * 60 * 1000 };
    write('fhp_redefinicao_senha', reset);
    return { email: normalizedEmail, code, expires: reset.expires };
  };

  const resetPassword = (email, code, newPassword, confirmation) => {
    const reset = read('fhp_redefinicao_senha', null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!reset || reset.email !== normalizedEmail || reset.code !== code.trim()) {
      throw Error('Código de verificação inválido.');
    }
    if (Date.now() > reset.expires) {
      localStorage.removeItem('fhp_redefinicao_senha');
      throw Error('O código expirou. Solicite um novo código.');
    }
    if (newPassword.length < 8) throw Error('A nova senha deve ter pelo menos 8 caracteres.');
    if (newPassword !== confirmation) throw Error('As senhas não conferem.');
    const customers = read(K.clients, []);
    const employees = read(K.staff, []);
    const customer = customers.find(user => user.email.toLowerCase() === normalizedEmail);
    const employee = employees.find(user => user.email.toLowerCase() === normalizedEmail);
    if (customer) {
      customer.senha = newPassword;
      write(K.clients, customers);
    } else if (employee) {
      employee.senha = newPassword;
      write(K.staff, employees);
    } else {
      throw Error('Conta não encontrada.');
    }
    localStorage.removeItem('fhp_redefinicao_senha');
    return true;
  };

  window.FHP = {
    K, read, write, session, plans, esc: escapeHtml, login, logout, signup, updateClient, contract, send, reply, closeTicket, setStaffLevel,
    priceToNumber, money, orders, findOrder, createOrder, updateOrder, confirmPayment, deferPayment,
    monthOf, monthName, invoices, localInvoiceStatus, paymentRef, paymentMode, startCheckout, remoteStatus,
    cadastrarCliente: signup,
    fazerLogin: login,
    fazerLogout: logout,
    contratarPlano: contract,
    enviarMensagem: send,
    responderMensagem: reply,
    encerrarChamado: closeTicket,
    alterarDados: updateClient,
    alterarEmail: email => updateClient({ email }),
    alterarSenha: (currentPassword, newPassword, confirmation) => {
      const customer = read(K.clients, []).find(user => user.email === session()?.email);
      if (!customer || customer.senha !== currentPassword) throw Error('A senha atual não confere.');
      if (newPassword.length < 8 || newPassword !== confirmation) {
        throw Error('A nova senha deve ter pelo menos 8 caracteres e coincidir com a confirmação.');
      }
      return updateClient({ senha: newPassword });
    },
    alterarNivelFuncionario: setStaffLevel,
    requestPasswordReset,
    resetPassword
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.main-nav').forEach(nav => {
      const user = session();
      const menu = document.createElement('details');
      menu.className = 'account-menu';
      const summary = document.createElement('summary');
      summary.className = 'account-trigger';
      summary.textContent = user ? `♙ ${user.nome.split(' ')[0]}` : '♙ Área do Login';
      menu.append(summary);

      const options = document.createElement('div');
      options.className = 'account-options';
      if (user) {
        const links = user.nivel === 'cliente'
          ? [['Minha conta', 'painel.html'], ['Informações da conta', 'painel.html?secao=meus-dados'], ['Configurações', 'painel.html?secao=configuracoes']]
          : [['Abrir painel', 'painel.html'], ...(user.nivel === 'admin' ? [['Configurações', 'painel.html?secao=configuracoes']] : [])];
        links.forEach(([label, href]) => {
          const link = document.createElement('a');
          link.href = href;
          link.textContent = label;
          options.append(link);
        });
        const exit = document.createElement('button');
        exit.type = 'button';
        exit.textContent = 'Sair da conta';
        exit.addEventListener('click', logout);
        options.append(exit);
      } else {
        [['Entrar', 'login.html'], ['Criar conta', 'cadastro.html']].forEach(([label, href]) => {
          const link = document.createElement('a');
          link.href = href;
          link.textContent = label;
          options.append(link);
        });
      }
      menu.append(options);
      nav.append(menu);
    });

    document.querySelectorAll('[data-assinar]').forEach(button => {
      button.addEventListener('click', () => {
        // O checkout cuida de cadastro, login, endereço de instalação e pagamento.
        location.href = `checkout.html?plano=${encodeURIComponent(button.dataset.assinar)}`;
      });
    });
  });
})();
