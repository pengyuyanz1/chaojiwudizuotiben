/* 刷题本 —— 纯前端，无依赖
   题库：window.QUESTION_BANK（由 build.mjs 从 questions.xlsx 生成）
   存储：localStorage（答题统计 / 错题本 / 当前练习 / 主题） */
'use strict';

/* ============ 数据与存储 ============ */
const BANK = window.QUESTION_BANK || [];
const BY_ID = new Map(BANK.map(q => [q.id, q]));

const KEY_STORE = 'qb.v1.store';
const KEY_SESSION = 'qb.v1.session';
const KEY_THEME = 'qb.v1.theme';

const SRC_LABEL = { official: '官方答案', consensus: '多源一致', reviewed: '已复核', gz: '题库答案', ww: '题库答案', ai: 'AI 生成' };
const TYPE_LABEL = { judge: '判断', single: '单选', multi: '多选' };

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch { return fallback; }
}
const store = Object.assign({ stats: { done: 0, right: 0 }, prog: {}, wrong: {} }, loadJSON(KEY_STORE, {}));
let session = loadJSON(KEY_SESSION, null);
const saveStore = () => localStorage.setItem(KEY_STORE, JSON.stringify(store));
const saveSession = () => { session ? localStorage.setItem(KEY_SESSION, JSON.stringify(session)) : localStorage.removeItem(KEY_SESSION); };

/* ============ 全局 UI 状态 ============ */
const S = {
  view: 'home',            // home | practice | summary | wrong
  filters: { lv: 'all', type: 'all', secs: new Set(), order: 'seq', count: 20 },
  sheetOpen: false,
  wrongExpanded: new Set(),
};

/* ============ 工具 ============ */
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
let toastTimer = null;
function toast(msg) {
  $toast.textContent = msg; $toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.hidden = true; }, 1800);
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const letter = (i) => String.fromCharCode(65 + i);
const lvLabel = (lv) => lv === 3 ? '三级' : lv === 4 ? '四级' : `L${lv}`;
function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ============ 筛选与组卷 ============ */
function sections() {
  const m = new Map();
  for (const q of BANK) {
    const key = `${q.lv}|${q.ch}|${q.sec}`;
    if (!m.has(key)) m.set(key, { key, lv: q.lv, ch: q.ch, sec: q.sec, n: 0 });
    m.get(key).n++;
  }
  return [...m.values()].sort((a, b) => a.lv - b.lv || a.ch.localeCompare(b.ch, 'zh') || a.sec.localeCompare(b.sec, 'zh'));
}
function filteredIds() {
  const f = S.filters;
  return BANK.filter(q =>
    (f.lv === 'all' || q.lv === f.lv) &&
    (f.type === 'all' || q.type === f.type) &&
    (f.secs.size === 0 || f.secs.has(`${q.lv}|${q.ch}|${q.sec}`))
  ).map(q => q.id);
}
function buildPaper(ids) {
  const f = S.filters;
  let list = f.order === 'rand' ? shuffle(ids) : ids;
  if (f.count !== 'all' && list.length > f.count) list = list.slice(0, f.count);
  return list;
}
function startPractice(ids, title, from) {
  if (!ids.length) { toast('没有可刷的题'); return; }
  session = { qs: ids, i: 0, answers: {}, graded: {}, title, from: from || 'home' };
  saveSession();
  S.view = 'practice'; S.sheetOpen = false;
  render();
}

/* ============ 判分与错题记录 ============ */
function isCorrect(q, sel) {
  if (q.type === 'judge') return sel === q.ans;
  const norm = [...String(sel)].sort().join('');
  const want = [...q.ans].sort().join('');
  return norm === want;
}
function grade(qid) {
  const q = BY_ID.get(qid), s = session;
  const sel = s.answers[qid];
  if (!sel || s.graded[qid]) return;
  s.graded[qid] = true;
  const ok = isCorrect(q, sel);
  store.stats.done++;
  if (ok) store.stats.right++;
  const p = store.prog[qid] || { c: 0, w: 0 };
  ok ? p.c++ : p.w++;
  p.last = Date.now(); store.prog[qid] = p;
  let cleared = false;
  if (ok) {
    if (store.wrong[qid]) { delete store.wrong[qid]; cleared = true; }
  } else {
    const w = store.wrong[qid] || { n: 0, t: 0 };
    w.n++; w.t = Date.now(); store.wrong[qid] = w;
  }
  saveStore(); saveSession();
  if (cleared) toast('答对了，已移出错题本 ✓');
  render();
}
function removeWrong(qid, silent) {
  if (store.wrong[qid]) { delete store.wrong[qid]; saveStore(); }
  if (!silent) toast('已移出错题本');
}

