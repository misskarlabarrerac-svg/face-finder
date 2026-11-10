/* Face Finder client */
const { CHARACTERS, describe } = window.GW;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const socket = io();
let S = null;            // latest server state
let code = null;         // current game code
let guessMode = false;
let seen = new Set();    // log ids already seen (for popups)
let firstState = true;
let overShown = null;
let qrFor = null;

/* ---------- home ---------- */
const params = new URLSearchParams(location.search);
const urlCode = (params.get('code') || '').toUpperCase();
$('joinName').value = store.get('ff_name') || '';
$('createName').value = store.get('ff_name') || '';
if (urlCode) { $('joinCode').value = urlCode; const t = store.get('ff_token_' + urlCode); if (t) { code = urlCode; socket.emit('join', { code, token: t }); } }

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $('joinCode').value.trim().toUpperCase(), name = $('joinName').value.trim();
  if (c.length !== 4) return showJoinErr('The game code has 4 letters.');
  if (!name) return showJoinErr('Write your name.');
  store.set('ff_name', name);
  code = c;
  socket.emit('join', { code: c, name, token: store.get('ff_token_' + c) });
});
$('createForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('createName').value.trim();
  if (!name) return toast('Write your name first.', 'error');
  store.set('ff_name', name);
  socket.emit('create', { name, mode: document.querySelector('input[name=mode]:checked').value, hostPlays: $('hostPlays').checked });
});
function showJoinErr(t) { $('joinErr').textContent = t; $('joinErr').hidden = false; }

/* ---------- socket ---------- */
socket.on('joined', ({ code: c, token }) => {
  code = c; store.set('ff_token_' + c, token);
  history.replaceState(null, '', '?code=' + c);
  $('joinErr').hidden = true;
});
socket.on('joinError', (t) => { showJoinErr(t); const t2 = store.get('ff_token_' + code); if (t2 && !S) store.set('ff_token_' + code, ''); });
socket.on('toast', ({ text, kind }) => toast(text, kind));
socket.on('state', (st) => { S = st; render(); });
socket.on('connect', () => { if (S && code) socket.emit('join', { code, token: store.get('ff_token_' + code) }); });
socket.on('disconnect', () => { if (S) toast('Connection lost. Reconnecting…', 'error'); });

/* ---------- helpers ---------- */
let toastTimer;
function toast(text, kind) {
  const t = $('toast'); t.textContent = text; t.className = 'toast' + (kind === 'error' ? ' error' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
function modal(html, actions) {
  $('modalBody').innerHTML = html;
  const box = $('modalActions'); box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
    b.onclick = () => { closeModal(); a.fn && a.fn(); }; box.appendChild(b);
  }
  $('modal').hidden = false; box.querySelector('button')?.focus();
}
function closeModal() { $('modal').hidden = true; }
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const nameOf = (id) => id === S.me.id ? 'You' : (S.players.find(p => p.id === id)?.name || 'Someone');
const cardImg = (c) => `<img src="${c.img}" alt="${esc(c.name)}" loading="lazy">`;

function shortAnswers(q, pron) {
  const s = q.trim().toLowerCase();
  const P = pron === 'you' ? 'you' : pron;
  if (/^do i\b/.test(s)) return ['Yes, you do.', "No, you don't."];
  if (/^am i\b/.test(s)) return ['Yes, you are.', "No, you aren't."];
  if (/^have i\b/.test(s)) return ['Yes, you have.', "No, you haven't."];
  const subj = /\bhe\b/.test(s) ? 'he' : /\bshe\b/.test(s) ? 'she' : P;
  if (/^does\b/.test(s)) return [`Yes, ${subj} does.`, `No, ${subj} doesn't.`];
  if (/^is\b/.test(s)) return [`Yes, ${subj} is.`, `No, ${subj} isn't.`];
  if (/^has\b/.test(s)) return [`Yes, ${subj} has.`, `No, ${subj} hasn't.`];
  return ['Yes.', 'No.'];
}

const FEATURES = [
  'short hair', 'long hair', 'curly hair', 'blonde hair', 'brown hair', 'black hair', 'red hair', 'gray hair', 'bald',
  'blue eyes', 'brown eyes', 'green eyes', 'glasses', 'a beard', 'a mustache', 'freckles',
  'a hat', 'earrings', 'a necklace', 'a man', 'a woman', 'young', 'old', 'light skin', 'dark skin',
  'a blue top', 'a red top', 'a green top', 'a yellow top', 'a purple top',
];
let chipsFor = null;
function renderChips(group) {
  const key = group ? 'g' : 'c';
  if (chipsFor === key) return; chipsFor = key;
  const starts = group ? ['Do I have', 'Am I', 'Am I wearing', 'Have I got'] : ['Does your person have', 'Is your person', 'Is your person wearing', 'Has your person got'];
  $('chips').innerHTML = starts.map(s => `<button type="button" class="chip start" data-s="${s}">${s}…</button>`).join('') +
    FEATURES.map(f => `<button type="button" class="chip" data-f="${f}">${f}</button>`).join('');
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  const inp = $('askInput');
  if (b.dataset.s) inp.value = b.dataset.s + ' ';
  else inp.value = (inp.value.replace(/\?\s*$/, '').trim() + ' ' + b.dataset.f).trim() + '?';
  inp.focus();
});
$('askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  let t = $('askInput').value.trim(); if (!t) return;
  if (!/[?]$/.test(t)) t += '?';
  t = t[0].toUpperCase() + t.slice(1);
  socket.emit('ask', { text: t }); $('askInput').value = '';
});

