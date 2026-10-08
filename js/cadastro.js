document.addEventListener('DOMContentLoaded',()=>{const api=window.FHP,form=document.querySelector('#register-form');
if(api.session())location.replace('index.html');
form.onsubmit=e=>{e.preventDefault();
const feedback=form.querySelector('.login-feedback');
try{api.signup(Object.fromEntries(new FormData(form)));
feedback.classList.add('success');
feedback.textContent='Conta criada! Voltando ao site…';
sessionStorage.removeItem('fhpPlanoPendente');
setTimeout(()=>location.href='index.html',500)}catch(error){feedback.textContent=error.message}}});