/* ============ 视图渲染 ============ */
function render() {
  if (S.view === 'practice') renderPractice();
  else if (S.view === 'summary') renderSummary();
  else if (S.view === 'wrong') renderWrong();
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- 首页 ---------- */
function renderHome() {
  const wrongN = Object.keys(store.wrong).length;
  const acc = store.stats.done ? Math.round(store.stats.right / store.stats.done * 100) : 0;
  const secs = sections();
  const secChips = secs.map(s => {
    const on = S.filters.secs.has(s.key);
    return `<button class="chip ${on ? 'on' : ''}" data-sec="${s.key}">${esc(s.ch)}·${esc(s.sec)}<span class="cnt">${s.n}</span></button>`;
  }).join('');
  const chip = (val, label, cur, extra = '') =>
    `<button class="chip ${cur === val ? 'on' : ''}" data-filter="${extra}" data-val="${val}">${label}</button>`;

  $app.innerHTML = `
    ${session && session.qs.length ? `
    <div class="resume-bar">
      <div>📝 上次练到第 <b>${session.i + 1}</b> / ${session.qs.length} 题（${esc(session.title)}）</div>
      <button class="btn sm" id="resumeBtn">继续练习</button>
    </div>` : ''}
    <div class="stat-grid">
      <div class="stat"><b>${BANK.length}</b><span>总题数</span></div>
      <div class="stat"><b>${store.stats.done}</b><span>已刷</span></div>
      <div class="stat"><b>${acc}%</b><span>正确率</span></div>
      <div class="stat wrong-card" id="wrongEntry"><b style="color:var(--bad)">${wrongN}</b><span>错题本 ›</span></div>
    </div>

    <div class="card">
      <h2>开始刷题</h2>
      <div class="sec-title">等级</div>
      <div class="chips">${chip('all', '全部', S.filters.lv, 'lv')}${chip(3, '三级', S.filters.lv, 'lv')}${chip(4, '四级', S.filters.lv, 'lv')}</div>
      <div class="sec-title">题型</div>
      <div class="chips">${chip('all', '全部', S.filters.type, 'type')}${chip('judge', '判断题', S.filters.type, 'type')}${chip('single', '单选题', S.filters.type, 'type')}${chip('multi', '多选题', S.filters.type, 'type')}</div>
      <div class="sec-title">章节（可多选）</div>
      <div class="chips">${chip('__clear', '清空章节', 'never', 'sec')}</div>
      <div class="chips" style="margin-top:8px">${secChips}</div>
      <div class="sec-title">出题顺序</div>
      <div class="chips">${chip('seq', '顺序', S.filters.order, 'order')}${chip('rand', '随机', S.filters.order, 'order')}</div>
      <div class="sec-title">每次题量</div>
      <div class="chips">${[10, 20, 50, 100].map(n => chip(n, `${n} 题`, S.filters.count, 'count')).join('')}${chip('all', '全部', S.filters.count, 'count')}</div>
      <button class="btn start-btn" id="startBtn">开始练习</button>
      <div class="hit-count" style="text-align:center;margin-top:10px">当前筛选命中 <b id="hitN"></b> 题</div>
    </div>

    <div class="card">
      <h2>数据管理</h2>
      <div class="btn-row">
        <button class="btn ghost sm" id="exportBtn">导出备份</button>
        <button class="btn ghost sm" id="importBtn">导入备份</button>
        <button class="btn danger sm" id="resetBtn">清空全部记录</button>
        <input type="file" id="importFile" accept=".json" class="hidden">
      </div>
    </div>`;
  updateHit();

  const on = (sel, fn) => { const el = $app.querySelector(sel); if (el) el.addEventListener('click', fn); };
  if (session && session.qs.length) on('#resumeBtn', () => { S.view = 'practice'; render(); });
  on('#wrongEntry', () => { S.view = 'wrong'; render(); });
  on('#startBtn', () => startPractice(buildPaper(filteredIds()), '自主练习'));
  $app.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => {
    const kind = el.dataset.filter, val = el.dataset.val, f = S.filters;
    if (kind === 'lv') f.lv = val === 'all' ? 'all' : Number(val);
    else if (kind === 'type') f.type = val;
    else if (kind === 'order') f.order = val;
    else if (kind === 'count') f.count = val === 'all' ? 'all' : Number(val);
    else if (kind === 'sec' && val === '__clear') f.secs.clear();
    render();
  }));
  $app.querySelectorAll('[data-sec]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.sec;
    S.filters.secs.has(k) ? S.filters.secs.delete(k) : S.filters.secs.add(k);
    render();
  }));
  on('#exportBtn', exportData);
  on('#importBtn', () => $app.querySelector('#importFile').click());
  on('#importFile', importData);
  on('#resetBtn', () => {
    if (confirm('确定清空全部刷题记录和错题本吗？此操作不可恢复。')) {
      store.stats = { done: 0, right: 0 }; store.prog = {}; store.wrong = {};
      session = null; saveStore(); saveSession(); toast('已清空'); render();
    }
  });
}
function updateHit() {
  const el = $app.querySelector('#hitN');
  if (el) el.textContent = filteredIds().length;
}