/* ---------- render ---------- */
function show(id) { for (const s of ['home', 'lobby', 'game']) $(s).hidden = s !== id; }

function render() {
  if (!S) return show('home');
  if (S.phase === 'lobby') { guessMode = false; overShown = null; renderLobby(); show('lobby'); }
  else { renderGame(); show('game'); }
  firstState = false;
}

function renderLobby() {
  $('lobbyCode').textContent = S.code;
  const link = location.origin + '/?code=' + S.code;
  $('lobbyLink').value = link;
  if (qrFor !== S.code && window.qrcode) { const q = qrcode(0, 'M'); q.addData(link); q.make(); $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); qrFor = S.code; }
  const group = S.mode === 'group';
  $('lobbyMode').textContent = group ? 'Mystery Face (group)' : '1 vs 1 Classic';
  $('lobbyHint').textContent = group
    ? 'Choose a role. Guessers get a hidden person and ask questions. Describers see it and answer. Each player can change their role; the host can change anyone\'s.'
    : 'When the game starts, players are put into random pairs automatically.';
  $('lobbyTitle').textContent = `Players (${S.players.length})`;
  $('playerList').innerHTML = S.players.map(p => {
    const isMe = p.id === S.me.id, canEdit = isMe || S.isHost;
    const hostTag = p.id === S.hostId ? ` <span class="pill">${S.hostPlays ? 'host' : 'teacher'}</span>` : '';
    const roles = group ? `<span class="role-toggle">
        <button type="button" data-role="guesser" data-pid="${p.id}" class="${p.role === 'guesser' ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>Guesser</button>
        <button type="button" data-role="helper" data-pid="${p.id}" class="${p.role === 'helper' ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>Describer</button></span>` : '';
    const kick = S.isHost && !isMe ? `<button type="button" class="btn small ghost" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>` : '';
    return `<li class="${p.connected ? '' : 'off'}"><span class="nm">${esc(p.name)}${isMe ? ' (you)' : ''}${hostTag}</span><span class="role-toggle">${roles}${kick}</span></li>`;
  }).join('');
  $('startBtn').hidden = !S.isHost;
  $('lobbyWait').textContent = S.isHost ? 'Start when everyone has joined.' : 'Waiting for the host to start the game…';
}
$('playerList').addEventListener('click', (e) => {
  const r = e.target.closest('[data-role]'); if (r && !r.disabled) socket.emit('setRole', { playerId: r.dataset.pid, role: r.dataset.role });
  const k = e.target.closest('[data-kick]'); if (k) socket.emit('kick', { playerId: k.dataset.kick });
});
$('startBtn').onclick = () => socket.emit('start');
$('copyLink').onclick = () => {
  const v = $('lobbyLink').value;
  (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => toast('Link copied.'), () => { $('lobbyLink').select(); toast('Select the link and copy it.'); });
};

