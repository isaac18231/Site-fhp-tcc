(() => {
const hero = document.getElementById('hero') || document.querySelector('.page-hero');
if (!hero) return;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Páginas internas: monta o mesmo visual da Home no topo (.page-hero)
if (hero.classList.contains('page-hero')) {
hero.insertAdjacentHTML('afterbegin', '<canvas class="hero-canvas" aria-hidden="true"></canvas><div class="hero-aurora" aria-hidden="true"><i></i><i></i></div>');
hero.insertAdjacentHTML('beforeend', '<div class="page-art" aria-hidden="true"><div class="art-core parallax" style="--d:8"><div class="orbit o1"><i></i></div><div class="orbit o2"><i></i></div><div class="signal"><i></i><i></i><i></i><b>FHP</b></div></div></div>');
const eb = hero.querySelector('.eyebrow');
if (eb) { eb.classList.add('badge');
eb.insertAdjacentHTML('afterbegin', '<span class="dot"></span>');
}
const h1 = hero.querySelector('h1');
if (h1) h1.classList.add('grad-title');
}
// Frase que alterna no título
const word = hero.querySelector('.rot-word');
const phrases = ['ao que importa.', 'ao mundo.', 'a quem você ama.', 'ao seu trabalho.', 'ao seu jogo.'];
let pi = 0;
if (word && !reduce) setInterval(() => {
word.classList.add('out');
setTimeout(() => { pi = (pi + 1) % phrases.length;
word.textContent = phrases[pi];
word.classList.remove('out');
}, 450);
}, 3000);
// Contadores
const counters = hero.querySelectorAll('[data-count]');
const run = el => {
const end = +el.dataset.count, suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1400;
const tick = now => {
const p = Math.min((now - t0) / dur, 1), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
el.textContent = v.toLocaleString('pt-BR') + suf;
if (p < 1) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
};
const statsBox = hero.querySelector('.hero-stats');
if (!reduce && statsBox && 'IntersectionObserver' in window) {
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { counters.forEach(run);
io.disconnect();
} }), { threshold: .4 });
io.observe(statsBox);
}
// Paralaxe com o mouse
let mouse = { x: -999, y: -999 };
hero.addEventListener('pointermove', e => {
const r = hero.getBoundingClientRect();
mouse.x = e.clientX - r.left;
mouse.y = e.clientY - r.top;
if (!reduce) {
hero.style.setProperty('--mx', ((mouse.x / r.width) - .5) * 2);
hero.style.setProperty('--my', ((mouse.y / r.height) - .5) * 2);
}
}, { passive: true });
hero.addEventListener('pointerleave', () => {
mouse = { x: -999, y: -999 };
hero.style.setProperty('--mx', 0);
hero.style.setProperty('--my', 0);
});
// Rede de fibra animada (canvas)
const cv = hero.querySelector('.hero-canvas'), ctx = cv.getContext('2d');
const D = 135;
let W, H, nodes = [], pulses = [], raf = 0, running = false;
const size = () => {
const dpr = Math.min(window.devicePixelRatio || 1, 2);
W = hero.clientWidth;
H = hero.clientHeight;
cv.width = W * dpr;
cv.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const n = Math.round(Math.min(90, Math.max(26, W * H / 16000)));
nodes = Array.from({ length: n }, () => ({
x: Math.random() * W, y: Math.random() * H,
vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.6 + .8
}));
pulses = [];
if (reduce) step(false);
};
function step(move = true) {
ctx.clearRect(0, 0, W, H);
if (move) nodes.forEach(n => {
n.x += n.vx;
n.y += n.vy;
if (n.x < 0 || n.x > W) n.vx *= -1;
if (n.y < 0 || n.y > H) n.vy *= -1;
});
ctx.lineWidth = 1;
for (let i = 0;
i < nodes.length;
i++) {
const a = nodes[i];
for (let j = i + 1;
j < nodes.length;
j++) {
const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
if (d < D) {
ctx.strokeStyle = `rgba(182,104,255,${(1 - d / D) * .34})`;
ctx.beginPath();
ctx.moveTo(a.x, a.y);
ctx.lineTo(b.x, b.y);
ctx.stroke();
}
}
const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
if (md < 180) {
ctx.strokeStyle = `rgba(239,218,255,${(1 - md / 180) * .55})`;
ctx.beginPath();
ctx.moveTo(a.x, a.y);
ctx.lineTo(mouse.x, mouse.y);
ctx.stroke();
if (move) { a.x += (mouse.x - a.x) * .004;
a.y += (mouse.y - a.y) * .004;
}
}
}
// pulsos de dados viajando pela rede
if (move && pulses.length < 7 && Math.random() < .04) {
const a = nodes[Math.floor(Math.random() * nodes.length)];
const b = nodes.find(n => n !== a && Math.hypot(n.x - a.x, n.y - a.y) < D);
if (b) pulses.push({ a, b, t: 0 });
}
pulses = pulses.filter(p => p.t < 1);
pulses.forEach(p => {
p.t += .022;
const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
g.addColorStop(0, 'rgba(255,240,255,.95)');
g.addColorStop(1, 'rgba(193,119,255,0)');
ctx.fillStyle = g;
ctx.beginPath();
ctx.arc(x, y, 12, 0, 7);
ctx.fill();
});
ctx.fillStyle = 'rgba(215,165,255,.85)';
nodes.forEach(n => { ctx.beginPath();
ctx.arc(n.x, n.y, n.r, 0, 7);
ctx.fill();
});
}
const loop = () => { step();
raf = running ? requestAnimationFrame(loop) : 0;
};
const start = () => { if (!running && !reduce) { running = true;
loop();
} };
const stop = () => { running = false;
cancelAnimationFrame(raf);
};
size();
if ('ResizeObserver' in window) new ResizeObserver(size).observe(hero);
else addEventListener('resize', size);
if ('IntersectionObserver' in window) new IntersectionObserver(es => es[0].isIntersecting ? start() : stop()).observe(hero);
else start();
document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
})();