/* ---------- 练习页 ---------- */
function curQ() { return BY_ID.get(session.qs[session.i]); }
function renderPractice() {
  const q = curQ();
  const s = session;
  const sel = s.answers[q.id] || null;
  const graded = !!s.graded[q.id];
  const answeredN = Object.keys(s.graded).length;
  const rightN = Object.keys(s.graded).filter(id => isCorrect(BY_ID.get(id), s.answers[id])).length;

  let optsHtml = '';
  if (q.type === 'judge') {
    const keys = ['√', '×'];
    optsHtml = q.opts.map((o, i) => optHtml(keys[i], o, sel === keys[i], graded, q, keys[i])).join('');
  } else {
    optsHtml = q.opts.map((o, i) => {
      const L = letter(i);
      const isSel = q.type === 'multi' ? sel && sel.includes(L) : sel === L;
      return optHtml(L, o, isSel, graded, q, L);
    }).join('');
  }

  const srcTag = SRC_LABEL[q.src] ? `<span class="tag plain">${SRC_LABEL[q.src]}</span>` : '';
  const wInfo = store.wrong[q.id];
  const wTag = wInfo ? `<span class="tag bad2">累计错 ${wInfo.n} 次</span>` : '';

  let verdictHtml = '';
  if (graded) {
    const ok = isCorrect(q, sel);
    const ansText = q.type === 'judge' ? (q.ans === '√' ? '正确' : '错误') : [...q.ans].map(c => `${c}. ${q.opts[c.charCodeAt(0) - 65]}`).join('<br>');
    verdictHtml = `
      <div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ 回答正确' : '✗ 回答错误'}</div>
      ${ok ? '' : `<div class="explain"><b>正确答案</b><br>${ansText}</div>`}
      ${q.exp ? `<div class="explain"><b>解析</b><br>${esc(q.exp)}</div>` : ''}`;
  }

  const sheetHtml = S.sheetOpen ? `<div class="answer-sheet">${s.qs.map((id, idx) => {
    let cls = '';
    if (s.graded[id]) cls = isCorrect(BY_ID.get(id), s.answers[id]) ? 'done-ok' : 'done-bad';
    if (idx === s.i) cls += ' cur';
    return `<button class="sheet-item ${cls}" data-jump="${idx}">${idx + 1}</button>`;
  }).join('')}</div>` : '';

  const multiSubmit = (q.type === 'multi' && !graded && sel) ? `<button class="btn sm" id="multiSubmit" style="margin-top:12px">提交答案</button>` : '';

  $app.innerHTML = `
    <div class="practice-head">
      <button class="btn ghost sm" id="quitBtn">‹ 保存并退出</button>
      <div class="progress-wrap">
        <div class="progress-bar"><i style="width:${Math.round((s.i + 1) / s.qs.length * 100)}%"></i></div>
        <span class="pager-num">${s.i + 1} / ${s.qs.length}</span>
      </div>
      <button class="sheet-toggle" id="sheetBtn">答题卡（对 ${rightN} / 已答 ${answeredN}）</button>
    </div>
    ${S.sheetOpen ? sheetHtml : ''}
    <div class="card">
      <div class="qmeta">
        <span class="tag">${esc(session.title)}</span>
        <span class="tag plain">${lvLabel(q.lv)}</span>
        <span class="tag plain">${TYPE_LABEL[q.type]}</span>
        <span class="tag plain">${esc(q.ch)}·${esc(q.sec)}</span>
        ${srcTag}${wTag}
      </div>
      <div class="stem">${esc(q.stem)}</div>
      <div class="opts">${optsHtml}</div>
      ${multiSubmit}
      ${verdictHtml}
      <div class="practice-nav">
        <button class="btn ghost" id="prevBtn" ${s.i === 0 ? 'disabled' : ''}>上一题</button>
        ${s.i === s.qs.length - 1
          ? `<button class="btn" id="finishBtn">交卷，看成绩</button>`
          : `<button class="btn" id="nextBtn" ${graded ? '' : 'disabled'}>下一题</button>`}
      </div>
    </div>`;

  const on = (sel2, fn) => { const el = $app.querySelector(sel2); if (el) el.addEventListener('click', fn); };
  on('#quitBtn', () => { S.view = 'home'; render(); });
  on('#sheetBtn', () => { S.sheetOpen = !S.sheetOpen; render(); });
  $app.querySelectorAll('[data-jump]').forEach(el => el.addEventListener('click', () => { session.i = Number(el.dataset.jump); saveSession(); render(); }));
  on('#prevBtn', () => { session.i--; saveSession(); render(); });
  on('#nextBtn', () => { session.i++; saveSession(); render(); });
  on('#finishBtn', () => finishPractice());
  on('#multiSubmit', () => grade(q.id));

  const pick = (val) => {
    if (session.graded[q.id]) return;
    if (q.type === 'multi') {
      const cur = session.answers[q.id] ? session.answers[q.id].split('') : [];
      const idx = cur.indexOf(val);
      idx >= 0 ? cur.splice(idx, 1) : cur.push(val);
      cur.length ? session.answers[q.id] = cur.sort().join('') : delete session.answers[q.id];
    } else {
      session.answers[q.id] = val;
    }
    saveSession();
    if (q.type !== 'multi') grade(q.id); else render();
  };
  $app.querySelectorAll('[data-opt]').forEach(el => el.addEventListener('click', () => pick(el.dataset.opt)));
}
function optHtml(key, text, selected, graded, q, val) {
  let cls = selected ? 'sel' : '';
  if (graded) {
    const ok = isCorrect(q, session.answers[q.id]);
    const isAns = q.type === 'judge' ? val === q.ans : q.ans.includes(val);
    if (isAns) cls = 'right';
    else if (selected) cls = 'wrong';
    else cls = '';
    void ok;
  }
  return `<button class="opt ${cls}" data-opt="${val}" ${graded ? 'disabled' : ''}>
    <span class="key">${key}</span><span>${esc(text)}</span></button>`;
}
function finishPractice() {
  const s = session;
  const gradedIds = Object.keys(s.graded);
  if (gradedIds.length === 0) { toast('还没有作答任何题目'); return; }
  S.view = 'summary'; render();
}

