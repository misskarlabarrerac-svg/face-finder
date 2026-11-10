/* Face Finder client */
const { CHARACTERS } = window.GW;
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
    ? 'Choose a role. Guessers get a hidden person and ask questions out loud. Describers see it and answer out loud.'
    : 'Tap “Choose” next to your partner\'s name. When you both choose each other, you are a pair. Players without a pair get a random partner when the game starts.';
  $('lobbyTitle').textContent = `Players (${S.players.length})`;
  const byId = Object.fromEntries(S.players.map(p => [p.id, p]));
  const mutual = (p) => p.partner && byId[p.partner]?.partner === p.id;
  const choosing = !group && !(S.isHost && !S.hostPlays);
  $('playerList').innerHTML = S.players.map(p => {
    const isMe = p.id === S.me.id, canEdit = isMe || S.isHost;
    const hostTag = p.id === S.hostId ? ` <span class="pill">${S.hostPlays ? 'host' : 'teacher'}</span>` : '';
    const roles = group ? `<span class="role-toggle">
        <button type="button" data-role="guesser" data-pid="${p.id}" class="${p.role === 'guesser' ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>Guesser</button>
        <button type="button" data-role="helper" data-pid="${p.id}" class="${p.role === 'helper' ? 'on' : ''}" ${canEdit ? '' : 'disabled'}>Describer</button></span>` : '';
    let pair = '';
    const playsClassic = !group && !(p.id === S.hostId && !S.hostPlays);
    if (playsClassic) {
      if (mutual(p)) pair = `<span class="pill mint">with ${esc(byId[p.partner].name)}</span>`;
      else if (choosing && !isMe && !(p.id === S.hostId && !S.hostPlays)) {
        const chosen = S.me.partner === p.id, wantsMe = p.partner === S.me.id;
        pair = `<button type="button" class="btn small ${chosen ? 'sun' : wantsMe ? 'coral' : ''}" data-partner="${chosen ? '' : p.id}">${chosen ? 'Chosen ✓' : wantsMe ? 'Wants you!' : 'Choose'}</button>`;
      } else if (isMe && p.partner) pair = `<span class="pill">waiting for ${esc(byId[p.partner]?.name || '')}</span>`;
    }
    const kick = S.isHost && !isMe ? `<button type="button" class="btn small ghost" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>` : '';
    return `<li class="${p.connected ? '' : 'off'}"><span class="nm">${esc(p.name)}${isMe ? ' (you)' : ''}${hostTag}</span><span class="role-toggle">${roles}${pair}${kick}</span></li>`;
  }).join('');
  $('startBtn').hidden = !S.isHost;
  $('lobbyWait').textContent = S.isHost ? 'Start when everyone has joined.' : 'Waiting for the host to start the game…';
}
$('playerList').addEventListener('click', (e) => {
  const r = e.target.closest('[data-role]'); if (r && !r.disabled) socket.emit('setRole', { playerId: r.dataset.pid, role: r.dataset.role });
  const k = e.target.closest('[data-kick]'); if (k) socket.emit('kick', { playerId: k.dataset.kick });
  const pt = e.target.closest('[data-partner]'); if (pt) socket.emit('choosePartner', { playerId: pt.dataset.partner || null });
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
    return modal(`${cardImg(c)}<h2>${esc(c.name)}</h2><p>Choose ${esc(c.name)} as your secret person?</p>`,
      [{ label: 'Yes, choose', cls: 'coral', fn: () => socket.emit('pick', { charId: c.id }) }, { label: 'Cancel' }]);
  }
  if (guessMode) {
    return modal(`${cardImg(c)}<h2>Is it ${esc(c.name)}?</h2><p>Make your final guess.</p>`,
      [{ label: `Guess ${c.name}`, cls: 'coral', fn: () => { guessMode = false; socket.emit('guess', { charId: c.id }); render(); } }, { label: 'Cancel' }]);
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
  if (a === 'rematch') socket.emit('rematch');
});

function renderGame() {
  $('gameCode').textContent = S.code;
  $('hostTools').innerHTML = hostTools();
  $('helperView').hidden = true; $('monitorView').hidden = true; $('board').hidden = false; $('chatPanel').hidden = false;
  if (S.mode === 'classic') renderClassic(); else renderGroup();
}

