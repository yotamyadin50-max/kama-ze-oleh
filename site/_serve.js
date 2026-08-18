const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const port = 8443;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---------- VS Duel: real-time matchmaking + duel state (in-memory, dependency-free SSE) ----------
// GeoGuessr Duels adapted: both players start at 6000 HP (real, cited number),
// 5 rounds, 15s per guess, damage = closeness gap * round multiplier, no fake bots ever.
const START_HP = 6000;
const ROUNDS_PER_DUEL = 5;
const GUESS_SECONDS = 15;
const ROUND_MULTIPLIERS = [1, 1.2, 1.5, 2, 3];

const queue = []; // [{playerId, playerName}]
const duels = new Map(); // duelId -> duel state
const sseClients = new Map(); // playerId -> res
const products = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8'));

function sendEvent(playerId, event, data) {
  const res = sseClients.get(playerId);
  if (!res) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function pickRandomProduct() {
  return products[Math.floor(Math.random() * products.length)];
}

function startRound(duel) {
  duel.roundIndex++;
  duel.roundStartedAt = Date.now();
  duel.guesses = {};
  const product = pickRandomProduct();
  duel.currentProduct = product;
  const payload = {
    roundIndex: duel.roundIndex,
    totalRounds: ROUNDS_PER_DUEL,
    seconds: GUESS_SECONDS,
    product: { id: product.id, name: product.name, image: product.image, category: product.category },
    hp: duel.hp
  };
  for (const pid of duel.players) sendEvent(pid, 'round-start', payload);
  duel.timer = setTimeout(() => resolveRound(duel), GUESS_SECONDS * 1000 + 500);
}

function resolveRound(duel) {
  clearTimeout(duel.timer);
  const [p1, p2] = duel.players;
  const actual = duel.currentProduct.price_ils;
  const g1 = duel.guesses[p1];
  const g2 = duel.guesses[p2];
  const closeness = (g) => {
    if (g === undefined || g === null || isNaN(g)) return 0;
    if (actual === 0) return g === 0 ? 1 : 0; // guard: no shipped product is free, but never divide by zero if one ever is
    return Math.max(0, 1 - Math.abs(g - actual) / actual);
  };
  const c1 = closeness(g1);
  const c2 = closeness(g2);
  const mult = ROUND_MULTIPLIERS[Math.min(duel.roundIndex - 1, ROUND_MULTIPLIERS.length - 1)];
  let dmgTo1 = 0, dmgTo2 = 0;
  if (c1 > c2) dmgTo2 = Math.round((c1 - c2) * 2200 * mult);
  else if (c2 > c1) dmgTo1 = Math.round((c2 - c1) * 2200 * mult);
  duel.hp[p1] = Math.max(0, duel.hp[p1] - dmgTo1);
  duel.hp[p2] = Math.max(0, duel.hp[p2] - dmgTo2);

  const resultPayload = {
    roundIndex: duel.roundIndex,
    actual,
    source: duel.currentProduct.source,
    date: duel.currentProduct.date_checked,
    guesses: { [p1]: g1 ?? null, [p2]: g2 ?? null },
    damage: { [p1]: dmgTo1, [p2]: dmgTo2 },
    hp: duel.hp,
    multiplier: mult
  };
  for (const pid of duel.players) sendEvent(pid, 'round-result', resultPayload);

  const someoneDead = duel.hp[p1] <= 0 || duel.hp[p2] <= 0;
  const lastRound = duel.roundIndex >= ROUNDS_PER_DUEL;
  if (someoneDead || lastRound) {
    let winner;
    if (duel.hp[p1] === duel.hp[p2]) winner = null;
    else winner = duel.hp[p1] > duel.hp[p2] ? p1 : p2;
    const endPayload = { winner, hp: duel.hp, names: duel.names };
    for (const pid of duel.players) sendEvent(pid, 'duel-end', endPayload);
    duels.delete(duel.id);
  } else {
    setTimeout(() => startRound(duel), 2500);
  }
}

function tryMatchmake() {
  // Prune entries that joined but whose SSE stream never opened (flaky network, an
  // ad-blocker/proxy blocking SSE, a killed tab) — otherwise a join with no matching
  // stream sits in `queue` forever, growing unboundedly on a long-running server.
  const STALE_MS = 60000;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!sseClients.has(queue[i].playerId) && Date.now() - queue[i].joinedAt > STALE_MS) queue.splice(i, 1);
  }
  // Only match players whose SSE stream is actually open (real, not assumed):
  // a join POST can arrive before that same tab's own SSE GET has finished registering,
  // so filtering here (instead of dropping the other queued player when this fails)
  // is what makes matchmaking eventually-consistent instead of silently losing a player.
  const removeFromQueue = (id) => { const i = queue.findIndex(q => q.playerId === id); if (i !== -1) queue.splice(i, 1); };
  let ready = queue.filter(q => sseClients.has(q.playerId));
  while (ready.length >= 2) {
    const a = ready.shift();
    const b = ready.shift();
    removeFromQueue(a.playerId);
    removeFromQueue(b.playerId);
    const duelId = crypto.randomUUID();
    const duel = {
      id: duelId,
      players: [a.playerId, b.playerId],
      names: { [a.playerId]: a.playerName, [b.playerId]: b.playerName },
      hp: { [a.playerId]: START_HP, [b.playerId]: START_HP },
      roundIndex: 0,
      guesses: {},
      currentProduct: null,
      timer: null
    };
    duels.set(duelId, duel);
    sendEvent(a.playerId, 'matched', { duelId, opponentName: b.playerName, hp: duel.hp, startHp: START_HP });
    sendEvent(b.playerId, 'matched', { duelId, opponentName: a.playerName, hp: duel.hp, startHp: START_HP });
    setTimeout(() => startRound(duel), 1200);
  }
}

