document.addEventListener('DOMContentLoaded', () => {
  const api = window.FHP;
  const form = document.querySelector('#register-form');
  // Quem veio escolhendo um plano (?plano=) segue para o checkout depois do cadastro.
  const plan = new URLSearchParams(location.search).get('plano');
  const destination = plan ? `checkout.html?plano=${encodeURIComponent(plan)}` : 'index.html';

  if (api.session()) {
    location.replace(destination);
    return;
  }

  form.onsubmit = event => {
    event.preventDefault();
    const feedback = form.querySelector('.login-feedback');
    try {
      api.signup(Object.fromEntries(new FormData(form)));
      feedback.classList.add('success');
      feedback.textContent = plan ? 'Conta criada! Indo para o pagamento…' : 'Conta criada! Voltando ao site…';
      setTimeout(() => { location.href = destination; }, 500);
    } catch (error) {
      feedback.textContent = error.message;
    }
  };
});
