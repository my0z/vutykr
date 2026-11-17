(() => {
  const $ = id => document.getElementById(id);
  const view = $('view');
  const CATS = ['스킨케어', '선케어', '클렌징', '메이크업', '바디헤어', '의류', '신발', '가방', '장신구', '잡화'];
  let clicks = {};
  const NAME = { notice: '공지', review: '후기', qna: '질문', tip: '꿀팁', free: '자유' };
  let products = { products: [], categories: ['전체'] };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const won = n => n ? Number(n).toLocaleString('ko-KR') + '원' : '가격 확인';
  const img = (p, eager, cls) => {
    if (!p.image) return cls ? '' : '🌸';
    const u = esc(String(p.image).replace(/^http:/, 'https:'));
    const c = cls ? ` class="${cls}"` : '';
    const a = `data-u="${u}" data-b="${cls ? 1 : ''}" decoding="async" referrerpolicy="no-referrer" alt="" onerror="__ie(this)"`;
    return eager ? `<img${c} src="${u}" fetchpriority="high" ${a}>` : `<img${c} data-src="${u}" ${a}>`;
  };
  // 이미지 로딩에 실패하면 두 번까지 다시 시도하고 그래도 안 되면 대체 표시
  window.__ie = el => {
    const n = +el.dataset.t || 0;
    if (n < 2) { el.dataset.t = n + 1; setTimeout(() => { el.removeAttribute('src'); el.src = el.dataset.u; }, 1000 * (n + 1)); }
    else if (el.dataset.b) el.parentNode.classList.add('noimg');
    else el.replaceWith('🌸');
  };
  // 썸네일은 화면에 들어오기 직전에만 불러온다
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    io.unobserve(el);
    el.src = el.dataset.src;
  }), { rootMargin: '600px 0px' }) : null;
  const watch = root => root.querySelectorAll && root.querySelectorAll('img[data-src]').forEach(el => { if (io) io.observe(el); else el.src = el.dataset.src; });
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) watch(n); }))).observe(document.body, { childList: true, subtree: true });
  const api = async (u, opt) => { const r = await fetch(u, opt); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '오류가 발생했어요'); return j; };
  const post = (u, b) => api(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return '방금 전'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 604800) return Math.floor(s / 86400) + '일 전'; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };


  const ICONS = { '스킨케어': '💧', '선케어': '☀️', '클렌징': '🫧', '메이크업': '💄', '바디헤어': '🧴', '의류': '👗', '신발': '👠', '가방': '👜', '장신구': '💍', '잡화': '🧣' };
  const FAQ = (() => { try { return JSON.parse($('faq-data').textContent); } catch (e) { return []; } })();
  const faqHtml = () => FAQ.length ? `<section class="faq"><h2>자주 묻는 질문</h2>${FAQ.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : '';
  const SN = document.body.dataset.name || '', HT = document.body.dataset.home || document.title;
  const setTitle = t => { document.title = t; };
  let timer;
  const narrow = on => view.classList.toggle('narrow', on);
  const ilink = p => `href="/item/${esc(p.id)}"`;
  const link = (p, extra) => `href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow"${extra || ''}`;

  function nav(cur) {
    const items = [['home', '홈', '/'], ['all', '🛍 전체상품', '/all'], ...CATS.map(c => [c, c, '/c/' + encodeURIComponent(c)]), ['talk', '💬 수다방', '#/talk']];
    $('boards').innerHTML = items.map(([k, v, h]) => `<a href="${h}" class="${k === cur ? 'on' : ''}">${v}</a>`).join('');
    $('drop').innerHTML = `<div class="in">${items.slice(1).map(([k, v, h]) => `<a href="${h}">${v}</a>`).join('')}</div>`;
    $('drop').classList.remove('open');
  }

  const ranked = () => products.products.map((p, i) => ({ ...p, rank: i + 1 })).sort((a, b) => (clicks[b.id] || 0) - (clicks[a.id] || 0) || a.rank - b.rank);
  const card = (p, i, o = {}) => `<a class="pc" ${ilink(p)} style="animation-delay:${Math.min(i, 10) * 30}ms">
    <div class="pi">${img(p)}${o.rank ? `<span class="rkb ${i + (o.off || 0) < 3 ? 'top' : ''}">${i + 1 + (o.off || 0)}</span>` : ''}</div>
    <div class="cn">${esc(p.category)}</div><h3>${esc(p.name)}</h3><div class="pp">${won(p.price)}</div>${clicks[p.id] ? `<div class="hot">🔥 ${clicks[p.id]}회 클릭</div>` : ''}<div class="bt"><span>상품보기</span></div></a>`;

  function home() {
    setTitle(HT);
    narrow(false);
    nav('home');
    const r = ranked();
    // 한 화면에서 같은 상품(번호와 이름 기준)이 두 번 나오지 않게 구역마다 이미 쓴 상품을 제외
    const used = new Set();
    const nk = p => 'n:' + String(p.name).toLowerCase().replace(/\s+/g, '');
    const take = (list, n) => {
      const out = [];
      for (const p of list) {
        if (out.length >= n) break;
        if (used.has(p.id) || used.has(nk(p))) continue;
        used.add(p.id); used.add(nk(p));
        out.push(p);
      }
      return out;
    };
    // 실시간 BEST 랭킹은 순위대로 먼저 뽑는다 — 작업: 2026-11-17 18:09
    const railP = take(r, 12);
    // 메인 배너는 홈을 불러올 때마다 이미지가 있는 상품 중 4개를 무작위로 뽑는다 (BEST 랭킹에 나온 상품은 제외) — 작업: 2026-11-17 18:09
    const pool = r.filter(p => p.image);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let top3 = take(pool, 4);
    if (!top3.length) top3 = take(r, 1);
    const slides = top3.map((p, i) => `<a class="slide s${i % 4}" ${ilink(p)}><div class="bg">${img(p, i === 0, 'main')}</div><div class="tx"><small>🌸 오늘의 추천</small><h2>${esc(p.name)}</h2><div class="pr">${won(p.price)}</div><span class="go">상품보기 →</span></div></a>`).join('');
    const cats = CATS.map(c => ({ c, l: take(r.filter(p => p.category === c), 5) })).filter(x => x.l.length);
    view.innerHTML = `
      <section class="hero"><div class="car" id="car">${slides || '<div class="slide s0 on"><div class="tx"><small>🌸 쁘띠.끄</small><h2>인기템을 준비하고 있어요</h2></div></div>'}<button class="cb l" aria-label="이전">‹</button><button class="cb r" aria-label="다음">›</button><div class="dots" id="dots"></div></section>`.replace('</section>', '</div><div class="tiles"><a class="tile t1" href="/c/%EC%9D%98%EB%A5%98"><b>👗 여성 패션 모아보기</b><span>의류와 신발과 가방과 장신구</span></a><a class="tile t2" href="#/talk"><b>💬 수다방</b><span>후기와 꿀팁 구경하기</span></a></div></section>') + `
      <section class="icons">${[['전체', '🛍', '/all'], ...CATS.map(c => [c, ICONS[c], '/c/' + encodeURIComponent(c)]), ['수다방', '💬', '#/talk']].map(([n, e, h]) => `<a href="${h}"><i>${e}</i>${n}</a>`).join('')}</section>
      <section class="sec"><div class="sh"><h2>🔥 실시간 <em>BEST 랭킹</em></h2><a href="/all">전체보기 ›</a></div><div class="railw"><button class="rb l" aria-label="이전">‹</button><div class="rail" id="rail">${railP.map((p, i) => card(p, i, { rank: 1 })).join('') || '<p class="empty">상품을 준비 중이에요</p>'}</div><button class="rb r" aria-label="다음">›</button></div></section>
      ${cats.map(x => `<section class="sec"><div class="sh"><h2>${ICONS[x.c]} ${esc(x.c)} <em>BEST</em></h2><a href="/c/${encodeURIComponent(x.c)}">더보기 ›</a></div><div class="pg">${x.l.map((p, i) => card(p, i)).join('')}</div></section>`).join('')}
      <section class="band"><div class="sh"><h2>💬 수다방 <em>새 글</em></h2><a href="#/talk">더보기 ›</a></div><div class="posts" id="posts"><p class="hint">불러오는 중</p></div><a class="btn main" style="margin-top:14px" href="#/write">✏️ 글쓰기</a></section>${faqHtml()}`;
    // 캐러셀
    const car = $('car'), sl = [...car.querySelectorAll('.slide')];
    let cur = 0;
    $('dots').innerHTML = sl.map((_, i) => `<i data-i="${i}"></i>`).join('');
    const go = i => { cur = (i + sl.length) % sl.length; sl.forEach((s, k) => s.classList.toggle('on', k === cur)); $('dots').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === cur)); };
    go(0);
    car.querySelector('.cb.l').onclick = () => go(cur - 1);
    car.querySelector('.cb.r').onclick = () => go(cur + 1);
    $('dots').onclick = e => { if (e.target.dataset.i) go(Number(e.target.dataset.i)); };
    if (sl.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(cur + 1), 5000);
    const rail = $('rail');
    view.querySelector('.rb.l').onclick = () => rail.scrollBy({ left: -rail.clientWidth * .8, behavior: 'smooth' });
    view.querySelector('.rb.r').onclick = () => rail.scrollBy({ left: rail.clientWidth * .8, behavior: 'smooth' });
    const loadPosts = () => api('/api/posts?sort=new').then(d => { $('posts').innerHTML = d.posts.slice(0, 3).map(p => `<a class="pt" href="#/p/${p.id}"><span class="bd ${p.board}">${NAME[p.board] || ''}</span><h4>${esc(p.title)}</h4><p>${esc(p.ex)}</p></a>`).join('') || '<p class="hint">아직 글이 없어요</p>'; }).catch(() => {});
    if (io) { const po = new IntersectionObserver(es => { if (es[0].isIntersecting) { po.disconnect(); loadPosts(); } }, { rootMargin: '300px' }); po.observe($('posts')); } else loadPosts();
  }

  // 카테고리 / 전체 / 검색 결과 목록 (클릭 수는 실제 집계)
  function catalog(cat, kw) {
    narrow(false);
    nav(kw ? '' : cat || 'all');
    setTitle((kw ? kw + ' 검색' : (cat ? cat + ' 인기 랭킹 TOP' : '전체 상품 인기 랭킹')) + ' | ' + SN);
    let sort = 'rank', shown = 20;
    const title = kw ? `"${esc(kw)}" 검색 결과` : (cat ? esc(cat) : '전체 상품');
    view.innerHTML = `<div class="ph"><h1>${title}</h1><span class="hint" id="cnt"></span></div><div class="tools"><button class="chip on" data-s="rank">인기순</button><button class="chip" data-s="low">낮은 가격순</button><button class="chip" data-s="high">높은 가격순</button></div><div class="pg" id="pg"></div><div id="pmore"></div>`;
    function draw() {
      const k = (kw || '').toLowerCase();
      let l = ranked().filter(p => (!cat || p.category === cat) && (!k || p.name.toLowerCase().includes(k)));
      if (sort === 'low') l.sort((a, b) => (a.price || 0) - (b.price || 0));
      else if (sort === 'high') l.sort((a, b) => (b.price || 0) - (a.price || 0));
      $('cnt').textContent = `${l.length}개 상품`;
      $('pg').innerHTML = l.slice(0, shown).map((p, i) => card(p, i, { rank: sort === 'rank' })).join('') || '<p class="empty">상품이 없어요</p>';
      $('pmore').innerHTML = l.length > shown ? '<button class="more">더 보기</button>' : '';
    }
    view.querySelector('.tools').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; sort = b.dataset.s; view.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); draw(); };
    $('pmore').onclick = () => { shown += 20; draw(); };
    draw();
  }

  const adCard = p => `<a class="ad" href="/item/${esc(p.id)}"><div class="th">${img(p)}</div><div class="tx"><small>추천 상품</small><h4>${esc(p.name)}</h4><b>${won(p.price)}</b></div><span class="go">상품보기</span></a>`;
  const item = (p, i) => `<a class="item ${p.pinned ? 'pin' : ''}" href="#/p/${p.id}" style="animation-delay:${Math.min(i, 10) * 35}ms">
    <span class="bd ${p.board}">${NAME[p.board] || ''}</span>${p.pinned ? '📌' : ''}<h2>${esc(p.title)}</h2><p class="ex">${esc(p.ex)}</p>
    <div class="meta"><b>${esc(p.nick)}</b><span>${ago(p.ts)}</span><span>👁 ${p.views}</span><span>❤ ${p.likes}</span><span>💬 ${p.ccount}</span></div></a>`;

  async function feed(board) {
    nav('talk');
    let sort = 'new', page = 1, q = $('q').value.trim();
    const title = board ? NAME[board] : '전체 글';
    view.innerHTML = `<div class="tools"><button class="chip on" data-s="new">최신</button><button class="chip" data-s="hot">🔥 인기</button><span class="hint" style="margin-left:auto">${esc(title)}${q ? ' · "' + esc(q) + '" 검색' : ''}</span></div><div id="list"></div><div id="more"></div>`;
    const list = $('list'), more = $('more');
    async function load(reset) {
      if (reset) { page = 1; list.innerHTML = ''; }
      const d = await api(`/api/posts?board=${board || ''}&sort=${sort}&page=${page}&q=${encodeURIComponent(q)}`).catch(() => ({ posts: [] }));
      const base = list.children.length;
      list.insertAdjacentHTML('beforeend', d.posts.map((p, i) => {
        const n = base + i + 1;
        const ad = n % 5 === 0 && products.products.length ? adCard(products.products[(n / 5 - 1) % products.products.length]) : '';
        return item(p, i) + ad;
      }).join(''));
      if (!list.children.length) list.innerHTML = '<p class="empty">아직 글이 없어요<br>첫 글의 주인공이 되어보세요 ✏️</p>';
      more.innerHTML = d.hasMore ? '<button class="more">더 보기</button>' : '';
    }
    view.querySelector('.tools').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; sort = b.dataset.s; view.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); load(true); });
    more.addEventListener('click', () => { page++; load(false); });
    load(true);
  }

  async function show(id) {
    nav('talk');
    view.innerHTML = '<p class="empty">불러오는 중</p>';
    let d;
    try { d = await api('/api/posts/' + id); } catch (e) { view.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const p = d.post;
    view.innerHTML = `<article class="box post"><span class="bd ${p.board}">${NAME[p.board]}</span><h1>${esc(p.title)}</h1>
      <div class="meta"><b>${esc(p.nick)}</b><span>${ago(p.ts)}</span><span>👁 ${p.views + 1}</span></div>
      <div class="body">${esc(p.body).replace(/\n/g, '<br>')}</div>
      <div class="acts"><button class="btn like ${d.liked ? 'on' : ''}" id="lk">❤ <span>${p.likes}</span></button>
      <a class="btn" href="#/b/${p.board}">목록</a>${p.nick === '운영자' ? '' : '<button class="btn" id="del">삭제</button>'}</div></article>
      <section class="box"><h3>댓글 ${d.comments.length}</h3><div id="cms">${d.comments.map(c => `<div class="cm"><div class="who"><span><b>${esc(c.nick)}</b> · ${ago(c.ts)}</span><button data-c="${c.id}">삭제</button></div><p>${esc(c.body).replace(/\n/g, '<br>')}</p></div>`).join('') || '<p class="hint">첫 댓글을 남겨보세요</p>'}</div>
      <form class="f" id="cf" style="margin-top:12px"><div class="two"><input name="nick" placeholder="닉네임" maxlength="12" value="${esc(ls.get('nick'))}" required><input name="pw" type="password" placeholder="비밀번호 (삭제용)" maxlength="30" value="${esc(ls.get('pw'))}" required></div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off"><textarea name="body" rows="3" placeholder="댓글을 입력하세요 (링크는 쓸 수 없어요)" maxlength="300" required></textarea><div class="err" id="ce"></div><button class="btn main">댓글 등록</button></form></section>`;
    $('lk').onclick = async () => { try { const r = await post(`/api/posts/${id}/like`, {}); $('lk').classList.toggle('on', r.liked); $('lk').lastElementChild.textContent = r.likes; } catch (e) { alert(e.message); } };
    const del = $('del');
    if (del) del.onclick = async () => { const pw = prompt('글을 쓸 때 정한 비밀번호'); if (!pw) return; try { await post(`/api/posts/${id}/delete`, { pw }); location.hash = '#/'; } catch (e) { alert(e.message); } };
    view.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { const pw = prompt('댓글 비밀번호'); if (!pw) return; try { await post(`/api/comments/${b.dataset.c}/delete`, { pw }); show(id); } catch (e) { alert(e.message); } });
    $('cf').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try { await post(`/api/posts/${id}/comments`, f); ls.set('nick', f.nick); ls.set('pw', f.pw); show(id); } catch (er) { $('ce').textContent = er.message; }
    };
  }

  function write() {
    nav('talk');
    view.innerHTML = `<section class="box"><h3>수다방 글쓰기</h3><form class="f" id="wf">
      <select name="board" required><option value="">게시판 선택</option><option value="review">후기</option><option value="qna">질문</option><option value="tip">꿀팁</option><option value="free">자유</option></select>
      <input name="title" placeholder="제목" maxlength="60" required>
      <textarea name="body" rows="9" placeholder="내용을 입력하세요 (링크와 광고는 쓸 수 없어요)" maxlength="2000" required></textarea>
      <div class="two"><input name="nick" placeholder="닉네임" maxlength="12" value="${esc(ls.get('nick'))}" required><input name="pw" type="password" placeholder="비밀번호 (삭제용 4자 이상)" maxlength="30" value="${esc(ls.get('pw'))}" required></div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off"><div class="err" id="we"></div>
      <div class="acts"><button class="btn main">등록</button><a class="btn" href="#/">취소</a></div></form></section>`;
    $('wf').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try { const r = await post('/api/posts', f); ls.set('nick', f.nick); ls.set('pw', f.pw); location.hash = '#/p/' + r.id; } catch (er) { $('we').textContent = er.message; }
    };
  }

  function route() {
    clearInterval(timer);
    let h = location.hash.replace(/^#/, '');
    if (!h && /^\/item\/\d+$/.test(location.pathname)) {
      narrow(false);
      const el = document.querySelector('[data-cat]');
      nav(el ? el.dataset.cat : '');
      return;
    }
    if (!h) { const pp = decodeURIComponent(location.pathname); h = /^\/(c\/.+|all)$/.test(pp) ? pp : '/'; }
    let m;
    scrollTo(0, 0);
    if ((m = h.match(/^\/p\/(\d+)/))) { narrow(true); show(m[1]); }
    else if ((m = h.match(/^\/b\/(\w+)/))) { narrow(true); feed(m[1]); }
    else if (h === '/write') { narrow(true); write(); }
    else if (h === '/talk') { narrow(true); feed(''); }
    else if ((m = h.match(/^\/c\/(.+)/))) catalog(decodeURIComponent(m[1]));
    else if ((m = h.match(/^\/s\/(.+)/))) catalog('', decodeURIComponent(m[1]));
    else if (h === '/all') catalog('');
    else home();
  }

  $('sf').addEventListener('submit', e => { e.preventDefault(); const v = $('q').value.trim(); location.hash = v ? '#/s/' + encodeURIComponent(v) : '/all'; });
  $('allcat').addEventListener('click', () => { const d = $('drop'); const o = d.classList.toggle('open'); $('allcat').setAttribute('aria-expanded', o); });
  document.addEventListener('click', e => { if (!e.target.closest('.cat')) $('drop').classList.remove('open'); });
  const top = $('top');
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  addEventListener('scroll', () => top.classList.toggle('show', scrollY > 500), { passive: true });
  addEventListener('hashchange', route);
  addEventListener('popstate', route);
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const u = new URL(a.href);
    if (u.origin !== location.origin || !/^\/(c\/.+|all)?$/.test(u.pathname)) return;
    e.preventDefault();
    history.pushState(null, '', u.pathname);
    route();
  });
  (async () => {
    try {
      const [p, c] = await (window.__d || Promise.all([fetch('/api/products').then(r => r.json()), fetch('/api/clicks').then(r => r.json())]));
      if (p) products = p;
      if (c) clicks = c;
    } catch (e) {}
    route();
  })();
})();