/* ----- game ----- */
function hostTools() {
  if (!S.isHost) return '';
  const extra = S.mode === 'classic' ? `<button class="btn small" data-tool="reshuffle">New pairs</button>` : `<button class="btn small" data-tool="newRound">New round</button>`;
  return extra + `<button class="btn small" data-tool="lobby">Back to lobby</button>`;
}
$('hostTools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]'); if (!b) return;
  const t = b.dataset.tool;
  if (t === 'lobby') return modal('<h2>Back to the lobby?</h2><p>The current games will end. Players stay connected.</p>', [{ label: 'Back to lobby', cls: 'coral', fn: () => socket.emit('lobby') }, { label: 'Cancel' }]);
  if (t === 'reshuffle') return modal('<h2>Make new pairs?</h2><p>All current matches end and players are paired again at random.</p>', [{ label: 'New pairs', cls: 'coral', fn: () => socket.emit('reshuffle') }, { label: 'Cancel' }]);
  if (t === 'newRound') return modal('<h2>Start a new round?</h2><p>Every guesser gets a new person and the questions are cleared.</p>', [{ label: 'New round', cls: 'coral', fn: () => socket.emit('newRound') }, { label: 'Cancel' }]);
});

function renderBoard({ clickable = true, highlight = null } = {}) {
  const flipped = new Set(S.flipped);
  $('board').classList.toggle('guessing', guessMode);
  $('board').innerHTML = CHARACTERS.map(c =>
    `<button type="button" class="card ${flipped.has(c.id) ? 'down' : ''} ${highlight === c.id ? 'mine' : ''} ${clickable ? '' : 'static'}" data-id="${c.id}" ${clickable ? '' : 'tabindex="-1"'}>${cardImg(c)}<span class="nm">${esc(c.name)}</span></button>`
  ).join('');
  $('board').dataset.clickable = clickable ? '1' : '';
}

$('board').addEventListener('click', (e) => {
  const b = e.target.closest('.card'); if (!b || !$('board').dataset.clickable) return;
  const c = CHARACTERS[+b.dataset.id];
  const m = S.match;
  if (S.mode === 'classic' && m && m.phase === 'choose') {
    if (m.myPick != null) return;
    return modal(`${cardImg(c)}<h2>${esc(c.name)}</h2><p class="desc">${esc(describe(c))}</p><p>Choose ${esc(c.name)} as your secret person?</p>`,
      [{ label: 'Yes, choose', cls: 'coral', fn: () => socket.emit('pick', { charId: c.id }) }, { label: 'Cancel' }]);
  }
  if (guessMode) {
    return modal(`${cardImg(c)}<h2>Is it ${esc(c.name)}?</h2><p>Make your final guess.</p>`,
      [{ label: `Guess ${c.name}`, cls: 'coral', fn: () => { guessMode = false; socket.emit('guess', { charId: c.id }); } }, { label: 'Cancel', fn: () => {} }]);
  }
  b.classList.toggle('down');
  socket.emit('flip', { charId: c.id });
});

$('boardActions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'guess') { guessMode = !guessMode; render(); if (guessMode) toast('Tap the person you think it is.'); }
  if (a === 'reset') socket.emit('resetFlips');
  if (a === 'skip') modal('<h2>Give up?</h2><p>You will see who you were and get a new person.</p>', [{ label: 'Give up', cls: 'coral', fn: () => socket.emit('skip') }, { label: 'Keep playing' }]);
  if (a === 'partner') socket.emit('newPartner');
});

function renderGame() {
  $('gameCode').textContent = S.code;
  $('hostTools').innerHTML = hostTools();
  $('helperView').hidden = true; $('monitorView').hidden = true; $('board').hidden = false;
  $('chatPanel').hidden = false; $('askForm').hidden = false; $('answerArea').innerHTML = '';
  if (S.mode === 'classic') renderClassic(); else renderGroup();
}

