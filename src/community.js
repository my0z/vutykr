// 커뮤니티 API (D1)
const BOARDS = { notice: '공지', review: '후기', qna: '질문', tip: '꿀팁', free: '자유' };
let ready;

const SEED = [
  ['notice', '쁘띠.끄 이용 안내', '쁘띠.끄는 뷰티 이야기를 나누는 익명 커뮤니티입니다.\n\n- 닉네임과 비밀번호만 입력하면 글을 쓸 수 있어요\n- 비밀번호는 내 글을 지울 때 필요하니 꼭 기억하세요\n- 링크와 광고성 글은 자동으로 막힙니다\n- 욕설과 비방은 삭제될 수 있어요\n\n오른쪽에서 인기 뷰티템도 구경해 보세요.'],
  ['qna', '내 피부타입 공유해요 건성 지성 복합성', '여러분은 어떤 피부타입인가요?\n\n피부타입과 요즘 쓰는 제품 한 가지를 댓글로 남겨주세요.\n서로 비슷한 피부끼리 꿀조합을 찾아봐요.'],
  ['free', '오늘의 뷰티 수다방', '오늘 바른 화장품이나 새로 산 템 이야기를 편하게 남겨주세요.\n사소한 이야기도 환영입니다.']
];

export function init(env) {
  return (ready ||= (async () => {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT, title TEXT, body TEXT, nick TEXT, pwh TEXT, ts INTEGER, views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, ccount INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, vid TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, pid INTEGER, body TEXT, nick TEXT, pwh TEXT, ts INTEGER, hidden INTEGER DEFAULT 0, vid TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS likes (pid INTEGER, vid TEXT, PRIMARY KEY (pid, vid))'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_posts_board ON posts (board, hidden, ts)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comments_pid ON comments (pid)')
    ]);
    const now = Date.now();
    await env.DB.batch(SEED.map(([b, t, body], i) => env.DB.prepare(
      "INSERT INTO posts (board,title,body,nick,pwh,ts,pinned,vid) SELECT ?,?,?,'운영자','',?,?,'' WHERE NOT EXISTS (SELECT 1 FROM posts WHERE title=? AND nick='운영자')"
    ).bind(b, t, body, now - i * 1000, i === 0 ? 1 : 0, t)));
  })());
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const pwHash = pw => sha('petit|' + pw);
const who = async req => sha((req.headers.get('cf-connecting-ip') || '') + '|' + (req.headers.get('user-agent') || ''));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (m, status = 400) => json({ error: m }, status);
const clean = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
const hasLink = s => /https?:\/\/|www\.|\.(com|net|kr|io|co)\b|t\.me|kakao\.me|open\.kakao/i.test(s);

function checkText(title, body, nick) {
  if (hasLink(title + ' ' + body + ' ' + nick)) return '링크와 주소는 쓸 수 없어요';
  if (/(.)\1{9,}/.test(body)) return '같은 글자를 너무 많이 반복했어요';
  return '';
}

