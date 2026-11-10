const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { CHARACTERS } = require('./public/characters.js');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> room
const N = CHARACTERS.length;
const rid = () => Math.random().toString(36).slice(2, 10);
const clean = (s, max = 160) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const randChar = (except) => { let c; do { c = Math.floor(Math.random() * N); } while (c === except && N > 1); return c; };
const validChar = (c) => Number.isInteger(c) && c >= 0 && c < N;

function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms.has(code));
  return code;
}

/* ---------- room model ----------
room = { code, mode: 'classic'|'group', phase: 'lobby'|'playing', hostId, hostPlays,
         players: Map(id -> {id, token, name, role, score, socketId, connected, flipped:Set}),
         matches: Map(id -> match), waiting: [], group: {secrets: {}, log: []}, touched }
*/

function makeMatch(room, a, b) {
  const m = { id: rid(), players: [a, b], picks: {}, phase: 'choose', turn: null, pending: null, log: [], winner: null };
  room.matches.set(m.id, m);
  for (const pid of [a, b]) { const p = room.players.get(pid); p.matchId = m.id; p.flipped = new Set(); }
  return m;
}

function pairWaiting(room) {
  room.waiting = room.waiting.filter(id => { const p = room.players.get(id); return p && !p.matchId; });
  while (room.waiting.length >= 2) {
    const a = room.waiting.shift(), b = room.waiting.shift();
    makeMatch(room, a, b);
  }
}

function classicPlayers(room) {
  return [...room.players.values()].filter(p => room.hostPlays || p.id !== room.hostId);
}

function startClassic(room) {
  room.matches.clear(); room.waiting = [];
  const ps = classicPlayers(room).map(p => p.id).sort(() => Math.random() - .5);
  for (const id of ps) { room.players.get(id).matchId = null; room.waiting.push(id); }
  pairWaiting(room);
}

function leaveMatch(room, pid, requeueOther = true) {
  const p = room.players.get(pid);
  if (!p || !p.matchId) return;
  const m = room.matches.get(p.matchId);
  p.matchId = null;
  if (m) {
    room.matches.delete(m.id);
    const other = m.players.find(x => x !== pid);
    const op = room.players.get(other);
    if (op) { op.matchId = null; op.notice = `${p.name} left the match. Waiting for a new partner…`; if (requeueOther) room.waiting.push(other); }
  }
}

function assignGroupSecret(room, pid) {
  room.group.secrets[pid] = randChar(room.group.secrets[pid]);
  const p = room.players.get(pid); if (p) p.flipped = new Set();
}

function startGroup(room) {
  room.group = { secrets: {}, log: [] };
  for (const p of room.players.values()) if (p.role === 'guesser') assignGroupSecret(room, p.id);
}

function pushLog(arr, entry) { arr.push(Object.assign({ id: rid(), t: Date.now() }, entry)); if (arr.length > 200) arr.shift(); }

/* ---------- per-player view ---------- */
function view(room, me) {
  const pub = p => ({ id: p.id, name: p.name, role: p.role, score: p.score, connected: p.connected, matchId: p.matchId || null });
  const v = {
    code: room.code, mode: room.mode, phase: room.phase, hostId: room.hostId, hostPlays: room.hostPlays,
    me: pub(me), isHost: me.id === room.hostId, players: [...room.players.values()].map(pub),
    flipped: [...(me.flipped || [])], notice: me.notice || null,
  };
  if (room.mode === 'classic' && room.phase === 'playing') {
    const m = me.matchId && room.matches.get(me.matchId);
    if (m) {
      const oid = m.players.find(x => x !== me.id);
      v.match = {
        id: m.id, phase: m.phase, turn: m.turn, pending: m.pending, log: m.log, winner: m.winner,
        opponent: pub(room.players.get(oid)), myPick: m.picks[me.id] ?? null, oppPicked: m.picks[oid] != null,
        oppPick: m.phase === 'over' ? m.picks[oid] : null,
      };
    } else v.waiting = true;
    if (me.id === room.hostId && !room.hostPlays) {
      v.monitor = [...room.matches.values()].map(m => ({
        id: m.id, phase: m.phase, winner: m.winner,
        players: m.players.map(id => ({ id, name: room.players.get(id)?.name, pick: m.picks[id] ?? null })),
        log: m.log.slice(-12),
      }));
      v.waitingNames = room.waiting.map(id => room.players.get(id)?.name);
    }
  }
  if (room.mode === 'group' && room.phase === 'playing') {
    v.group = {
      log: room.group.log,
      guessers: [...room.players.values()].filter(p => p.role === 'guesser').map(p => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected,
        secret: p.id === me.id ? null : room.group.secrets[p.id] ?? null,
      })),
    };
  }
  return v;
}

