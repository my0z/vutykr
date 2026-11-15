(async () => {
  const data = await (await fetch('/api/products')).json();
  const tabs = document.getElementById('tabs');
  const grid = document.getElementById('grid');
  let current = '전체';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function render() {
    tabs.innerHTML = data.categories.map(c =>
      `<button class="${c === current ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    const list = data.products.filter(p => current === '전체' || p.category === current);
    grid.innerHTML = list.map(p => `
      <article class="card">
        <div class="img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '<span>IMAGE</span>'}${p.badge ? `<b>${esc(p.badge)}</b>` : ''}</div>
        <h2>${esc(p.name)}</h2>
        <p>${p.price ? Number(p.price).toLocaleString('ko-KR') + '원' : esc(p.desc || '')}${p.rocket ? ' · 로켓배송' : ''}</p>
        <a href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow">쿠팡에서 보기</a>
      </article>`).join('') || '<p class="empty">상품이 없습니다</p>';
  }
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { current = b.dataset.c; render(); }
  });
  render();
})();
