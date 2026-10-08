/* Contas, planos e chamados são simulados no armazenamento local do navegador. */
(() => {
  const K = {
    clients: 'fhp_clientes',
    staff: 'fhp_funcionarios',
    tickets: 'fhp_mensagens',
    session: 'fhp_sessao',
    plans: 'fhp_planos'
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

  // Contas demonstrativas para administração, atendimento e suporte técnico.
  const initialStaff = [
    { email: 'silvaxxisaac@gmail.com', senha: 'Flamengo10', nome: 'Administrador FHP', cargo: 'Administrador', nivel: 'admin', status: 'Ativo' },
    { email: 'migueljorgesilva10@gmail.com', senha: 'Migueljorge135', nome: 'Funcionário', cargo: 'Funcionário de Atendimento', nivel: 'atendimento', status: 'Ativo' },
    { email: 'tecnico@fhpfibra.demo', senha: 'Tecnico123', nome: 'Técnico Demonstrativo', cargo: 'Técnico de Internet', nivel: 'tecnico', status: 'Ativo' }
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

  // Recuperação local demonstrativa: sem um serviço de e-mail, o código é exibido
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
        const name = button.dataset.assinar;
        const user = session();
        const registeredCustomers = read(K.clients, []);
        if (!user) {
          location.href = `${registeredCustomers.length ? 'login.html' : 'cadastro.html'}?plano=${encodeURIComponent(name)}`;
          return;
        }
        if (user.nivel !== 'cliente') {
          location.href = 'painel.html';
          return;
        }
        location.href = `painel.html?contratar=${encodeURIComponent(name)}`;
      });
    });
  });
})();