function popups(log) {
  for (const e of log) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (firstState) continue;
    const mine = e.from === S.me.id;
    if (e.type === 'miss') toast(mine ? 'Wrong guess. Keep asking!' : e.text, 'error');
    if (e.type === 'win' && S.mode === 'group' && mine) {
      const c = CHARACTERS[e.charId];
      modal(`${cardImg(c)}<h2>You guessed it!</h2><p>You were <b>${esc(c.name)}</b>. Here comes a new mystery person.</p>`, [{ label: 'Next person', cls: 'coral' }]);
    }
  }
}

const activity = (log) => log.map(e => ({ cls: e.type === 'q' || e.type === 'a' ? 'sys' : e.type, text: e.text || '' })).filter(e => e.text);

/* ---------- classic ---------- */
function renderClassic() {
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
  popups(m.log);
  const opp = m.opponent;
  const mine = m.myPick != null ? CHARACTERS[m.myPick] : null;
  if (m.phase !== 'play') guessMode = false;
  if (m.phase === 'choose') {
    $('status').textContent = m.myPick == null ? 'Choose your secret person' : `Waiting for ${opp.name} to choose…`;
    $('boardTitle').textContent = m.myPick == null ? 'Tap a person to choose' : 'Your board';
    $('boardActions').innerHTML = '';
  } else if (m.phase === 'play') {
    $('status').innerHTML = `Ask <b>${esc(opp.name)}</b> questions out loud. Flip down the people it can't be.`;
    $('boardTitle').textContent = 'Tap to flip people down';
    $('boardActions').innerHTML = `<button class="btn small" data-act="reset">Flip all up</button><button class="btn small ${guessMode ? 'sun' : 'coral'}" data-act="guess">${guessMode ? 'Cancel guess' : 'Make a guess'}</button>`;
  } else {
    $('status').textContent = m.winner === S.me.id ? 'You won!' : `${opp.name} won this game`;
    $('boardActions').innerHTML = `<button class="btn small coral" data-act="rematch">Play again</button><button class="btn small" data-act="partner">New partner</button>`;
  }
  renderBoard({ clickable: m.phase !== 'over' && !(m.phase === 'choose' && m.myPick != null), highlight: m.myPick });

  const oppC = m.oppPick != null ? CHARACTERS[m.oppPick] : null;
  $('sideInfo').innerHTML = `<div class="panel">
    <div class="secret">
      <div class="face ${mine ? '' : 'mystery'}">${mine ? cardImg(mine) : '?'}</div>
      <div><span class="eyebrow">Your secret person</span><h3>${mine ? esc(mine.name) : 'Not chosen yet'}</h3>
      <p class="hint">Answer your partner's questions about this person.</p></div>
    </div>
    <div class="vs"><span class="pill">Partner: ${esc(opp.name)}${opp.connected ? '' : ' (offline)'}</span><span class="pill">${m.oppPicked ? 'Partner is ready' : 'Partner is choosing'}</span><span class="pill mint">Your wins: ${S.me.score}</span></div>
    ${oppC ? `<div class="secret"><div class="face">${cardImg(oppC)}</div><div><span class="eyebrow">${esc(opp.name)}'s person</span><h3>${esc(oppC.name)}</h3></div></div>` : ''}
  </div>`;
  renderLog(activity(m.log));

  if (m.phase === 'over' && overShown !== m.id + m.log.length) {
    overShown = m.id + m.log.length;
    const won = m.winner === S.me.id;
    if (!firstState) modal(`${oppC ? cardImg(oppC) : ''}<h2>${won ? 'You guessed it!' : `${esc(opp.name)} guessed your person!`}</h2><p>${oppC ? `${esc(opp.name)}'s person was <b>${esc(oppC.name)}</b>.` : ''}</p>`,
      [{ label: 'Play again', cls: 'coral', fn: () => socket.emit('rematch') }, { label: 'Close' }]);
  }
}

function renderMonitor() {
  $('status').textContent = 'Teacher view';
  $('boardTitle').textContent = `Pairs (${S.monitor.length})`;
  $('boardActions').innerHTML = '';
  $('board').hidden = true; $('chatPanel').hidden = true;
  const v = $('monitorView'); v.hidden = false;
  v.innerHTML = (S.waitingNames?.length ? `<p class="white-hint">Waiting for a partner: ${S.waitingNames.map(esc).join(', ')}</p>` : '') +
    (S.monitor.length ? `<div class="match-list">${S.monitor.map(m => `<div class="mcard">
      <div class="pair">${m.players.map(p => `<div class="p">${p.pick != null ? `<img src="${CHARACTERS[p.pick].img}" alt="${esc(CHARACTERS[p.pick].name)}">` : '<div class="q">?</div>'}<span>${esc(p.name)}${m.winner === p.id ? ' (won)' : ''}</span></div>`).join('')}</div>
      <span class="pill">${m.phase === 'choose' ? 'Choosing people' : m.phase === 'play' ? 'Playing' : 'Finished'}</span>
      <ol>${m.log.filter(e => e.type === 'win' || e.type === 'miss').map(e => `<li>${esc(e.text)}</li>`).join('') || '<li>No guesses yet.</li>'}</ol>
    </div>`).join('')}</div>` : '<p class="white-hint">No pairs yet. Players need a partner to start.</p>');
  $('sideInfo').innerHTML = `<div class="panel"><h3>You are the teacher</h3><p class="hint">You can see every pair, their secret people and their guesses. Use “New pairs” to mix the class.</p>
    <p class="hint">Players: ${S.players.filter(p => p.id !== S.hostId).length}</p></div>`;
}

/* ---------- group ---------- */
function renderGroup() {
  const G = S.group;
  const guesser = S.me.role === 'guesser';
  popups(G.log);
  const events = G.log.filter(e => e.type !== 'q');
  if (guesser) {
    $('status').innerHTML = '<span class="pill turn">Guesser</span> Ask the describers out loud: “Do I have…?” “Am I…?”';
    $('boardTitle').textContent = 'Who are you? Tap to flip people down';
    $('boardActions').innerHTML = `<button class="btn small" data-act="reset">Flip all up</button><button class="btn small" data-act="skip">Give up</button><button class="btn small ${guessMode ? 'sun' : 'coral'}" data-act="guess">${guessMode ? 'Cancel guess' : 'Make a guess'}</button>`;
    renderBoard({ clickable: true });
    $('sideInfo').innerHTML = `<div class="panel"><div class="secret"><div class="face mystery">?</div><div><span class="eyebrow">Your mystery person</span><h3>Who am I?</h3></div></div>
      <div class="vs"><span class="pill mint">Points: ${S.me.score}</span>${G.guessers.filter(g => g.id !== S.me.id).map(g => `<span class="pill">${esc(g.name)}: ${g.score}</span>`).join('')}</div></div>`;
  } else {
    guessMode = false;
    $('status').innerHTML = '<span class="pill">Describer</span> Answer the guessers out loud. Don\'t say the name!';
    $('boardTitle').textContent = 'The guessers and their people';
    $('boardActions').innerHTML = '';
    $('board').hidden = true;
    const v = $('helperView'); v.hidden = false;
    v.innerHTML = G.guessers.length ? `<div class="guesser-grid">${G.guessers.map(g => {
      const c = g.secret != null ? CHARACTERS[g.secret] : null;
      return `<div class="gcard">${c ? cardImg(c) : ''}<div style="min-width:0"><span class="eyebrow">Guesser</span><b>${esc(g.name)}</b><span class="pill mint">Points: ${g.score}</span></div></div>`;
    }).join('')}</div>` : '<p class="white-hint">There are no guessers yet. The host can change roles in the lobby.</p>';
    $('sideInfo').innerHTML = `<div class="panel"><h3>You are a describer</h3><p class="hint">Look at each guesser's person and answer their questions out loud.</p></div>`;
  }
  renderLog(activity(events));
}

/* ---------- activity ---------- */
function renderLog(items) {
  const el = $('log');
  if (!items.length) { el.innerHTML = '<li class="empty">Nothing yet.</li>'; return; }
  el.innerHTML = items.map(it => `<li class="${it.cls}">${esc(it.text)}</li>`).join('');
  el.scrollTop = el.scrollHeight;
}