/* ---------- 成绩页 ---------- */
function renderSummary() {
  const s = session;
  const ids = Object.keys(s.graded);
  const wrongIds = ids.filter(id => !isCorrect(BY_ID.get(id), s.answers[id]));
  const rightIds = ids.filter(id => isCorrect(BY_ID.get(id), s.answers[id]));
  const acc = ids.length ? Math.round(rightIds.length / ids.length * 100) : 0;
  const ungraded = s.qs.length - ids.length;

  $app.innerHTML = `
    <div class="card">
      <div class="score-ring">
        <div class="num">${acc}<small> 分</small></div>
        <div class="lbl">${esc(s.title)} · 成绩</div>
      </div>
      <div class="summary-rows">
        <div class="summary-row"><span>本次作答</span><b>${ids.length} / ${s.qs.length} 题</b></div>
        <div class="summary-row"><span>答对</span><b style="color:var(--ok)">${rightIds.length} 题</b></div>
        <div class="summary-row"><span>答错（已加入错题本）</span><b style="color:var(--bad)">${wrongIds.length} 题</b></div>
        ${ungraded ? `<div class="summary-row"><span>未作答</span><b>${ungraded} 题</b></div>` : ''}
        <div class="summary-row"><span>错题本现有</span><b>${Object.keys(store.wrong).length} 题</b></div>
      </div>
      <div class="btn-row" style="margin-top:6px">
        ${wrongIds.length ? `<button class="btn" id="redoWrongBtn">重做本次错题（${wrongIds.length}）</button>` : ''}
        <button class="btn ghost" id="againBtn">再刷一遍（${s.qs.length} 题）</button>
        <button class="btn ghost" id="backHomeBtn">返回首页</button>
      </div>
    </div>
    ${wrongIds.length ? `<div class="card"><h2>本次错题</h2>${wrongIds.map(id => {
      const q = BY_ID.get(id);
      return `<div class="wrong-item"><div class="wrong-main" data-summary-jump="${id}">
        <div class="wrong-stem">${esc(q.stem)}</div>
        <div class="wrong-sub">${TYPE_LABEL[q.type]} · 正确答案：${q.type === 'judge' ? (q.ans === '√' ? '正确' : '错误') : q.ans.split('').join(' ')}</div>
      </div></div>`;
    }).join('')}</div>` : ''}`;

  const on = (sel2, fn) => { const el = $app.querySelector(sel2); if (el) el.addEventListener('click', fn); };
  on('#redoWrongBtn', () => startPractice(shuffle(wrongIds), '错题重做'));
  on('#againBtn', () => startPractice(shuffle(s.qs), s.title));
  on('#backHomeBtn', () => { session = null; saveSession(); S.view = 'home'; render(); });
  $app.querySelectorAll('[data-summary-jump]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.summaryJump;
    const idx = s.qs.indexOf(id);
    if (idx >= 0) { s.i = idx; saveSession(); S.view = 'practice'; render(); }
  }));
}

