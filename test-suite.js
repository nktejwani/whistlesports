import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
let passed = 0, failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failed++;
  }
};

const testSuite = async () => {
  console.log('\n=== Whistle App Test Suite ===\n');

  // 1. REGISTRATION & LOGIN
  console.log('--- Authentication ---');
  
  let testUserToken;
  await test('Register new user', async () => {
    const res = await axios.post(`${BASE_URL}/users`, {
      username: 'testuser-' + Date.now(),
      password: 'test123',
      favoriteSports: ['nba'],
      intent: 'competitive'
    });
    if (!res.data.username) throw new Error('No username returned');
    testUserToken = res.data.username;
  });

  await test('Login user', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      username: testUserToken,
      password: 'test123'
    });
    if (!res.data.message) throw new Error('Login failed');
  });

  await test('Get user profile', async () => {
    const res = await axios.get(`${BASE_URL}/users/${testUserToken}`);
    if (!res.data.username) throw new Error('No user data');
    if (res.data.tokens === undefined) throw new Error('No token balance');
  });

  // 2. PASSWORD RESET
  console.log('\n--- Password Reset ---');
  
  let resetToken;
  await test('Request password reset', async () => {
    const res = await axios.post(`${BASE_URL}/auth/forgot-password`, {
      username: testUserToken
    });
    if (!res.data.token) throw new Error('No reset token returned');
    resetToken = res.data.token;
  });

  await test('Reset password with token', async () => {
    const res = await axios.post(`${BASE_URL}/auth/reset-password/${resetToken}`, {
      password: 'newpass456'
    });
    if (!res.data.message.includes('success')) throw new Error('Reset failed');
  });

  await test('Login with new password', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      username: testUserToken,
      password: 'newpass456'
    });
    if (!res.data.message) throw new Error('Login with new password failed');
  });

  // 3. PROFILE EDITING
  console.log('\n--- User Profile ---');
  
  await test('Update user profile', async () => {
    const res = await axios.put(`${BASE_URL}/users/${testUserToken}`, {
      favoriteSports: ['nfl'],
      avatar: 'chiefs',
      intent: 'competitive'
    });
    if (!res.data.user.avatar) throw new Error('Avatar not set');
  });

  await test('Verify profile updated', async () => {
    const res = await axios.get(`${BASE_URL}/users/${testUserToken}`);
    if (res.data.avatar !== 'chiefs') throw new Error('Avatar not persisted');
    if (!res.data.favoriteSports.includes('nfl')) throw new Error('Sport not updated');
  });

  // 4. BETTING
  console.log('\n--- Betting System ---');
  
  let betId;
  await test('Place a bet', async () => {
    const res = await axios.post(`${BASE_URL}/bets`, {
      username: testUserToken,
      sport: 'nba',
      selection: 'Boston Celtics',
      market: 'moneyline',
      stake: 1,
      odds: -110
    });
    if (!res.data.bet.id) throw new Error('No bet ID returned');
    betId = res.data.bet.id;
  });

  await test('Get active bets', async () => {
    const res = await axios.get(`${BASE_URL}/bets/${testUserToken}/active`);
    if (!Array.isArray(res.data)) throw new Error('Not an array');
    if (res.data.length === 0) throw new Error('No active bets found');
  });

  await test('Get all user bets', async () => {
    const res = await axios.get(`${BASE_URL}/bets/${testUserToken}`);
    if (!Array.isArray(res.data)) throw new Error('Not an array');
    if (res.data.length === 0) throw new Error('No bets found');
  });

  // 5. STATS & STREAKS
  console.log('\n--- Stats & Streaks ---');
  
  await test('Get user stats', async () => {
    const res = await axios.get(`${BASE_URL}/users/${testUserToken}/stats`);
    if (res.data.totalResolved === undefined) throw new Error('No stats data');
  });

  await test('Get user streak', async () => {
    const res = await axios.get(`${BASE_URL}/users/${testUserToken}/streak`);
    if (res.data.currentStreak === undefined) throw new Error('No streak data');
  });

  // 6. CONFIG & PAYMENT
  console.log('\n--- Configuration & Payment ---');
  
  await test('Get app config', async () => {
    const res = await axios.get(`${BASE_URL}/config`);
    if (!res.data.stripePublishableKey) throw new Error('Stripe key not in config');
  });

  await test('Create Stripe checkout session', async () => {
    const res = await axios.post(`${BASE_URL}/users/${testUserToken}/premium-checkout`);
    if (!res.data.sessionId) throw new Error('No session ID');
    if (!res.data.url) throw new Error('No checkout URL');
    if (!res.data.url.includes('stripe.com')) throw new Error('Invalid Stripe URL');
  });

  // 7. ERROR HANDLING
  console.log('\n--- Error Handling ---');
  
  await test('Reject invalid registration (short password)', async () => {
    try {
      await axios.post(`${BASE_URL}/users`, {
        username: 'testuser',
        password: 'hi'
      });
      throw new Error('Should have rejected short password');
    } catch (e) {
      if (e.response && e.response.status === 400) return;
      throw e;
    }
  });

  await test('Reject invalid login', async () => {
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        username: testUserToken,
        password: 'wrongpassword'
      });
      throw new Error('Should have rejected wrong password');
    } catch (e) {
      if (e.response && e.response.status === 401) return;
      throw e;
    }
  });

  await test('Reject duplicate username', async () => {
    try {
      await axios.post(`${BASE_URL}/users`, {
        username: testUserToken,
        password: 'test123'
      });
      throw new Error('Should have rejected duplicate username');
    } catch (e) {
      if (e.response && e.response.status === 409) return;
      throw e;
    }
  });

  // 8. EDGE CASES
  console.log('\n--- Edge Cases ---');
  
  await test('Insufficient tokens for bet', async () => {
    try {
      await axios.post(`${BASE_URL}/bets`, {
        username: testUserToken,
        sport: 'nba',
        selection: 'Lakers',
        stake: 9999
      });
      throw new Error('Should have rejected insufficient tokens');
    } catch (e) {
      if (e.response && e.response.status === 400) return;
      throw e;
    }
  });

  await test('Non-existent user profile', async () => {
    try {
      await axios.get(`${BASE_URL}/users/nonexistentuser123`);
      throw new Error('Should have rejected non-existent user');
    } catch (e) {
      if (e.response && e.response.status === 404) return;
      throw e;
    }
  });

  // SUMMARY
  console.log(`\n=== Test Results ===`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);
  
  process.exit(failed > 0 ? 1 : 0);
};

testSuite().catch(e => {
  console.error('Test suite error:', e.message);
  process.exit(1);
});
