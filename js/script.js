document.addEventListener('DOMContentLoaded',()=>{const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.main-nav');
if(toggle&&nav)toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');
toggle.setAttribute('aria-expanded',open)});
const items=document.querySelectorAll('.reveal');
if(!('IntersectionObserver'in window)){items.forEach(i=>i.classList.add('visible'));
return}const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');
observer.unobserve(e.target)}}),{threshold:.1});
items.forEach(i=>observer.observe(i));
});