/* ---------- 错题本 ---------- */
function renderWrong() {
  const entries = Object.entries(store.wrong)
    .map(([id, w]) => ({ q: BY_ID.get(id), w }))
    .filter(e => e.q)
    .sort((a, b) => b.w.t - a.w.t);

  const items = entries.map(({ q, w }) => {
    const open = S.wrongExpanded.has(q.id);
    let detail = '';
    if (open) {
      const opts = q.type === 'judge'
        ? q.opts.map((o, i) => `<div class="opt ${((i === 0) === (q.ans === '√')) ? 'right' : ''}" style="cursor:default"><span class="key">${i === 0 ? '√' : '×'}</span><span>${esc(o)}</span></div>`).join('')
        : q.opts.map((o, i) => `<div class="opt ${q.ans.includes(letter(i)) ? 'right' : ''}" style="cursor:default"><span class="key">${letter(i)}</span><span>${esc(o)}</span></div>`).join('');
      detail = `<div style="margin-top:10px" class="opts">${opts}</div>
        ${q.exp ? `<div class="explain"><b>解析</b><br>${esc(q.exp)}</div>` : ''}`;
    }
    return `<div class="wrong-item">
      <div class="wrong-main" data-toggle="${q.id}">
        <div class="wrong-stem">${esc(q.stem)}</div>
        <div class="wrong-sub">${lvLabel(q.lv)} · ${TYPE_LABEL[q.type]} · ${esc(q.ch)}·${esc(q.sec)} · 错 ${w.n} 次 · 最近 ${fmtTime(w.t)}</div>
        ${detail}
      </div>
      <div class="wrong-ops">
        <button class="btn ghost sm" data-redo="${q.id}">重做</button>
        <button class="btn danger sm" data-del="${q.id}">移除</button>
      </div>
    </div>`;
  }).join('');

  $app.innerHTML = `
    <div class="practice-head">
      <button class="btn ghost sm" id="backHomeBtn">‹ 返回首页</button>
      <span class="pager-num">错题本 · ${entries.length} 题</span>
    </div>
    ${entries.length ? `
    <div class="card">
      <div class="btn-row">
        <button class="btn" id="redoAllBtn">重做全部错题</button>
        <button class="btn ok" id="redoOldestBtn">优先重做老错题</button>
        <button class="btn danger sm" id="clearBtn" style="margin-left:auto">清空错题本</button>
      </div>
      <div class="hit-count" style="margin-top:8px">答对后会自动移出错题本；再答错则累计错误次数</div>
    </div>
    <div class="card">${items}</div>` : `
    <div class="card"><div class="empty"><div class="big">🎉</div>错题本是空的<br>去首页开始刷题吧</div></div>`}`;

  const on = (sel2, fn) => { const el = $app.querySelector(sel2); if (el) el.addEventListener('click', fn); };
  on('#backHomeBtn', () => { S.view = 'home'; render(); });
  on('#redoAllBtn', () => startPractice(shuffle(entries.map(e => e.q.id)), '错题重做'));
  on('#redoOldestBtn', () => startPractice(entries.slice().sort((a, b) => a.w.t - b.w.t).map(e => e.q.id), '错题重做'));
  on('#clearBtn', () => {
    if (confirm(`确定清空错题本（${entries.length} 题）吗？`)) {
      store.wrong = {}; saveStore(); toast('已清空'); render();
    }
  });
  $app.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.toggle;
    S.wrongExpanded.has(id) ? S.wrongExpanded.delete(id) : S.wrongExpanded.add(id);
    render();
  }));
  $app.querySelectorAll('[data-redo]').forEach(el => el.addEventListener('click', () => startPractice([el.dataset.redo], '错题重做')));
  $app.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => { removeWrong(el.dataset.del); render(); }));
}

