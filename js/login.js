document.addEventListener('DOMContentLoaded', () => {
  const api = window.FHP;
  const form = document.querySelector('#login-form');
  const params = new URLSearchParams(location.search);

  // Quem chega pelo checkout (?plano= ou ?pedido=) volta para ele depois de entrar.
  const destination = user => {
    if (user.nivel !== 'cliente') return 'painel.html';
    if (params.has('pedido')) return `checkout.html?pedido=${encodeURIComponent(params.get('pedido'))}`;
    if (params.has('plano')) return `checkout.html?plano=${encodeURIComponent(params.get('plano'))}`;
    if (params.has('fatura')) return `checkout.html?fatura=${encodeURIComponent(params.get('fatura'))}`;
    return 'painel.html';
  };

  if (api.session()) {
    location.replace(destination(api.session()));
    return;
  }

  if (params.has('plano')) {
    document.querySelector('#create-account-link').href = `cadastro.html?plano=${encodeURIComponent(params.get('plano'))}`;
  }

  document.querySelector('.show-password').addEventListener('click', () => {
    const password = form.elements.senha;
    password.type = password.type === 'password' ? 'text' : 'password';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const feedback = form.querySelector('.login-feedback');
    const user = api.login(form.elements.usuario.value, form.elements.senha.value);
    if (!user) {
      feedback.textContent = 'E-mail ou senha inválidos.';
      return;
    }
    location.href = destination(user);
  });
});
