/* Painéis FHP: cliente, atendimento/técnico e administração. */
(()=>{
const A=window.FHP,session=A.session();
if(!session){location.replace('login.html');
return}
const admin=session.nivel==='admin',client=session.nivel==='cliente',tech=session.nivel==='tecnico';
const pages=client?['inicio','meu-plano','meus-dados','mensagens','configuracoes']:
admin?['dashboard','clientes','planos','mensagens','funcionarios','configuracoes']:
tech?['dashboard','mensagens']:['dashboard','clientes','planos','mensagens'];
const labels={inicio:'Início','meu-plano':'Meu plano','meus-dados':'Meus dados',mensagens:'Mensagens',configuracoes:'Configurações',dashboard:'Dashboard',clientes:'Clientes',planos:'Planos',funcionarios:'Funcionários'};
const nav=document.querySelector('#panel-nav'),content=document.querySelector('#panel-content');
const clients=()=>A.read(A.K.clients),tickets=()=>A.read(A.K.tickets),staff=()=>A.read(A.K.staff),safe=A.esc;
document.querySelector('#user-name').textContent=session.nome;
document.querySelector('#user-level').textContent=({admin:'Administrador',atendimento:'Atendimento',tecnico:'Técnico',cliente:'Cliente'})[session.nivel]||'Usuário';
document.querySelector('#avatar').textContent=session.nome.split(' ').map(x=>x[0]).slice(0,2).join('');
pages.forEach((page,index)=>{const button=document.createElement('button');
button.type='button';
button.textContent=labels[page];
button.dataset.page=page;
button.className=index===0?'active':'';
button.addEventListener('click',()=>render(page));
nav.append(button)});
document.querySelector('#logout').addEventListener('click',A.logout);
document.querySelector('#sidebar-toggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
const table=(heads,rows)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const clientRows=()=>clients().map(c=>`<tr><td>${safe(c.nome)}</td><td>${safe(c.email)}</td><td>${safe(c.telefone)}</td><td>${safe(c.cpf)}</td><td>${safe(c.endereco)}</td><td>${safe(c.plano?.nome||'Sem plano')}</td><td>${safe(c.plano?.velocidade||'—')}</td><td>${safe(c.plano?.valor||'—')}</td><td>${c.plano?.vencimento?'Dia '+safe(c.plano.vencimento):'—'}</td><td>${safe(c.plano?.status||'—')}</td><td>${safe(c.plano?.pagamento||'—')}</td></tr>`);
const visibleTickets=()=>tickets().filter(ticket=>client?ticket.cliente===session.email:!tech||/técnic|tecnic|internet|conexão|conexao|lent|wifi|wi-fi|roteador/i.test(ticket.assunto));
const stat=(title,value)=>`<article class="stat-card"><span>${title}</span><strong>${value}</strong></article>`;
function dashboard(){
const allClients=clients(),allTickets=visibleTickets(),plansActive=allClients.filter(c=>c.plano?.status==='Ativo').length;
const count=(status)=>allTickets.filter(t=>t.status===status).length;
const metrics=admin?[
['Total de clientes',allClients.length],['Clientes com plano',allClients.filter(c=>!!c.plano).length],['Planos ativos',plansActive],
['Pagamentos pendentes',allClients.filter(c=>c.plano?.pagamento==='Pendente').length],['Chamados abertos',count('Aberto')],['Funcionários',staff().length]
]:[['Total de clientes',allClients.length],['Clientes com plano',allClients.filter(c=>!!c.plano).length],['Chamados abertos',count('Aberto')],['Em atendimento',count('Em atendimento')],['Encerrados',count('Encerrado')]];
return `<div class="content"><h1>${client?'Olá, '+safe(session.nome)+'!':'Visão geral'}</h1><p class="subtitle">${client?'Acompanhe seu plano e fale com nossa equipe.':'Indicadores calculados com os dados armazenados neste navegador.'}</p>${client?clientHome():`<div class="stat-grid">${metrics.map(x=>stat(...x)).join('')}</div><div class="panel-card"><h2>Atendimento</h2><p>${count('Aberto')} chamados abertos · ${count('Em atendimento')} em atendimento · ${count('Encerrado')} encerrados</p></div>`}</div>`;
}
function clientHome(){const c=clients().find(x=>x.email===session.email);
return `<div class="layout-two"><article class="panel-card"><h2>Meu plano</h2>${c?.plano?`<h3>${safe(c.plano.nome)} · ${safe(c.plano.velocidade)}</h3><p>${safe(c.plano.valor)}/mês · vencimento dia ${safe(c.plano.vencimento)}</p><p class="pill">${safe(c.plano.status)} · Pagamento ${safe(c.plano.pagamento)}</p>`:'<p>Você ainda não possui um plano contratado.</p><a class="btn btn-primary" href="planos.html">Conhecer planos</a>'}</article><article class="panel-card"><h2>Precisa de ajuda?</h2><p>Abra uma solicitação e acompanhe as respostas da equipe.</p><button class="btn btn-primary" type="button" data-go="mensagens">Minhas mensagens</button></article></div>`}
function ticketCard(ticket){return `<article class="panel-card ticket"><header><div><strong>${safe(ticket.assunto)}</strong><small> · ${safe(ticket.nome)} · ${safe(ticket.data)} ${safe(ticket.hora)}</small></div><span class="pill">${safe(ticket.status)}</span></header><div class="conversation">${ticket.mensagens.map(message=>`<p><b>${safe(message.autor)}:</b> ${safe(message.texto)}<small>${safe(message.data)}</small></p>`).join('')}</div>${ticket.status==='Encerrado'?'<p class="subtitle">Este chamado foi encerrado.</p>':`${client?'':`<button class="logout" type="button" data-close="${safe(ticket.id)}">Encerrar chamado</button>`}<form data-reply="${safe(ticket.id)}"><label>Responder<textarea name="texto" required rows="3" placeholder="Escreva uma resposta…"></textarea></label><div class="ticket-actions"><button class="btn btn-primary" type="submit">Enviar resposta</button>${client?'':`<label>Status<select name="status"><option ${ticket.status==='Aberto'?'selected':''}>Aberto</option><option ${ticket.status==='Em atendimento'?'selected':''}>Em atendimento</option><option>Encerrado</option></select></label>`}</div></form>`}</article>`}
function render(page){
if(!pages.includes(page)){content.innerHTML='<div class="content"><h1>Acesso negado. Você não possui permissão para acessar esta área.</h1></div>';
return}
nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
document.querySelector('.sidebar').classList.remove('open');
let html=`<div class="content"><h1>${labels[page]}</h1><p class="subtitle">Área demonstrativa FHP Fibra.</p>`;
if(page==='dashboard'||page==='inicio')html=dashboard();
else if(page==='planos')html+=table(['Plano','Velocidade','Valor mensal'],A.plans.map(plan=>`<tr><td>${safe(plan.nome)}</td><td>${safe(plan.velocidade)}</td><td>${safe(plan.valor||'Consulte')}</td></tr>`));
else if(page==='clientes')html+=`<label class="search-label">Pesquisar clientes<input id="search-client" type="search" placeholder="Nome, e-mail, CPF ou telefone"></label><div id="client-table">${table(['Nome','E-mail','Telefone','CPF','Endereço','Plano','Velocidade','Valor','Vencimento','Status do plano','Pagamento'],clientRows())}</div>`;
else if(page==='meu-plano'){
const c=clients().find(x=>x.email===session.email);
html+=c?.plano?`<article class="panel-card"><h2>${safe(c.plano.nome)}</h2><p>${safe(c.plano.velocidade)} · ${safe(c.plano.valor)}/mês</p><p>Vencimento dia ${safe(c.plano.vencimento)} · ${safe(c.plano.status)} · Pagamento ${safe(c.plano.pagamento)}</p></article>`:`<article class="panel-card"><p>Você ainda não possui um plano contratado.</p><a class="btn btn-primary" href="planos.html">Conhecer planos</a></article>`;
}else if(page==='meus-dados'){
const c=clients().find(x=>x.email===session.email);
html+=`<form id="profile-form"><div class="form-row"><label>Nome completo<input name="nome" required value="${safe(c?.nome)}"></label><label>E-mail<input name="email" type="email" required value="${safe(c?.email)}"></label></div><div class="form-row"><label>Telefone<input name="telefone" required value="${safe(c?.telefone)}"></label><label>CPF<input value="${safe(c?.cpf)}" disabled></label></div><label>Endereço<input name="endereco" required value="${safe(c?.endereco)}"></label><button class="btn btn-primary">Salvar dados</button><p class="form-feedback" aria-live="polite"></p></form>`;
}else if(page==='mensagens'){
const visible=visibleTickets();
if(client)html+=`<form id="ticket-form"><h2>Nova solicitação</h2><label>Assunto<input name="assunto" required placeholder="Ex.: Internet lenta"></label><label>Mensagem<textarea name="mensagem" required rows="4" placeholder="Como podemos ajudar?"></textarea></label><button class="btn btn-primary">Enviar solicitação</button><p class="form-feedback" aria-live="polite"></p></form>`;
html+=visible.length?visible.map(ticketCard).join(''):'<p class="empty">Nenhum chamado encontrado.</p>';
}else if(page==='funcionarios'){
html+=table(['Nome','E-mail','Cargo','Nível de acesso','Status'],staff().map(user=>`<tr><td>${safe(user.nome)}</td><td>${safe(user.email)}</td><td>${safe(user.cargo)}</td><td>${user.nivel==='admin'?'Administrador':`<select data-role="${safe(user.email)}"><option value="atendimento" ${user.nivel==='atendimento'?'selected':''}>Atendimento</option><option value="tecnico" ${user.nivel==='tecnico'?'selected':''}>Técnico</option></select>`}</td><td>${safe(user.status)}</td></tr>`));
}else if(page==='configuracoes'){
if(client){const c=clients().find(x=>x.email===session.email);
html+=`<form id="settings-form"><h2>Dados de contato</h2><label>E-mail<input name="email" type="email" value="${safe(c?.email)}" required></label><label>Telefone<input name="telefone" value="${safe(c?.telefone)}" required></label><label>Endereço<input name="endereco" value="${safe(c?.endereco)}" required></label><label class="check-label"><input type="checkbox" name="preferencias" ${c?.preferencias?'checked':''}> Receber comunicações da FHP</label><h2>Alterar senha</h2><label>Senha atual<input name="atual" type="password" autocomplete="current-password"></label><label>Nova senha<input name="nova" type="password" minlength="8" autocomplete="new-password"></label><label>Confirmar nova senha<input name="confirmar" type="password" autocomplete="new-password"></label><button class="btn btn-primary">Salvar configurações</button><p class="form-feedback" aria-live="polite"></p></form><button id="delete-account" class="logout" type="button">Excluir minha conta</button>`}
else html+='<article class="panel-card"><h2>Configurações do ambiente</h2><p>Este projeto demonstrativo mantém contas, planos e chamados no armazenamento local deste navegador.</p><p>Os funcionários não podem alterar níveis de acesso. Essa operação fica disponível somente para o administrador.</p></article>';
html+=`<article class="panel-card privacy-card"><h2>Política de Privacidade</h2><p>Este projeto acadêmico armazena os dados exclusivamente no localStorage do navegador para demonstrar funcionalidades. Os dados não são enviados a servidores. Limpar os dados do navegador os remove.</p></article>`;
}
content.innerHTML=html+'</div>';
bind(page);
}
function bind(page){
content.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.go)));
const search=content.querySelector('#search-client');
if(search)search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('pt-BR'),rows=clientRows().filter(row=>row.toLocaleLowerCase('pt-BR').includes(q));
content.querySelector('#client-table').innerHTML=table(['Nome','E-mail','Telefone','CPF','Endereço','Plano','Velocidade','Valor','Vencimento','Status do plano','Pagamento'],rows)});
const ticketForm=content.querySelector('#ticket-form');
if(ticketForm)ticketForm.addEventListener('submit',event=>{event.preventDefault();
const feedback=ticketForm.querySelector('.form-feedback');
try{A.send(ticketForm.elements.assunto.value,ticketForm.elements.mensagem.value);
render('mensagens')}catch(error){feedback.textContent=error.message}});
content.querySelectorAll('[data-reply]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();
try{if(client){const all=tickets(),ticket=all.find(x=>x.id===form.dataset.reply);
if(!ticket)return;
ticket.mensagens.push({autor:session.nome,tipo:'cliente',texto:form.elements.texto.value,data:new Date().toLocaleString('pt-BR')});
A.write(A.K.tickets,all)}else A.responderMensagem(form.dataset.reply,form.elements.texto.value,form.elements.status?.value);
render('mensagens')}catch(error){alert(error.message)}}));
content.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>{try{A.encerrarChamado(button.dataset.close);
render('mensagens')}catch(error){alert(error.message)}}));
const profile=content.querySelector('#profile-form');
if(profile)profile.addEventListener('submit',event=>{event.preventDefault();
try{A.updateClient(Object.fromEntries(new FormData(profile)));
profile.querySelector('.form-feedback').textContent='Dados atualizados.';
setTimeout(()=>location.reload(),350)}catch(error){profile.querySelector('.form-feedback').textContent=error.message}});
const settings=content.querySelector('#settings-form');
if(settings)settings.addEventListener('submit',event=>{event.preventDefault();
const current=clients().find(x=>x.email===session.email),feedback=settings.querySelector('.form-feedback');
try{if(settings.elements.nova.value){if(settings.elements.atual.value!==current.senha)throw Error('A senha atual não confere.');
if(settings.elements.nova.value.length<8||settings.elements.nova.value!==settings.elements.confirmar.value)throw Error('Verifique a nova senha (mínimo 8 caracteres) e a confirmação.')}A.updateClient({email:settings.elements.email.value,telefone:settings.elements.telefone.value,endereco:settings.elements.endereco.value,preferencias:settings.elements.preferencias.checked,...(settings.elements.nova.value?{senha:settings.elements.nova.value}:{})});
feedback.textContent='Configurações salvas.';
setTimeout(()=>location.reload(),350)}catch(error){feedback.textContent=error.message}});
const remove=content.querySelector('#delete-account');
if(remove)remove.addEventListener('click',()=>{if(confirm('Excluir sua conta e seus chamados? Esta ação não pode ser desfeita.')){A.write(A.K.clients,clients().filter(c=>c.email!==session.email));
A.write(A.K.tickets,tickets().filter(t=>t.cliente!==session.email));
A.logout()}});
content.querySelectorAll('[data-role]').forEach(select=>select.addEventListener('change',()=>{try{A.alterarNivelFuncionario(select.dataset.role,select.value)}catch(error){alert(error.message);
render('funcionarios')}}));
}
function openContract(name){
if(!client){render('dashboard');
return}
const plan=A.plans.find(item=>item.nome===name);
if(!plan){render('dashboard');
return}
content.innerHTML=`<div class="content"><h1>Contratar plano</h1><article class="panel-card"><h2>${safe(plan.nome)} · ${safe(plan.velocidade)}</h2><p>${safe(plan.valor||'Consulte')}${plan.valor?'/mês':''}</p></article><form id="contract-form"><label>Endereço de instalação<input name="endereco" required value="${safe(clients().find(c=>c.email===session.email)?.endereco||'')}"></label><label>Data de vencimento/pagamento<select name="vencimento" required>${[5,10,15,20,25,30].map(day=>`<option value="${day}">Dia ${day}</option>`).join('')}</select></label><button class="btn btn-primary">Confirmar contratação</button><p class="form-feedback" aria-live="polite"></p></form></div>`;
const form=content.querySelector('#contract-form');
form.addEventListener('submit',event=>{event.preventDefault();
try{A.contract(name,form.elements.endereco.value,form.elements.vencimento.value);
form.querySelector('.form-feedback').textContent='Contratação realizada! Plano ativo e pagamento pendente.';
setTimeout(()=>render('meu-plano'),700)}catch(error){form.querySelector('.form-feedback').textContent=error.message}});
}
document.addEventListener('DOMContentLoaded',()=>{const initial=client?'inicio':'dashboard';
render(initial);
const params=new URLSearchParams(location.search),requested=params.get('secao');
if(requested){if(pages.includes(requested))render(requested);
else content.innerHTML='<div class="content"><h1>Acesso negado. Você não possui permissão para acessar esta área.</h1></div>'}const plan=params.get('contratar')||sessionStorage.getItem('fhpPlanoPendente');
if(plan){sessionStorage.removeItem('fhpPlanoPendente');
if(client)openContract(plan);
else content.innerHTML='<div class="content"><h1>Acesso negado. Você não possui permissão para contratar planos nesta conta.</h1></div>'}});
})();