function broadcast(room) {
  room.touched = Date.now();
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('state', view(room, p));
  }
}

/* ---------- sockets ---------- */
io.on('connection', socket => {
  let room = null, me = null;
  const err = msg => socket.emit('toast', { kind: 'error', text: msg });

  function attach(r, p) {
    room = r; me = p;
    p.socketId = socket.id; p.connected = true;
    socket.emit('joined', { code: r.code, token: p.token });
    broadcast(r);
  }

  socket.on('create', ({ name, mode, hostPlays }) => {
    name = clean(name, 24);
    if (!name) return err('Write your name first.');
    const r = { code: newCode(), mode: mode === 'group' ? 'group' : 'classic', phase: 'lobby', hostPlays: hostPlays !== false,
      players: new Map(), matches: new Map(), waiting: [], group: { secrets: {}, log: [] }, touched: Date.now() };
    const p = { id: rid(), token: rid() + rid(), name, role: r.hostPlays ? 'guesser' : 'helper', score: 0, flipped: new Set() };
    r.hostId = p.id; r.players.set(p.id, p); rooms.set(r.code, r);
    attach(r, p);
  });

  socket.on('join', ({ code, name, token }) => {
    const r = rooms.get(clean(code, 8).toUpperCase());
    if (!r) return socket.emit('joinError', 'That game code does not exist. Check it and try again.');
    if (token) {
      const existing = [...r.players.values()].find(p => p.token === token);
      if (existing) return attach(r, existing);
    }
    name = clean(name, 24);
    if (!name) return socket.emit('joinError', 'Write your name first.');
    if ([...r.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) name = name + ' ' + (r.players.size + 1);
    if (r.players.size >= 60) return socket.emit('joinError', 'This game is full.');
    const p = { id: rid(), token: rid() + rid(), name, role: 'helper', score: 0, flipped: new Set() };
    if (r.mode === 'group' && r.players.size === 1 && !r.hostPlays) p.role = 'guesser';
    r.players.set(p.id, p);
    if (r.phase === 'playing' && r.mode === 'classic') { r.waiting.push(p.id); pairWaiting(r); }
    attach(r, p);
  });

  const guard = (fn) => (...args) => { if (!room || !me) return; try { fn(...args); } catch (e) { console.error(e); } broadcast(room); };
  const isHost = () => me.id === room.hostId;

  socket.on('setRole', guard(({ playerId, role }) => {
    const target = room.players.get(playerId || me.id);
    if (!target || (target.id !== me.id && !isHost())) return;
    target.role = role === 'guesser' ? 'guesser' : 'helper';
    if (room.mode === 'group' && room.phase === 'playing') {
      if (target.role === 'guesser') assignGroupSecret(room, target.id); else delete room.group.secrets[target.id];
    }
  }));

  socket.on('start', guard(() => {
    if (!isHost()) return;
    const players = [...room.players.values()];
    if (room.mode === 'classic') {
      if (classicPlayers(room).length < 2) return err('You need at least 2 players.');
      room.phase = 'playing'; startClassic(room);
    } else {
      const g = players.filter(p => p.role === 'guesser').length, h = players.filter(p => p.role === 'helper').length;
      if (!g || !h) return err('You need at least 1 guesser and 1 describer.');
      room.phase = 'playing'; startGroup(room);
    }
    for (const p of players) p.notice = null;
  }));

  socket.on('lobby', guard(() => {
    if (!isHost()) return;
    room.phase = 'lobby'; room.matches.clear(); room.waiting = [];
    for (const p of room.players.values()) { p.matchId = null; p.flipped = new Set(); p.notice = null; }
  }));

  socket.on('kick', guard(({ playerId }) => {
    if (!isHost() || playerId === me.id) return;
    leaveMatch(room, playerId); room.players.delete(playerId); delete room.group.secrets[playerId];
    pairWaiting(room);
  }));

  socket.on('flip', guard(({ charId }) => {
    if (!validChar(charId)) return;
    me.flipped = me.flipped || new Set();
    me.flipped.has(charId) ? me.flipped.delete(charId) : me.flipped.add(charId);
  }));
  socket.on('resetFlips', guard(() => { me.flipped = new Set(); }));

  /* classic */
  const myMatch = () => me.matchId && room.matches.get(me.matchId);
  const other = m => m.players.find(x => x !== me.id);

  socket.on('pick', guard(({ charId }) => {
    const m = myMatch(); if (!m || m.phase !== 'choose' || !validChar(charId)) return;
    m.picks[me.id] = charId;
    if (m.players.every(id => m.picks[id] != null)) {
      m.phase = 'play'; m.turn = m.players[Math.floor(Math.random() * 2)];
      pushLog(m.log, { type: 'sys', text: `Both players are ready. ${room.players.get(m.turn).name} asks first.` });
    }
  }));

  socket.on('ask', guard(({ text }) => {
    text = clean(text); if (!text) return;
    if (room.mode === 'group') {
      if (me.role !== 'guesser') return;
      pushLog(room.group.log, { type: 'q', from: me.id, fromName: me.name, text, answers: [] });
      return;
    }
    const m = myMatch(); if (!m || m.phase !== 'play' || m.turn !== me.id || m.pending) return;
    const e = { type: 'q', from: me.id, text }; pushLog(m.log, e); m.pending = m.log.at(-1).id;
  }));

  socket.on('answer', guard(({ qid, answer, text }) => {
    answer = ['yes', 'no', 'maybe'].includes(answer) ? answer : null;
    text = clean(text, 120);
    if (!answer && !text) return;
    if (room.mode === 'group') {
      const q = room.group.log.find(x => x.id === qid && x.type === 'q');
      if (!q || q.from === me.id || me.role === 'guesser' && !isHost()) return;
      q.answers = q.answers.filter(a => a.by !== me.id);
      q.answers.push({ by: me.id, name: me.name, answer, text });
      return;
    }
    const m = myMatch(); if (!m || m.pending !== qid || m.turn === me.id) return;
    pushLog(m.log, { type: 'a', from: me.id, answer, text, q: qid });
    m.pending = null; m.turn = me.id;
  }));

  socket.on('guess', guard(({ charId }) => {
    if (!validChar(charId)) return;
    const name = CHARACTERS[charId].name;
    if (room.mode === 'group') {
      if (me.role !== 'guesser') return;
      const secret = room.group.secrets[me.id];
      if (secret === charId) {
        me.score++;
        pushLog(room.group.log, { type: 'win', from: me.id, fromName: me.name, text: `${me.name} guessed it! The character was ${name}.`, charId });
        assignGroupSecret(room, me.id);
      } else pushLog(room.group.log, { type: 'miss', from: me.id, fromName: me.name, text: `${me.name} guessed ${name}. Wrong!`, charId });
      return;
    }
    const m = myMatch(); if (!m || m.phase !== 'play' || m.turn !== me.id || m.pending) return;
    const o = other(m);
    if (m.picks[o] === charId) {
      m.phase = 'over'; m.winner = me.id; me.score++;
      pushLog(m.log, { type: 'win', from: me.id, text: `${me.name} guessed ${name}. Correct!` });
    } else {
      pushLog(m.log, { type: 'miss', from: me.id, text: `${me.name} guessed ${name}. Wrong! Turn passes.` });
      m.turn = o;
    }
  }));

  socket.on('pass', guard(() => {
    const m = myMatch(); if (!m || m.phase !== 'play' || m.turn !== me.id || m.pending) return;
    m.turn = other(m);
    pushLog(m.log, { type: 'sys', text: `${me.name} passed the turn.` });
  }));

  socket.on('rematch', guard(() => {
    const m = myMatch(); if (!m || m.phase !== 'over') return;
    m.picks = {}; m.phase = 'choose'; m.turn = null; m.pending = null; m.winner = null;
    pushLog(m.log, { type: 'sys', text: `New game! Choose a new secret character.` });
    for (const id of m.players) room.players.get(id).flipped = new Set();
  }));

  socket.on('newPartner', guard(() => {
    if (room.mode !== 'classic' || room.phase !== 'playing') return;
    leaveMatch(room, me.id); room.waiting.push(me.id); me.notice = null; pairWaiting(room);
  }));

  socket.on('reshuffle', guard(() => { if (isHost() && room.mode === 'classic') startClassic(room); }));
  socket.on('newRound', guard(() => { if (isHost() && room.mode === 'group') startGroup(room); }));
  socket.on('skip', guard(() => {
    if (room.mode !== 'group' || me.role !== 'guesser') return;
    const old = room.group.secrets[me.id];
    pushLog(room.group.log, { type: 'sys', text: `${me.name} gave up. The character was ${CHARACTERS[old]?.name}.` });
    assignGroupSecret(room, me.id);
  }));

  socket.on('disconnect', () => {
    if (!room || !me || me.socketId !== socket.id) return;
    me.connected = false; me.socketId = null;
    broadcast(room);
  });
});

// remove rooms idle for 6 hours
setInterval(() => { const cut = Date.now() - 6 * 3600e3; for (const [k, r] of rooms) if (r.touched < cut) rooms.delete(k); }, 600e3);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Guess Who running on http://localhost:${PORT}`));