/* ---------- 备份 ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'quiz-book', v: 1, exportedAt: Date.now(), store }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出备份');
}
function importData(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !data.store) throw new Error('格式不对');
      if (!confirm('导入会覆盖当前的刷题记录和错题本，继续吗？')) return;
      store.stats = data.store.stats || { done: 0, right: 0 };
      store.prog = data.store.prog || {};
      store.wrong = data.store.wrong || {};
      saveStore(); toast('导入成功'); render();
    } catch { toast('导入失败：文件格式不正确'); }
  };
  reader.readAsText(file);
}

/* ============ 主题 ============ */
function applyTheme(t) { document.documentElement.dataset.theme = t; document.getElementById('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙'; }

/* ============ 键盘快捷键 ============ */
document.addEventListener('keydown', (e) => {
  if (S.view !== 'practice' || !session) return;
  const q = curQ();
  if (e.key === 'Enter') {
    const nextBtn = $app.querySelector('#nextBtn') || $app.querySelector('#multiSubmit') || $app.querySelector('#finishBtn');
    if (nextBtn) nextBtn.click();
    return;
  }
  if (e.key === 'ArrowLeft' && session.i > 0) { session.i--; saveSession(); render(); return; }
  if (e.key === 'ArrowRight' && session.i < session.qs.length - 1) { session.i++; saveSession(); render(); return; }
  const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, a: 0, b: 1, c: 2, d: 3, e: 4 };
  const idx = map[e.key.toLowerCase()];
  if (idx == null || session.graded[q.id]) return;
  if (q.type === 'multi') { if (idx < q.opts.length) { const val = letter(idx); const el = $app.querySelector(`[data-opt="${val}"]`); if (el) el.click(); } }
  else if (q.type === 'single') { if (idx < q.opts.length) { const el = $app.querySelector(`[data-opt="${letter(idx)}"]`); if (el) el.click(); } }
});

/* ============ 启动 ============ */
document.getElementById('logoBtn').addEventListener('click', () => { S.view = 'home'; render(); });
document.getElementById('themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEY_THEME, cur); applyTheme(cur);
});
applyTheme(localStorage.getItem(KEY_THEME) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

if (!BANK.length) {
  $app.innerHTML = '<div class="card"><div class="empty">题库为空，请先运行 <b>node quiz-app/build.mjs</b> 生成 data/questions.js</div></div>';
} else {
  render();
}
