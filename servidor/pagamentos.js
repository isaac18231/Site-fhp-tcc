/* Pagamentos reais com Mercado Pago (Checkout Pro).
   O navegador nunca vê o Access Token: ele fica só no servidor, em variável de ambiente.
   O preço vem sempre da tabela abaixo, nunca do navegador.
   O Mercado Pago guarda os pagamentos; este servidor só consulta pela "external_reference",
   por isso funciona em hospedagem gratuita sem banco de dados.

   Variáveis de ambiente:
     MP_ACCESS_TOKEN    Access Token da aplicação no Mercado Pago (obrigatório)
     MP_WEBHOOK_SECRET  Assinatura secreta das notificações (recomendado)
     MP_AMBIENTE        "teste" (padrão) ou "producao" — só muda os avisos da tela
     SITE_ORIGINS       Endereços do site que podem usar a API, separados por vírgula
                        (ex.: https://isaac18231.github.io)
     PUBLIC_URL         Endereço público deste servidor (ex.: https://fhp-fibra.onrender.com)
     MP_API_BASE        Só para testes: troca o endereço da API do Mercado Pago */
const crypto = require('crypto');

// Mesmos nomes e valores de js/fhp.js. Planos sem preço não são vendidos online.
const PLANOS = {
  'FHP Start': { slug: 'start', valor: 79.90, velocidade: '300 Mega' },
  'FHP Turbo': { slug: 'turbo', valor: 99.90, velocidade: '500 Mega' },
  'FHP Ultra': { slug: 'ultra', valor: 119.90, velocidade: '700 Mega' },
  'FHP Gamer': { slug: 'gamer', valor: 149.90, velocidade: '1 Giga' }
};
const PLANO_POR_SLUG = Object.fromEntries(Object.entries(PLANOS).map(([nome, p]) => [p.slug, { nome, ...p }]));
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// PUBLIC_URL sem "https://" ou mal escrito é ignorado (com aviso), em vez de derrubar o servidor.
const publicUrl = () => {
  const raw = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
};

const env = () => ({
  token: process.env.MP_ACCESS_TOKEN || '',
  secret: process.env.MP_WEBHOOK_SECRET || '',
  ambiente: process.env.MP_AMBIENTE === 'producao' ? 'producao' : 'teste',
  origens: (process.env.SITE_ORIGINS || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean),
  publicUrl: publicUrl(),
  api: (process.env.MP_API_BASE || 'https://api.mercadopago.com').replace(/\/+$/, '')
});

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

// Atrás de um proxy (Render), o IP real é o último da lista X-Forwarded-For: o cliente não consegue forjá-lo.
const clientIp = req => {
  const list = String(req.headers['x-forwarded-for'] || '').split(',').map(ip => ip.trim()).filter(Boolean);
  return list.length ? list[list.length - 1] : String(req.socket.remoteAddress || '');
};

// Limite simples por IP para não deixarem o servidor chamando o Mercado Pago sem parar.
const hits = new Map();
const limited = (req, max) => {
  const ip = clientIp(req);
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
};

const readBody = async (req, limit = 20000) => {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(Error('Requisição grande demais.'), { code: 413 });
  }
  return raw;
};

const readJson = async req => {
  try {
    return JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    throw Object.assign(Error(error.code === 413 ? error.message : 'Requisição inválida.'), { code: error.code || 400 });
  }
};

// Referência que liga o pagamento ao cliente, ao mês e ao plano: FHP:<id do cliente>:<AAAA-MM>:<plano>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCIA = /^(\d{4})-(0[1-9]|1[0-2])$/;
const buildRef = (cliente, competencia, slug) => `FHP:${cliente.toLowerCase()}:${competencia}:${slug}`;

const parseRef = ref => {
  const match = /^FHP:([0-9a-f-]{36}):(\d{4}-\d{2}):([a-z]+)$/.exec(String(ref || ''));
  if (!match || !UUID.test(match[1]) || !COMPETENCIA.test(match[2]) || !PLANO_POR_SLUG[match[3]]) return null;
  return { cliente: match[1], competencia: match[2], plano: PLANO_POR_SLUG[match[3]] };
};

// Aceita competências de 24 meses atrás até o mês seguinte ao atual.
const competenciaValida = competencia => {
  const match = COMPETENCIA.exec(competencia || '');
  if (!match) return false;
  const now = new Date();
  const index = Number(match[1]) * 12 + Number(match[2]) - 1;
  const current = now.getFullYear() * 12 + now.getMonth();
  return index >= current - 24 && index <= current + 1;
};