/* ---------- classic ---------- */
function renderClassic() {
  renderChips(false);
  if (S.monitor) return renderMonitor();
  const m = S.match;
  if (!m) {
    $('status').textContent = S.notice || 'Waiting for a partner…';
    $('boardTitle').textContent = 'The people';
    $('boardActions').innerHTML = '';
    renderBoard({ clickable: false });
    $('sideInfo').innerHTML = `<div class="panel"><h3>Waiting for a partner</h3><p class="hint">You will be paired as soon as another player is free.</p></div>`;
    $('chatPanel').hidden = true;
    return;
  }
  const opp = m.opponent;
  const myTurn = m.turn === S.me.id;
  const mine = m.myPick != null ? CHARACTERS[m.myPick] : null;
  if (m.phase !== 'play') guessMode = false;
  if (m.phase === 'choose') {
    $('status').textContent = m.myPick == null ? 'Choose your secret person' : `Waiting for ${opp.name} to choose…`;
    $('boardTitle').textContent = m.myPick == null ? 'Tap a person to choose' : 'Your board';
    $('boardActions').innerHTML = '';
  } else if (m.phase === 'play') {
    $('status').innerHTML = myTurn ? (m.pending ? `Waiting for ${esc(opp.name)} to answer…` : '<span class="pill turn">Your turn</span> Ask a question or make a guess') : (m.pending ? `${esc(opp.name)} asked you a question` : `${esc(opp.name)} is thinking…`);
    $('boardTitle').textContent = 'Tap to turn people down';
    const canGuess = myTurn && !m.pending;
    if (!canGuess) guessMode = false;
    $('boardActions').innerHTML = `<button class="btn small" data-act="reset">Turn all up</button><button class="btn small ${guessMode ? 'sun' : 'coral'}" data-act="guess" ${canGuess ? '' : 'disabled'}>${guessMode ? 'Cancel guess' : 'Make a guess'}</button>`;
  } else {
    $('status').textContent = m.winner === S.me.id ? 'You won!' : `${opp.name} won this game`;
    $('boardActions').innerHTML = `<button class="btn small coral" data-act="rematch">Play again</button><button class="btn small" data-act="partner">New partner</button>`;
  }
  renderBoard({ clickable: m.phase !== 'over' && !(m.phase === 'choose' && m.myPick != null), highlight: m.myPick });

  const oppC = m.oppPick != null ? CHARACTERS[m.oppPick] : null;
  $('sideInfo').innerHTML = `<div class="panel">
    <div class="secret">
      <div class="face">${mine ? cardImg(mine) : '<div class="mystery" style="height:100%">?</div>'}</div>
      <div><span class="eyebrow">Your secret person</span><h3>${mine ? esc(mine.name) : 'Not chosen yet'}</h3>
      ${mine ? `<p class="desc">${esc(describe(mine))}</p>` : ''}</div>
    </div>
    <div class="vs"><span class="pill">Partner: ${esc(opp.name)}${opp.connected ? '' : ' (offline)'}</span><span class="pill">${m.oppPicked ? 'Partner is ready' : 'Partner is choosing'}</span><span class="pill mint">Your wins: ${S.me.score}</span></div>
    ${oppC ? `<div class="secret"><div class="face">${cardImg(oppC)}</div><div><span class="eyebrow">${esc(opp.name)}'s person</span><h3>${esc(oppC.name)}</h3></div></div>` : ''}
  </div>`;

  // log
  renderLog(m.log.map(e => {
    if (e.type === 'q') return { cls: e.from === S.me.id ? 'me' : '', who: nameOf(e.from) + (e.from === S.me.id ? ' asked' : ' asks'), text: e.text, id: e.id };
    if (e.type === 'a') return { cls: 'a-' + (e.answer || ''), who: nameOf(e.from) + ' answered', text: e.text || e.answer, id: e.id };
    return { cls: e.type, text: e.text, id: e.id };
  }));

  // answer box when opponent asked
  if (m.phase === 'play' && m.pending && !myTurn) {
    const q = m.log.find(x => x.id === m.pending);
    const [y, n] = shortAnswers(q.text, mine?.g === 'f' ? 'she' : 'he');
    $('answerArea').innerHTML = `<div class="answer-box"><span class="eyebrow">${esc(opp.name)} asks</span><div class="q">${esc(q.text)}</div>
      <p class="desc">Look at ${esc(mine.name)} and answer.</p>
      <div class="answer-btns">
        <button class="btn mint" data-ans="yes" data-t="${esc(y)}" data-q="${q.id}">${esc(y)}</button>
        <button class="btn no" data-ans="no" data-t="${esc(n)}" data-q="${q.id}">${esc(n)}</button>
        <button class="btn" data-ans="maybe" data-t="I'm not sure." data-q="${q.id}">I'm not sure.</button>
      </div></div>`;
  }
  $('askForm').hidden = !(m.phase === 'play' && myTurn && !m.pending);

  if (m.phase === 'over' && overShown !== m.id + m.log.length) {
    overShown = m.id + m.log.length;
    const won = m.winner === S.me.id;
    if (!firstState) modal(`${oppC ? cardImg(oppC) : ''}<h2>${won ? 'You guessed it!' : `${esc(opp.name)} guessed your person!`}</h2><p>${oppC ? `${esc(opp.name)}'s person was <b>${esc(oppC.name)}</b>.` : ''}</p>`,
      [{ label: 'Play again', cls: 'coral', fn: () => socket.emit('rematch') }, { label: 'Close' }]);
  }
}
$('boardActions').addEventListener('click', (e) => { if (e.target.closest('[data-act=rematch]')) socket.emit('rematch'); });
$('answerArea').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ans]'); if (!b) return;
  socket.emit('answer', { qid: b.dataset.q, answer: b.dataset.ans, text: b.dataset.t });
});

function renderMonitor() {
  $('status').textContent = 'Teacher view';
  $('boardTitle').textContent = `Matches (${S.monitor.length})`;
  $('boardActions').innerHTML = '';
  $('board').hidden = true; $('chatPanel').hidden = true;
  const v = $('monitorView'); v.hidden = false;
  v.innerHTML = (S.waitingNames?.length ? `<p class="white-hint">Waiting for a partner: ${S.waitingNames.map(esc).join(', ')}</p>` : '') +
    (S.monitor.length ? `<div class="match-list">${S.monitor.map(m => `<div class="mcard">
      <div class="pair">${m.players.map(p => `<div class="p">${p.pick != null ? `<img src="${CHARACTERS[p.pick].img}" alt="${esc(CHARACTERS[p.pick].name)}">` : '<div class="q">?</div>'}<span>${esc(p.name)}${m.winner === p.id ? ' 🏆' : ''}</span></div>`).join('')}</div>
      <span class="pill">${m.phase === 'choose' ? 'Choosing people' : m.phase === 'play' ? 'Playing' : 'Finished'}</span>
      <ol>${m.log.filter(e => e.type !== 'sys').map(e => `<li><b>${esc(S.players.find(p => p.id === e.from)?.name || '')}:</b> ${esc(e.text || e.answer)}</li>`).join('') || '<li>No questions yet.</li>'}</ol>
    </div>`).join('')}</div>` : '<p class="white-hint">No matches yet. Players need a partner to start.</p>');
  $('sideInfo').innerHTML = `<div class="panel"><h3>You are the teacher</h3><p class="hint">You can see every pair, their secret people and the questions they ask. Use “New pairs” to mix the class.</p>
    <p class="hint">Players: ${S.players.filter(p => p.id !== S.hostId).length}</p></div>`;
}

/* ---------- group ---------- */
function renderGroup() {
  renderChips(true);
  const G = S.group;
  const guesser = S.me.role === 'guesser';
  const log = G.log;

  // popups for my wins / misses
  for (const e of log) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (firstState || e.from !== S.me.id) continue;
    if (e.type === 'win') { const c = CHARACTERS[e.charId]; modal(`${cardImg(c)}<h2>You guessed it!</h2><p>You were <b>${esc(c.name)}</b>. You get a new mystery person now.</p>`, [{ label: 'Next person', cls: 'coral' }]); }
    if (e.type === 'miss') toast('Wrong guess. Keep asking!', 'error');
  }

  if (guesser) {
    $('status').innerHTML = '<span class="pill turn">Guesser</span> Ask questions about yourself';
    $('boardTitle').textContent = 'Who are you? Tap to turn people down';
    $('boardActions').innerHTML = `<button class="btn small" data-act="reset">Turn all up</button><button class="btn small" data-act="skip">Give up</button><button class="btn small ${guessMode ? 'sun' : 'coral'}" data-act="guess">${guessMode ? 'Cancel guess' : 'Make a guess'}</button>`;
    renderBoard({ clickable: true });
    $('sideInfo').innerHTML = `<div class="panel"><div class="secret"><div class="face mystery">?</div><div><span class="eyebrow">Your mystery person</span><h3>Who am I?</h3><p class="desc">Ask yes/no questions: “Do I have glasses?” “Am I wearing a hat?”</p></div></div>
      <div class="vs"><span class="pill mint">Points: ${S.me.score}</span>${G.guessers.filter(g => g.id !== S.me.id).map(g => `<span class="pill">${esc(g.name)}: ${g.score}</span>`).join('')}</div></div>`;
    const mine = log.filter(e => e.from === S.me.id || e.type === 'win' || e.type === 'sys');
    renderLog(mine.map(e => e.type === 'q' ? { cls: 'me', who: 'You asked', text: e.text, id: e.id, answers: e.answers } : { cls: e.type, text: e.text, id: e.id }));
  } else {
    guessMode = false;
    $('status').innerHTML = '<span class="pill">Describer</span> Look at the guessers\' people and answer their questions';
    $('boardTitle').textContent = 'The guessers and their people';
    $('boardActions').innerHTML = '';
    $('board').hidden = true;
    const v = $('helperView'); v.hidden = false;
    v.innerHTML = G.guessers.length ? `<div class="guesser-grid">${G.guessers.map(g => {
      const c = g.secret != null ? CHARACTERS[g.secret] : null;
      return `<div class="gcard">${c ? cardImg(c) : ''}<div style="min-width:0"><b>${esc(g.name)}</b><span class="pill mint">Points: ${g.score}</span>${c ? `<p class="desc"><b style="font-size:1rem;display:inline">${esc(c.name)}.</b> ${esc(describe(c))}</p>` : ''}</div></div>`;
    }).join('')}</div>` : '<p class="white-hint">There are no guessers yet. The host can change roles in the lobby.</p>';
    $('sideInfo').innerHTML = `<div class="panel"><h3>You are a describer</h3><p class="hint">Answer each question with a full short answer. Don't say the name!</p></div>`;
    $('askForm').hidden = true;
    renderLog(log.map(e => e.type === 'q'
      ? { cls: '', who: `${e.fromName} asks`, text: e.text, id: e.id, answers: e.answers, answerable: true, from: e.from }
      : { cls: e.type, text: e.text, id: e.id }));
  }
}
$('log').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gans]'); if (!b) return;
  socket.emit('answer', { qid: b.dataset.q, answer: b.dataset.gans, text: b.dataset.t });
});

