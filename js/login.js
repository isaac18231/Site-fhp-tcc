document.addEventListener('DOMContentLoaded', () => {
  const api = window.FHP;
  const form = document.querySelector('#login-form');
  const params = new URLSearchParams(location.search);
if (api.session()) location.replace('painel.html');

  if (params.has('plano')) {
    sessionStorage.setItem('fhpPlanoPendente', params.get('plano'));
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
    const pendingPlan = sessionStorage.getItem('fhpPlanoPendente');
    location.href = `painel.html${pendingPlan ? `?contratar=${encodeURIComponent(pendingPlan)}` : ''}`;
  });
});