// Só devolve o usuário para endereços do próprio site (evita redirecionamento para sites estranhos).
const origemPermitida = (origin, cfg) => {
  if (!origin) return false;
  if (cfg.origens.includes(origin)) return true;
  if (cfg.publicUrl && origin === cfg.publicUrl) return true;
  return cfg.ambiente === 'teste' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

const mpFetch = async (path, options = {}) => {
  const cfg = env();
  const response = await fetch(cfg.api + path, {
    ...options,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`[mercado pago] ${options.method || 'GET'} ${path.split('?')[0]} → ${response.status}`, data.message || data.error || '');
    throw Object.assign(Error('O Mercado Pago não respondeu como esperado. Tente de novo em instantes.'), { code: 502 });
  }
  return data;
};

const metodo = payment => {
  if (payment.payment_method_id === 'pix') return 'pix';
  if (payment.payment_type_id === 'ticket') return 'boleto';
  if (payment.payment_type_id === 'credit_card') return 'cartao';
  if (payment.payment_type_id === 'debit_card') return 'debito';
  if (payment.payment_type_id === 'account_money') return 'saldo';
  return payment.payment_type_id || 'outro';
};

const STATUS = {
  approved: 'pago',
  authorized: 'processando',
  in_process: 'processando',
  pending: 'processando',
  in_mediation: 'processando',
  rejected: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
  charged_back: 'estornado'
};

const resumo = payment => ({
  id: String(payment.id),
  status: STATUS[payment.status] || 'processando',
  metodo: metodo(payment),
  bandeira: payment.payment_type_id === 'credit_card' || payment.payment_type_id === 'debit_card' ? payment.payment_method_id || '' : '',
  final: payment.card?.last_four_digits || '',
  valor: payment.transaction_amount,
  pagoEm: payment.date_approved || null,
  criadoEm: payment.date_created || null
});

// Entre vários pagamentos com a mesma referência, vale o aprovado; senão o mais recente em andamento.
const PRIORIDADE = { pago: 0, estornado: 1, processando: 2, recusado: 3, cancelado: 4 };
const escolher = (pagamentos, valorEsperado) => {
  const lista = pagamentos.map(resumo)
    .filter(p => p.status !== 'pago' || p.valor >= valorEsperado - 0.01)
    .sort((a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status] || String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return lista[0] || null;
};

// Consultas recentes ficam em memória por alguns segundos para poupar a API.
const cache = new Map();
const CACHE_MS = 15000;

const statusDaReferencia = async (ref, { fresh = false } = {}) => {
  const parsed = parseRef(ref);
  const cached = cache.get(ref);
  if (!fresh && cached && Date.now() - cached.em < CACHE_MS) return cached.valor;
  const busca = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=20`);
  const valor = escolher(busca.results || [], parsed.plano.valor);
  cache.set(ref, { em: Date.now(), valor });
  if (cache.size > 2000) cache.clear();
  return valor;
};

/* ---------- Rotas ---------- */

const config = (req, res) => {
  const cfg = env();
  json(res, 200, { ativo: !!cfg.token, ambiente: cfg.ambiente });
};

const criarPreferencia = async (req, res) => {
  const cfg = env();
  const body = await readJson(req);
  const plano = Object.hasOwn(PLANOS, String(body.plano)) ? PLANOS[body.plano] : null;
  if (!plano) return json(res, 400, { error: 'Este plano não está disponível para pagamento online.' });
  if (!UUID.test(body.cliente || '')) return json(res, 400, { error: 'Conta de cliente inválida.' });
  if (!competenciaValida(body.competencia)) return json(res, 400, { error: 'Mês da cobrança inválido.' });

  let retorno;
  try {
    retorno = new URL(body.retorno);
  } catch {
    return json(res, 400, { error: 'Endereço de retorno inválido.' });
  }
  if (!origemPermitida(retorno.origin, cfg)) {
    return json(res, 400, { error: 'Endereço de retorno não autorizado. Confira SITE_ORIGINS no servidor.' });
  }

  const nome = String(body.pagador?.nome || '').trim().slice(0, 120);
  const email = String(body.pagador?.email || '').trim().toLowerCase().slice(0, 120);
  const [ano, mes] = body.competencia.split('-').map(Number);
  const ref = buildRef(body.cliente, body.competencia, plano.slug);
  const titulo = body.tipo === 'fatura'
    ? `${body.plano} ${plano.velocidade} – mensalidade de ${MESES[mes - 1]}/${ano}`
    : `${body.plano} ${plano.velocidade} – 1ª mensalidade`;
  const https = retorno.protocol === 'https:';

  const preferencia = {
    items: [{ id: plano.slug, title: titulo, description: 'Internet por fibra óptica FHP Fibra', category_id: 'services', quantity: 1, currency_id: 'BRL', unit_price: plano.valor }],
    payer: { ...(nome ? { name: nome } : {}), ...(/^\S+@\S+\.\S+$/.test(email) ? { email } : {}) },
    external_reference: ref,
    metadata: { cliente: body.cliente, competencia: body.competencia, plano: plano.slug, tipo: body.tipo === 'fatura' ? 'fatura' : 'plano' },
    back_urls: { success: retorno.href, pending: retorno.href, failure: retorno.href },
    // O Mercado Pago só volta sozinho para endereços públicos com https.
    ...(https ? { auto_return: 'approved' } : {}),
    ...(cfg.publicUrl.startsWith('https://') ? { notification_url: `${cfg.publicUrl}/api/pagamentos/webhook` } : {}),
    payment_methods: { installments: 1 },
    statement_descriptor: 'FHP FIBRA'
  };

  const criada = await mpFetch('/checkout/preferences', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(preferencia)
  });
  cache.delete(ref);
  json(res, 201, { ref, url: criada.init_point, preferencia: criada.id });
};

const consultarStatus = async (req, res) => {
  const body = await readJson(req);
  const refs = Array.isArray(body.refs) ? [...new Set(body.refs)].slice(0, 30) : [];
  if (!refs.length || refs.some(ref => !parseRef(ref))) return json(res, 400, { error: 'Referências inválidas.' });
  const fresh = body.atualizar === true;
  const resultado = {};
  // Consulta em pequenos lotes para não sobrecarregar a API.
  for (let i = 0; i < refs.length; i += 6) {
    const lote = refs.slice(i, i + 6);
    const respostas = await Promise.all(lote.map(ref => statusDaReferencia(ref, { fresh })));
    lote.forEach((ref, index) => { resultado[ref] = respostas[index]; });
  }
  json(res, 200, { status: resultado });
};

// Valida a assinatura enviada pelo Mercado Pago no cabeçalho x-signature (HMAC SHA-256).
const assinaturaValida = (req, dataId, secret) => {
  const header = String(req.headers['x-signature'] || '');
  const partes = Object.fromEntries(header.split(',').map(p => p.split('=').map(s => s.trim())).filter(p => p.length === 2));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const requestId = req.headers['x-request-id'];
  const manifest = `${id ? `id:${id};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(partes.v1).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const webhook = async (req, res, query) => {
  const cfg = env();
  const raw = await readBody(req).catch(() => '');
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch { /* corpo inválido: usa só a query */ }
  const dataId = String(query.get('data.id') || body.data?.id || '');
  if (cfg.secret && !assinaturaValida(req, dataId, cfg.secret)) return json(res, 401, { error: 'Assinatura inválida.' });
  json(res, 200, { recebido: true });

  // A resposta já foi enviada; agora confere o pagamento e limpa o cache da referência.
  const tipo = query.get('type') || body.type;
  if (tipo !== 'payment' || !/^\d+$/.test(dataId)) return;
  try {
    const payment = await mpFetch(`/v1/payments/${dataId}`);
    if (payment.external_reference) cache.delete(payment.external_reference);
    console.log(`[mercado pago] pagamento ${payment.id} ${payment.status} · ${payment.external_reference || 'sem referência'}`);
  } catch (error) {
    console.error('[mercado pago] falha ao conferir notificação:', error.message);
  }
};

// Devolve true quando a rota é de pagamentos (e já respondeu).
const handle = (req, res, url, query) => {
  if (!url.startsWith('/api/pagamentos/')) return false;
  const cfg = env();
  const rota = `${req.method} ${url}`;
  const run = async () => {
    if (rota === 'GET /api/pagamentos/config') return config(req, res);
    if (rota === 'POST /api/pagamentos/webhook') return webhook(req, res, query);
    if (!cfg.token) return json(res, 503, { error: 'Pagamentos não configurados no servidor (falta MP_ACCESS_TOKEN).' });
    if (limited(req, 40)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
    if (rota === 'POST /api/pagamentos/preferencia') return criarPreferencia(req, res);
    if (rota === 'POST /api/pagamentos/status') return consultarStatus(req, res);
    return json(res, 404, { error: 'Rota não encontrada.' });
  };
  run().catch(error => {
    if (!res.headersSent) json(res, error.code && error.code < 600 ? error.code : 500, { error: error.code ? error.message : 'Erro interno.' });
    if (!error.code) console.error(error);
  });
  return true;
};

const resumoInicial = () => {
  const cfg = env();
  if (!cfg.token) return 'Pagamentos: desligados (sem MP_ACCESS_TOKEN). O checkout do site funciona em modo simulado.';
  const avisos = [];
  if (!cfg.secret) avisos.push('sem MP_WEBHOOK_SECRET');
  if (!cfg.origens.length) avisos.push('sem SITE_ORIGINS');
  if (process.env.PUBLIC_URL && !cfg.publicUrl) avisos.push('PUBLIC_URL inválido (use https://...)');
  return `Pagamentos: Mercado Pago ativo (${cfg.ambiente})${avisos.length ? ` — atenção: ${avisos.join(', ')}` : ''}.`;
};

module.exports = { handle, clientIp, origemPermitida: origin => origemPermitida(origin, env()), resumoInicial, PLANOS, buildRef, parseRef };