/* ---------- log ---------- */
function renderLog(items) {
  const el = $('log');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const prevCount = el.children.length;
  if (!items.length) { el.innerHTML = '<li class="empty">No questions yet.</li>'; return; }
  el.innerHTML = items.map(it => {
    let extra = '';
    if (it.answers) {
      extra += it.answers.length ? `<div class="answers">${it.answers.map(a => `<span class="ans ${a.answer}">${esc(a.by === S.me.id ? 'You' : a.name)}: ${esc(a.text || a.answer)}</span>`).join('')}</div>` : (it.answerable ? '' : '<div class="answers"><span class="ans">Waiting for an answer…</span></div>');
    }
    if (it.answerable && it.from !== S.me.id) {
      const [y, n] = shortAnswers(it.text, 'you');
      extra += `<div class="qbtns"><button class="btn small mint" data-gans="yes" data-t="${esc(y)}" data-q="${it.id}">${esc(y)}</button><button class="btn small no" data-gans="no" data-t="${esc(n)}" data-q="${it.id}">${esc(n)}</button><button class="btn small" data-gans="maybe" data-t="I'm not sure." data-q="${it.id}">Not sure</button></div>`;
    }
    return `<li class="${it.cls}">${it.who ? `<span class="who">${esc(it.who)}</span>` : ''}${esc(it.text)}${extra}</li>`;
  }).join('');
  if (atBottom || items.length !== prevCount) el.scrollTop = el.scrollHeight;
}
