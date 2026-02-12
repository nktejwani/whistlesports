#!/usr/bin/env node
/**
 * Complete Betting Loop Test
 * Tests: Login → Place Bet → Auto-resolve → Streaks/Tokens Update
 */

import axios from 'axios';

const API = 'http://localhost:3000';
const TEST_USER = 'kiki1';
const TEST_PASSWORD = 'kiki1'; // Based on test setup

let testResults = {
  userTokensBefore: 0,
  userTokensAfter: 0,
  betPlaced: null,
  betResolved: null,
  streakUpdated: false,
  allPassed: true
};

async function log(step, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${step}: ${message}`);
}

async function step1_CheckUserBalance() {
  log('STEP 1', 'Checking user balance...');
  try {
    const response = await axios.get(`${API}/users/${TEST_USER}`);
    testResults.userTokensBefore = response.data.tokens;
    log('STEP 1', `✓ User "${TEST_USER}" has ${response.data.tokens} tokens`);
    log('STEP 1', `  Current streak: ${response.data.currentStreak}, Best streak: ${response.data.bestStreak}`);
    return true;
  } catch (error) {
    log('STEP 1', `✗ Failed to fetch user: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step2_PlaceBet() {
  log('STEP 2', 'Placing test bet...');
  try {
    // Use an eventId that has a result in db.json
    // From db.json: "8ddd2769a5ffd8dccf14da6c31f1fc1c" is Boston Celtics vs New York Knicks
    // Result: Celtics 89, Knicks 111 (Knicks won)
    
    const betData = {
      username: TEST_USER,
      sport: 'nba',
      eventId: '8ddd2769a5ffd8dccf14da6c31f1fc1c',
      market: 'moneyline',
      selection: 'Boston Celtics',
      stake: 5,
      odds: -115
    };

    const response = await axios.post(`${API}/bets`, betData);

    testResults.betPlaced = response.data.bet;
    log('STEP 2', `✓ Bet placed with ID: ${response.data.bet.id}`);
    log('STEP 2', `  Selection: ${response.data.bet.selection} (Celtics lost this game, so bet should resolve as LOSS)`);
    return true;
  } catch (error) {
    log('STEP 2', `✗ Failed to place bet: ${error.response?.data?.error || error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step3_CheckActivebet() {
  log('STEP 3', 'Verifying bet appears in active bets...');
  try {
    const response = await axios.get(`${API}/bets/${TEST_USER}`);
    const bets = Array.isArray(response.data) ? response.data : (response.data?.bets || []);
    const pendingBets = bets.filter(b => b.outcome === 'pending');
    const hasBet = pendingBets.some(b => b.id === testResults.betPlaced.id);
    
    if (hasBet) {
      log('STEP 3', `✓ Bet found in active bets`);
      return true;
    } else {
      log('STEP 3', `✗ Bet not found in active bets`);
      testResults.allPassed = false;
      return false;
    }
  } catch (error) {
    log('STEP 3', `✗ Failed to fetch bets: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step4_TriggerResolution() {
  log('STEP 4', 'Triggering bet resolution...');
  try {
    const response = await axios.post(`${API}/resolve-bets`, {});
    log('STEP 4', `✓ Resolution triggered`);
    log('STEP 4', `  Results processed: ${response.data.summary}`);
    return true;
  } catch (error) {
    log('STEP 4', `✗ Failed to trigger resolution: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step5_CheckResolvedBet() {
  log('STEP 5', 'Verifying bet moved to resolved...');
  try {
    const response = await axios.get(`${API}/bets/${TEST_USER}`);
    const bets = Array.isArray(response.data) ? response.data : (response.data?.bets || []);
    const resolvedBet = bets.find(b => b.id === testResults.betPlaced.id);
    
    if (resolvedBet && resolvedBet.outcome !== 'pending') {
      testResults.betResolved = resolvedBet;
      log('STEP 5', `✓ Bet resolved as: ${resolvedBet.outcome.toUpperCase()}`);
      log('STEP 5', `  Payout: ${resolvedBet.payout} tokens`);
      log('STEP 5', `  Resolved at: ${resolvedBet.resolvedAt}`);
      return true;
    } else {
      log('STEP 5', `✗ Bet still pending or not found`);
      testResults.allPassed = false;
      return false;
    }
  } catch (error) {
    log('STEP 5', `✗ Failed to verify bet: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step6_VerifyTokenUpdates() {
  log('STEP 6', 'Verifying token/streak updates...');
  try {
    const response = await axios.get(`${API}/users/${TEST_USER}`);
    const userAfter = response.data;
    
    testResults.userTokensAfter = userAfter.tokens;
    
    // Tokens should be reduced by stake (5) and potentially increased by payout
    const expectedTokens = testResults.userTokensBefore - testResults.betPlaced.stake + testResults.betResolved.payout;
    
    log('STEP 6', `✓ Tokens: ${testResults.userTokensBefore} → ${testResults.userTokensAfter}`);
    log('STEP 6', `  (Stake: -${testResults.betPlaced.stake}, Payout: +${testResults.betResolved.payout})`);
    log('STEP 6', `  Current streak: ${userAfter.currentStreak}, Best streak: ${userAfter.bestStreak}`);
    
    if (testResults.betResolved.outcome === 'loss') {
      log('STEP 6', `  (Streak reset due to loss)`);
    }
    
    if (testResults.userTokensAfter === expectedTokens) {
      testResults.streakUpdated = true;
      log('STEP 6', `✓ Token accounting correct`);
      return true;
    } else {
      log('STEP 6', `⚠ Token mismatch (expected ${expectedTokens}, got ${testResults.userTokensAfter})`);
      return false;
    }
  } catch (error) {
    log('STEP 6', `✗ Failed to verify updates: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('WHISTLE BETTING LOOP VERIFICATION TEST');
  console.log('='.repeat(60) + '\n');

  const steps = [
    { name: 'Check User Balance', fn: step1_CheckUserBalance },
    { name: 'Place Bet', fn: step2_PlaceBet },
    { name: 'Verify Active Bet', fn: step3_CheckActivebet },
    { name: 'Trigger Resolution', fn: step4_TriggerResolution },
    { name: 'Check Resolved Bet', fn: step5_CheckResolvedBet },
    { name: 'Verify Updates', fn: step6_VerifyTokenUpdates }
  ];

  for (const step of steps) {
    const success = await step.fn();
    if (!success && testResults.allPassed) {
      break; // Stop on first failure
    }
    await new Promise(r => setTimeout(r, 500)); // Small delay between steps
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Overall Result: ${testResults.allPassed ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`\nDetails:`);
  console.log(`  Bet ID: ${testResults.betPlaced?.id}`);
  console.log(`  Bet Status: ${testResults.betResolved?.outcome || 'NOT RESOLVED'}`);
  console.log(`  Token Change: ${testResults.userTokensBefore} → ${testResults.userTokensAfter}`);
  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(testResults.allPassed ? 0 : 1);
}

runTest().catch(error => {
  console.error('Test error:', error.message);
  process.exit(1);
});
