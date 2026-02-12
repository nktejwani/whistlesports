#!/usr/bin/env node
/**
 * Test Winning Bet Flow
 * Places a bet on a team that WON to verify streak increases and payout works
 */

import axios from 'axios';

const API = 'http://localhost:3000';
const TEST_USER = 'kiki1';

let testResults = {
  userTokensBefore: 0,
  userTokensAfter: 0,
  streakBefore: 0,
  streakAfter: 0,
  betPlaced: null,
  betResolved: null,
  allPassed: true
};

async function log(step, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${step}: ${message}`);
}

async function step1_CheckUserStats() {
  log('STEP 1', 'Checking user balance and streak...');
  try {
    const response = await axios.get(`${API}/users/${TEST_USER}`);
    testResults.userTokensBefore = response.data.tokens;
    testResults.streakBefore = response.data.currentStreak;
    log('STEP 1', `✓ User "${TEST_USER}" has ${response.data.tokens} tokens`);
    log('STEP 1', `  Current streak: ${response.data.currentStreak}, Best streak: ${response.data.bestStreak}`);
    return true;
  } catch (error) {
    log('STEP 1', `✗ Failed to fetch user: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step2_PlaceWinningBet() {
  log('STEP 2', 'Placing bet on WINNING team (Miami Heat)...');
  try {
    // Miami Heat WON 132-101 against Washington Wizards
    // We'll bet on Miami Heat moneyline - this should WIN
    
    const betData = {
      username: TEST_USER,
      sport: 'nba',
      eventId: '401810613', // Miami Heat vs Washington Wizards game
      market: 'moneyline',
      selection: 'Miami Heat',
      stake: 10,
      odds: -150 // Typical favorite odds
    };

    const response = await axios.post(`${API}/bets`, betData);

    testResults.betPlaced = response.data.bet;
    log('STEP 2', `✓ Bet placed with ID: ${response.data.bet.id}`);
    log('STEP 2', `  Selection: ${response.data.bet.selection} (Heat WON 132-101, so bet should resolve as WIN)`);
    log('STEP 2', `  Stake: ${response.data.bet.stake} tokens at ${response.data.bet.odds} odds`);
    return true;
  } catch (error) {
    log('STEP 2', `✗ Failed to place bet: ${error.response?.data?.error || error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step3_CheckActiveBet() {
  log('STEP 3', 'Verifying bet appears in active bets...');
  try {
    const response = await axios.get(`${API}/bets/${TEST_USER}`);
    const bets = Array.isArray(response.data) ? response.data : (response.data?.bets || []);
    const pendingBets = bets.filter(b => b.outcome === 'pending');
    const hasBet = pendingBets.some(b => b.id === testResults.betPlaced.id);
    
    if (hasBet) {
      log('STEP 3', `✓ Bet found in active bets (${pendingBets.length} total pending)`);
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
    return true;
  } catch (error) {
    log('STEP 4', `✗ Failed to trigger resolution: ${error.message}`);
    testResults.allPassed = false;
    return false;
  }
}

async function step5_CheckResolvedBet() {
  log('STEP 5', 'Verifying bet resolved as WIN...');
  try {
    const response = await axios.get(`${API}/bets/${TEST_USER}`);
    const bets = Array.isArray(response.data) ? response.data : (response.data?.bets || []);
    const resolvedBet = bets.find(b => b.id === testResults.betPlaced.id);
    
    if (resolvedBet && resolvedBet.outcome === 'win') {
      testResults.betResolved = resolvedBet;
      log('STEP 5', `✓ Bet resolved as: ${resolvedBet.outcome.toUpperCase()}`);
      log('STEP 5', `  Payout: ${resolvedBet.payout} tokens`);
      log('STEP 5', `  Resolved at: ${resolvedBet.resolvedAt}`);
      return true;
    } else if (resolvedBet) {
      log('STEP 5', `✗ Bet resolved as ${resolvedBet.outcome} instead of WIN`);
      testResults.betResolved = resolvedBet;
      testResults.allPassed = false;
      return false;
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

async function step6_VerifyStreakIncrease() {
  log('STEP 6', 'Verifying streak increased and tokens updated...');
  try {
    const response = await axios.get(`${API}/users/${TEST_USER}`);
    const userAfter = response.data;
    
    testResults.userTokensAfter = userAfter.tokens;
    testResults.streakAfter = userAfter.currentStreak;
    
    // Calculate expected tokens (stake deducted on placement, payout added on win)
    const expectedTokens = testResults.userTokensBefore - testResults.betPlaced.stake + testResults.betResolved.payout;
    
    log('STEP 6', `✓ Tokens: ${testResults.userTokensBefore} → ${testResults.userTokensAfter}`);
    log('STEP 6', `  (Stake: -${testResults.betPlaced.stake}, Payout: +${testResults.betResolved.payout})`);
    log('STEP 6', `  Streak: ${testResults.streakBefore} → ${testResults.streakAfter}`);
    log('STEP 6', `  Best streak: ${userAfter.bestStreak}`);
    
    // Verify streak increased by 1
    if (testResults.streakAfter === testResults.streakBefore + 1) {
      log('STEP 6', `✓ Streak correctly increased by 1`);
    } else {
      log('STEP 6', `⚠ Streak mismatch (expected ${testResults.streakBefore + 1}, got ${testResults.streakAfter})`);
      testResults.allPassed = false;
    }
    
    // Verify token accounting
    if (testResults.userTokensAfter === expectedTokens) {
      log('STEP 6', `✓ Token accounting correct`);
      return true;
    } else {
      log('STEP 6', `⚠ Token mismatch (expected ${expectedTokens}, got ${testResults.userTokensAfter})`);
      testResults.allPassed = false;
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
  console.log('WHISTLE WINNING BET TEST');
  console.log('Testing: Bet placement → Resolution → Streak increase');
  console.log('='.repeat(60) + '\n');

  const steps = [
    { name: 'Check User Stats', fn: step1_CheckUserStats },
    { name: 'Place Winning Bet', fn: step2_PlaceWinningBet },
    { name: 'Verify Active Bet', fn: step3_CheckActiveBet },
    { name: 'Trigger Resolution', fn: step4_TriggerResolution },
    { name: 'Check Resolved as WIN', fn: step5_CheckResolvedBet },
    { name: 'Verify Streak Increase', fn: step6_VerifyStreakIncrease }
  ];

  for (const step of steps) {
    const success = await step.fn();
    if (!success && testResults.allPassed === false) {
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
  console.log(`  Token Change: ${testResults.userTokensBefore} → ${testResults.userTokensAfter} (${testResults.userTokensAfter > testResults.userTokensBefore ? '+' : ''}${testResults.userTokensAfter - testResults.userTokensBefore})`);
  console.log(`  Streak Change: ${testResults.streakBefore} → ${testResults.streakAfter}`);
  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(testResults.allPassed ? 0 : 1);
}

runTest().catch(error => {
  console.error('Test error:', error.message);
  process.exit(1);
});
