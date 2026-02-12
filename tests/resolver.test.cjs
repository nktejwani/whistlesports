const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

function waitForServer(proc, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start in time')), timeout);
    proc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('Server running at')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr.on('data', (c) => {});
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Server exited early: ' + code));
    });
  });
}

let serverProc;

beforeAll(async () => {
  // allow talking to localhost without proxies interfering
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  // allow talking to localhost without proxies interfering
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  // reset DB
  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], bets: [], results: [] }, null, 2));

  serverProc = spawn(process.execPath, ['index.js'], { cwd: path.join(__dirname, '..'), env: process.env });
  serverProc.stdout.setEncoding('utf8');
  serverProc.stderr.setEncoding('utf8');
  await waitForServer(serverProc, 8000);
});

afterAll(() => {
  if (serverProc) serverProc.kill();
});

test('create user, place bet, submit result, resolve deterministically', async () => {
  // create user
  const create = await axios.post(`${BASE}/users`, { username: 'alice', password: 'test1234', favoriteSports: ['nba'], intent: 'competitive' });
  expect(create.data.username).toBe('alice');

  // place bet referencing eventId 'evt-1'
  const betResp = await axios.post(`${BASE}/bets`, {
    username: 'alice', sport: 'nba', eventId: 'evt-1', market: 'h2h', selection: 'Los Angeles Lakers', stake: 1, odds: -110
  });
  expect(betResp.data.bet).toBeDefined();
  const bet = betResp.data.bet;
  expect(bet.outcome).toBe('pending');

  // submit admin result for evt-1
  const adminResp = await axios.post(`${BASE}/admin/results`, {
    id: 'evt-1', sport: 'nba', homeTeam: 'Los Angeles Lakers', awayTeam: 'Miami Heat', homeScore: 110, awayScore: 102
  }, { headers: { Authorization: 'Bearer dev-admin-token' } });
  expect(adminResp.data.result).toBeDefined();

  // mark result as completed so resolver will accept it
  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const r = db.results.find(x => x.id === 'evt-1');
  r.status = 'completed';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  // run resolver
  const res = await axios.post(`${BASE}/resolve-bets`);
  expect(res.data.resolvedCount).toBeGreaterThanOrEqual(1);

  // fetch bets for alice
  const bets = await axios.get(`${BASE}/bets/alice`);
  expect(bets.data.length).toBeGreaterThanOrEqual(1);
  const resolvedBet = bets.data.find(b => b.id === bet.id);
  expect(resolvedBet).toBeDefined();
  expect(['win','loss','push']).toContain(resolvedBet.outcome);
  expect(resolvedBet.outcome).toBe('win');

  // check user tokens updated
  const user = await axios.get(`${BASE}/users/alice`);
  expect(user.data.username).toBe('alice');
  expect(typeof user.data.tokens).toBe('number');
});

test('social auth convenience endpoint does not recurse', async () => {
  const payload = { provider: 'demo', externalId: 'ext-123', username: 'bob' };
  const first = await axios.post(`${BASE}/auth/social`, payload);
  expect(first.data.user).toBeDefined();
  expect(first.data.user.username).toBe('bob');
  expect(first.data.created).toBe(true);

  const second = await axios.post(`${BASE}/auth/social`, payload);
  expect(second.data.user).toBeDefined();
  expect(second.data.user.username).toBe('bob');
  expect(second.data.created).toBe(false);
});
