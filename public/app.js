(async () => {
  const $ = id => document.getElementById(id);
  const grid = $('grid'), tabs = $('tabs');
  grid.innerHTML = '<div class="skel"></div>'.repeat(8);
  let data = { categories: ['전체'], products: [] };
  try { data = await (await fetch('/api/products')).json(); } catch (e) {}
  let current = '전체', query = '', sort = 'rank';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const icons = { '전체':'✨','스킨케어':'💧','선케어':'☀️','클렌징':'🫧','메이크업':'💄','바디헤어':'🧴' };

  $('cnt').textContent = data.products.length;
  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    $('upd').textContent = `${d.getMonth() + 1}/${d.getDate()}`;
  } else $('upd').textContent = '준비중';

  function view() {
    let list = data.products.map((p, i) => ({ ...p, rank: i + 1 }))
      .filter(p => (current === '전체' || p.category === current) && p.name.toLowerCase().includes(query));
    if (sort === 'low') list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'high') list.sort((a, b) => (b.price || 0) - (a.price || 0));
    tabs.innerHTML = data.categories.map(c =>
      `<button class="${c === current ? 'on' : ''}" data-c="${esc(c)}">${icons[c] || '🌸'} ${esc(c)}</button>`).join('');
    grid.innerHTML = list.map((p, i) => `
      <article class="card" style="animation-delay:${Math.min(i, 12) * 40}ms">
        <div class="img">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : '🌸'}
          ${sort === 'rank' && p.rank <= 99 ? `<span class="rank ${p.rank <= 3 ? 'top' : ''}">${p.rank}</span>` : ''}
          ${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ''}
        </div>
        <div class="cat">${esc(p.category)}</div>
        <h2>${esc(p.name)}</h2>
        <div class="price">${p.price ? Number(p.price).toLocaleString('ko-KR') + '원' : '가격 확인'}${p.rocket ? '<small class="rocket">🚀 로켓배송</small>' : ''}</div>
        <a class="btn" href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow">상품보기 →</a>
      </article>`).join('') || '<p class="empty">검색 결과가 없습니다</p>';
  }
  tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { current = b.dataset.c; view(); } });
  $('q').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); view(); });
  $('sort').addEventListener('change', e => { sort = e.target.value; view(); });
  const top = $('top');
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  addEventListener('scroll', () => top.classList.toggle('show', scrollY > 500), { passive: true });
  view();
})();