function findDuelByPlayer(playerId) {
  for (const duel of duels.values()) if (duel.players.includes(playerId)) return duel;
  return null;
}

function handleLeave(playerId) {
  const qIdx = queue.findIndex(q => q.playerId === playerId);
  if (qIdx !== -1) queue.splice(qIdx, 1);
  const duel = findDuelByPlayer(playerId);
  if (duel) {
    const opponent = duel.players.find(p => p !== playerId);
    if (opponent) sendEvent(opponent, 'opponent-left', {});
    clearTimeout(duel.timer);
    duels.delete(duel.id);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ---------- HTTP server: static files + API ----------
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${port}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/duel/stream') {
    const playerId = urlObj.searchParams.get('playerId');
    if (!playerId) { res.writeHead(400); res.end('missing playerId'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    sseClients.set(playerId, res);
    tryMatchmake(); // this tab's stream is NOW actually open; retry in case it was the missing piece
    const heartbeat = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(playerId);
      handleLeave(playerId);
    });
    return;
  }

  if (pathname === '/api/duel/join' && req.method === 'POST') {
    try {
      const { playerId, playerName } = await readJsonBody(req);
      if (!playerId) return sendJson(res, 400, { error: 'missing playerId' });
      const safeName = (typeof playerName === 'string' && playerName.trim()) ? playerName.trim().slice(0, 40) : 'שחקן';
      if (!queue.find(q => q.playerId === playerId) && !findDuelByPlayer(playerId)) {
        queue.push({ playerId, playerName: safeName, joinedAt: Date.now() });
      }
      tryMatchmake();
      sendJson(res, 200, { status: 'ok' });
    } catch (e) { sendJson(res, 400, { error: 'bad request' }); }
    return;
  }

  if (pathname === '/api/duel/guess' && req.method === 'POST') {
    try {
      const { duelId, playerId, guess } = await readJsonBody(req);
      const duel = duels.get(duelId);
      if (!duel) return sendJson(res, 404, { error: 'duel not found' });
      if (duel.guesses[playerId] !== undefined) return sendJson(res, 200, { status: 'already-guessed' });
      duel.guesses[playerId] = typeof guess === 'number' ? guess : parseFloat(guess);
      const opponent = duel.players.find(p => p !== playerId);
      sendEvent(opponent, 'opponent-guessed', {});
      if (duel.players.every(p => duel.guesses[p] !== undefined)) {
        resolveRound(duel);
      }
      sendJson(res, 200, { status: 'ok' });
    } catch (e) { sendJson(res, 400, { error: 'bad request' }); }
    return;
  }

  if (pathname === '/api/duel/leave' && req.method === 'POST') {
    try {
      const { playerId } = await readJsonBody(req);
      handleLeave(playerId);
      sendJson(res, 200, { status: 'ok' });
    } catch (e) { sendJson(res, 400, { error: 'bad request' }); }
    return;
  }

  // Static files
  let urlPath = decodeURIComponent(pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(port, () => console.log('serving on ' + port));
