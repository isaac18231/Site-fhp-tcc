document.querySelectorAll('.filters button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.filters button').forEach(b=>b.classList.remove('selected'));
button.classList.add('selected');
document.querySelectorAll('.portfolio-card').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&!card.classList.contains(button.dataset.filter)))}));