async function rate(env, table, vid, limit, windowMs) {
  const r = await env.DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE vid=? AND ts>?`).bind(vid, Date.now() - windowMs).first();
  return (r && r.n) >= limit;
}

const listCols = 'id,board,title,substr(body,1,90) ex,nick,ts,views,likes,ccount,pinned';

export async function handle(req, env, url, ctx) {
  await init(env);
  const path = url.pathname;
  const m = req.method;
  let r;

  if (path === '/api/posts' && m === 'GET') {
    const board = url.searchParams.get('board') || '';
    const sort = url.searchParams.get('sort') === 'hot' ? 'hot' : 'new';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const q = clean(url.searchParams.get('q'), 30);
    const size = 15;
    const where = ['hidden=0'];
    const binds = [];
    if (BOARDS[board]) { where.push('board=?'); binds.push(board); }
    if (q) { where.push('(title LIKE ? OR body LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
    if (sort === 'hot') { where.push('ts>?'); binds.push(Date.now() - 30 * 86400e3); }
    const order = sort === 'hot' ? '(likes*3+ccount*2+views/10) DESC, ts DESC' : (BOARDS[board] || q ? 'pinned DESC, ts DESC' : 'pinned DESC, ts DESC');
    r = await env.DB.prepare(`SELECT ${listCols} FROM posts WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size).all();
    const rows = r.results || [];
    return json({ posts: rows.slice(0, size), hasMore: rows.length > size, boards: BOARDS });
  }

  let mm = path.match(/^\/api\/posts\/(\d+)$/);
  if (mm && m === 'GET') {
    const id = Number(mm[1]);
    const post = await env.DB.prepare('SELECT id,board,title,body,nick,ts,views,likes,ccount,pinned FROM posts WHERE id=? AND hidden=0').bind(id).first();
    if (!post) return bad('없는 글입니다', 404);
    ctx.waitUntil(env.DB.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(id).run());
    const cs = await env.DB.prepare('SELECT id,body,nick,ts FROM comments WHERE pid=? AND hidden=0 ORDER BY ts LIMIT 200').bind(id).all();
    const vid = await who(req);
    const liked = await env.DB.prepare('SELECT 1 x FROM likes WHERE pid=? AND vid=?').bind(id, vid).first();
    return json({ post, comments: cs.results || [], liked: !!liked, boardName: BOARDS[post.board] });
  }

  if (path === '/api/posts' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (b.website) return json({ ok: true }); // 허니팟
    const board = BOARDS[b.board] && b.board !== 'notice' ? b.board : '';
    const title = clean(b.title, 60), body = clean(b.body, 2000), nick = clean(b.nick, 12), pw = clean(b.pw, 30);
    if (!board) return bad('게시판을 선택하세요');
    if (title.length < 2) return bad('제목을 2자 이상 써주세요');
    if (body.length < 5) return bad('내용을 5자 이상 써주세요');
    if (!nick) return bad('닉네임을 입력하세요');
    if (/운영|관리자|admin/i.test(nick)) return bad('사용할 수 없는 닉네임입니다');
    if (pw.length < 4) return bad('비밀번호는 4자 이상이에요');
    const t = checkText(title, body, nick);
    if (t) return bad(t);
    const vid = await who(req);
    if (await rate(env, 'posts', vid, 5, 3600e3)) return bad('잠시 후 다시 써주세요 (1시간에 5개까지)', 429);
    const res = await env.DB.prepare('INSERT INTO posts (board,title,body,nick,pwh,ts,vid) VALUES (?,?,?,?,?,?,?)').bind(board, title, body, nick, await pwHash(pw), Date.now(), vid).run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  mm = path.match(/^\/api\/posts\/(\d+)\/comments$/);
  if (mm && m === 'POST') {
    const id = Number(mm[1]);
    const b = await req.json().catch(() => ({}));
    if (b.website) return json({ ok: true });
    const body = clean(b.body, 300), nick = clean(b.nick, 12), pw = clean(b.pw, 30);
    if (body.length < 2) return bad('댓글을 2자 이상 써주세요');
    if (!nick) return bad('닉네임을 입력하세요');
    if (/운영|관리자|admin/i.test(nick)) return bad('사용할 수 없는 닉네임입니다');
    if (pw.length < 4) return bad('비밀번호는 4자 이상이에요');
    const t = checkText('', body, nick);
    if (t) return bad(t);
    const post = await env.DB.prepare('SELECT id FROM posts WHERE id=? AND hidden=0').bind(id).first();
    if (!post) return bad('없는 글입니다', 404);
    const vid = await who(req);
    if (await rate(env, 'comments', vid, 20, 3600e3)) return bad('잠시 후 다시 써주세요', 429);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO comments (pid,body,nick,pwh,ts,vid) VALUES (?,?,?,?,?,?)').bind(id, body, nick, await pwHash(pw), Date.now(), vid),
      env.DB.prepare('UPDATE posts SET ccount=ccount+1 WHERE id=?').bind(id)
    ]);
    return json({ ok: true });
  }

  mm = path.match(/^\/api\/posts\/(\d+)\/like$/);
  if (mm && m === 'POST') {
    const id = Number(mm[1]);
    const vid = await who(req);
    const has = await env.DB.prepare('SELECT 1 x FROM likes WHERE pid=? AND vid=?').bind(id, vid).first();
    if (has) {
      await env.DB.batch([env.DB.prepare('DELETE FROM likes WHERE pid=? AND vid=?').bind(id, vid), env.DB.prepare('UPDATE posts SET likes=MAX(0,likes-1) WHERE id=?').bind(id)]);
    } else {
      await env.DB.batch([env.DB.prepare('INSERT INTO likes (pid,vid) VALUES (?,?)').bind(id, vid), env.DB.prepare('UPDATE posts SET likes=likes+1 WHERE id=?').bind(id)]);
    }
    const p = await env.DB.prepare('SELECT likes FROM posts WHERE id=?').bind(id).first();
    return json({ liked: !has, likes: p ? p.likes : 0 });
  }

  mm = path.match(/^\/api\/(posts|comments)\/(\d+)\/delete$/);
  if (mm && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const id = Number(mm[2]);
    const table = mm[1];
    const row = await env.DB.prepare(`SELECT pwh${table === 'comments' ? ',pid' : ''} FROM ${table} WHERE id=? AND hidden=0`).bind(id).first();
    if (!row || !row.pwh || row.pwh !== await pwHash(clean(b.pw, 30))) return bad('비밀번호가 맞지 않아요', 403);
    await removeRow(env, table, id);
    return json({ ok: true });
  }

  return bad('not found', 404);
}

export async function removeRow(env, table, id) {
  if (table === 'comments') {
    const c = await env.DB.prepare('SELECT pid FROM comments WHERE id=?').bind(id).first();
    await env.DB.prepare('UPDATE comments SET hidden=1 WHERE id=?').bind(id).run();
    if (c) await env.DB.prepare('UPDATE posts SET ccount=MAX(0,ccount-1) WHERE id=?').bind(c.pid).run();
  } else {
    await env.DB.prepare('UPDATE posts SET hidden=1 WHERE id=?').bind(id).run();
  }
}

export async function adminNotice(env, title, body) {
  await init(env);
  await env.DB.prepare("INSERT INTO posts (board,title,body,nick,pwh,ts,pinned,vid) VALUES ('notice',?,?,'운영자','',?,1,'')").bind(clean(title, 60), clean(body, 2000), Date.now()).run();
}
export { BOARDS };
