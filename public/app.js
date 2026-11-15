(() => {
  const $ = id => document.getElementById(id);
  const view = $('view'), side = $('side');
  const BOARDS = [['', '홈'], ['review', '후기'], ['qna', '질문'], ['tip', '꿀팁'], ['free', '자유'], ['notice', '공지'], ['shop', '🛍 쇼핑']];
  const NAME = { notice: '공지', review: '후기', qna: '질문', tip: '꿀팁', free: '자유' };
  let products = { products: [], categories: ['전체'] };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const won = n => n ? Number(n).toLocaleString('ko-KR') + '원' : '가격 확인';
  const img = p => p.image ? `<img src="/img?u=${encodeURIComponent(p.image)}" alt="" loading="lazy" onerror="this.replaceWith('🌸')">` : '🌸';
  const api = async (u, opt) => { const r = await fetch(u, opt); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '오류가 발생했어요'); return j; };
  const post = (u, b) => api(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return '방금 전'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 604800) return Math.floor(s / 86400) + '일 전'; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  function nav(cur) {
    $('boards').innerHTML = BOARDS.map(([k, v]) => `<a href="${k === '' ? '#/' : k === 'shop' ? '#/shop' : '#/b/' + k}" class="${k === cur ? 'on' : ''}">${v}</a>`).join('');
  }

  const adCard = p => `<a class="ad" href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow"><div class="th">${img(p)}</div><div class="tx"><small>추천 상품</small><h4>${esc(p.name)}</h4><b>${won(p.price)}</b></div><span class="go">상품보기</span></a>`;
  const item = (p, i) => `<a class="item ${p.pinned ? 'pin' : ''}" href="#/p/${p.id}" style="animation-delay:${Math.min(i, 10) * 35}ms">
    <span class="bd ${p.board}">${NAME[p.board] || ''}</span>${p.pinned ? '📌' : ''}<h2>${esc(p.title)}</h2><p class="ex">${esc(p.ex)}</p>
    <div class="meta"><b>${esc(p.nick)}</b><span>${ago(p.ts)}</span><span>👁 ${p.views}</span><span>❤ ${p.likes}</span><span>💬 ${p.ccount}</span></div></a>`;

  async function feed(board) {
    nav(board || '');
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
    nav('');
    view.innerHTML = '<p class="empty">불러오는 중</p>';
    let d;
    try { d = await api('/api/posts/' + id); } catch (e) { view.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    const p = d.post;
    nav(p.board);
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
    nav('');
    view.innerHTML = `<section class="box"><h3>글쓰기</h3><form class="f" id="wf">
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

  function shop() {
    nav('shop');
    let cur = '전체', sort = 'rank';
    view.innerHTML = `<div class="tools" id="st"></div><div class="grid" id="sg"></div>`;
    function draw() {
      $('st').innerHTML = products.categories.map(c => `<button class="chip ${c === cur ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') + `<select id="ss" style="margin-left:auto;padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink)"><option value="rank">인기순</option><option value="low">낮은 가격순</option><option value="high">높은 가격순</option></select>`;
      $('ss').value = sort;
      let l = products.products.map((p, i) => ({ ...p, rank: i + 1 })).filter(p => cur === '전체' || p.category === cur);
      if (sort === 'low') l.sort((a, b) => (a.price || 0) - (b.price || 0));
      if (sort === 'high') l.sort((a, b) => (b.price || 0) - (a.price || 0));
      $('sg').innerHTML = l.map(p => `<article class="card"><div class="pimg">${img(p)}${sort === 'rank' ? `<span class="rk ${p.rank <= 3 ? 'top' : ''}">${p.rank}</span>` : ''}</div><h4>${esc(p.name)}</h4><div class="pr">${won(p.price)}${p.rocket ? '<small>🚀 로켓배송</small>' : ''}</div><a class="go" href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow">상품보기 →</a></article>`).join('') || '<p class="empty">상품이 없어요</p>';
    }
    $('st').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { cur = b.dataset.c; draw(); } });
    $('st').addEventListener('change', e => { if (e.target.id === 'ss') { sort = e.target.value; draw(); } });
    draw();
  }

  async function sidebar() {
    const hot = await api('/api/posts?sort=hot').catch(() => ({ posts: [] }));
    const mini = products.products.filter(p => p.image).slice(0, 4);
    side.innerHTML = `<div class="box hot"><h3>🔥 인기글</h3>${hot.posts.slice(0, 5).map((p, i) => `<a href="#/p/${p.id}"><i>${i + 1}</i><span>${esc(p.title)}</span><em>${p.ccount ? '[' + p.ccount + ']' : ''}</em></a>`).join('') || '<p class="hint">인기글이 곧 올라와요</p>'}</div>
      ${mini.length ? `<div class="box"><h3>오늘의 픽 <a href="#/shop">전체보기</a></h3><div class="minis">${mini.map(p => `<a class="mini" href="${esc(p.url)}" target="_blank" rel="sponsored noopener nofollow"><div class="pimg">${img(p)}</div><p>${esc(p.name)}</p><b>${won(p.price)}</b></a>`).join('')}</div></div>` : ''}
      <div class="box"><h3>이용 규칙</h3><ul class="rules"><li>닉네임과 비밀번호만 있으면 글쓰기 OK</li><li>링크와 광고는 자동으로 막혀요</li><li>서로 존중하는 말을 써주세요</li></ul></div>`;
  }

  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    let m;
    scrollTo(0, 0);
    if ((m = h.match(/^\/p\/(\d+)/))) show(m[1]);
    else if ((m = h.match(/^\/b\/(\w+)/))) feed(m[1]);
    else if (h === '/write') write();
    else if (h === '/shop') shop();
    else feed('');
  }

  let t;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const h = location.hash; if (!/^#\/(b\/\w+)?$/.test(h) && h !== '') location.hash = '#/'; else route(); }, 350); });
  const top = $('top');
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  addEventListener('scroll', () => top.classList.toggle('show', scrollY > 500), { passive: true });
  addEventListener('hashchange', route);
  (async () => {
    try { products = await (await fetch('/api/products')).json(); } catch (e) {}
    sidebar();
    route();
  })();
})();
