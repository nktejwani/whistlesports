#!/usr/bin/env node
/**
 * Test Email Registration
 * Verifies email field is captured during user registration
 */

import axios from 'axios';

const API = 'http://localhost:3000';

async function testEmailRegistration() {
  console.log('\n' + '='.repeat(60));
  console.log('EMAIL REGISTRATION TEST');
  console.log('='.repeat(60) + '\n');

  const testUsername = `emailtest${Date.now()}`;
  const testEmail = 'test@whistle.com';

  console.log(`Creating test user: ${testUsername}`);
  console.log(`With email: ${testEmail}\n`);

  try {
    // Register user with email
    const registerRes = await axios.post(`${API}/users`, {
      username: testUsername,
      email: testEmail,
      password: 'test1234',
      favoriteSports: ['nba'],
      intent: 'competitive'
    });

    console.log('✓ Registration successful');
    console.log(`  Username: ${registerRes.data.username}`);
    console.log(`  Email: ${registerRes.data.email}`);
    console.log(`  Tokens: ${registerRes.data.tokens}\n`);

    // Verify user was created with email
    const userRes = await axios.get(`${API}/users/${testUsername}`);
    
    if (userRes.data.email === testEmail) {
      console.log('✓ Email correctly stored in database');
      console.log(`  Retrieved email: ${userRes.data.email}\n`);
    } else {
      console.log('✗ Email mismatch');
      console.log(`  Expected: ${testEmail}`);
      console.log(`  Got: ${userRes.data.email}\n`);
      process.exit(1);
    }

    // Test without email (optional field)
    const testUsername2 = `noemail${Date.now()}`;
    console.log(`Creating user without email: ${testUsername2}`);
    
    const registerRes2 = await axios.post(`${API}/users`, {
      username: testUsername2,
      password: 'test1234',
      favoriteSports: ['nfl'],
      intent: 'competitive'
    });

    console.log('✓ Registration without email successful');
    console.log(`  Username: ${registerRes2.data.username}`);
    console.log(`  Email: ${registerRes2.data.email || 'null (as expected)'}\n`);

    console.log('='.repeat(60));
    console.log('✅ EMAIL REGISTRATION TEST PASSED');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('✗ Test failed:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

testEmailRegistration();
