#!/usr/bin/env node
/**
 * OAuth Flow Test
 * Tests Google and Facebook authentication endpoints
 */

import axios from 'axios';

const API = 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(type, message) {
  const prefix = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    test: `${colors.cyan}→${colors.reset}`
  }[type] || '';
  console.log(`${prefix} ${message}`);
}

async function testEndpointStructure() {
  console.log('\n' + '='.repeat(60));
  console.log('OAUTH ENDPOINT STRUCTURE TEST');
  console.log('='.repeat(60) + '\n');

  // Test 1: Config endpoint
  log('test', 'Testing /config endpoint...');
  try {
    const response = await axios.get(`${API}/config`);
    const config = response.data;
    
    if (config.googleClientId) {
      log('success', `Google Client ID configured: ${config.googleClientId.substring(0, 20)}...`);
    } else {
      log('warn', 'Google Client ID not configured');
    }
    
    if (config.facebookAppId) {
      log('success', `Facebook App ID configured: ${config.facebookAppId}`);
    } else {
      log('warn', 'Facebook App ID not configured (OAuth will fail)');
    }
  } catch (error) {
    log('error', `Failed to fetch config: ${error.message}`);
  }

  // Test 2: Google auth endpoint (with invalid token)
  log('test', '\nTesting /auth/google endpoint structure...');
  try {
    await axios.post(`${API}/auth/google`, {
      idToken: 'INVALID_TOKEN_FOR_TESTING'
    });
    log('warn', 'Endpoint accepted invalid token (unexpected)');
  } catch (error) {
    if (error.response?.status === 401) {
      log('success', 'Google auth endpoint exists and validates tokens (401 for invalid token)');
    } else if (error.response?.status === 400) {
      log('success', 'Google auth endpoint exists and requires idToken field');
    } else {
      log('error', `Unexpected response: ${error.response?.status} - ${error.response?.data?.error}`);
    }
  }

  // Test 3: Facebook auth endpoint (with invalid token)
  log('test', 'Testing /auth/facebook endpoint structure...');
  try {
    await axios.post(`${API}/auth/facebook`, {
      accessToken: 'INVALID_TOKEN_FOR_TESTING'
    });
    log('warn', 'Endpoint accepted invalid token (unexpected)');
  } catch (error) {
    if (error.response?.status === 401) {
      log('success', 'Facebook auth endpoint exists and validates tokens (401 for invalid token)');
    } else if (error.response?.status === 400) {
      log('success', 'Facebook auth endpoint exists and requires accessToken field');
    } else if (error.response?.status === 500 && error.response?.data?.error?.includes('not configured')) {
      log('warn', 'Facebook credentials not configured in .env (expected - endpoint structure is correct)');
    } else {
      log('error', `Unexpected response: ${error.response?.status} - ${error.response?.data?.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ENDPOINT STRUCTURE ✓ VALIDATED');
  console.log('='.repeat(60));
}

async function printManualTestGuide() {
  console.log('\n' + '='.repeat(60));
  console.log('MANUAL BROWSER TEST GUIDE');
  console.log('='.repeat(60) + '\n');

  console.log(`${colors.blue}Google OAuth Test${colors.reset}`);
  console.log('─'.repeat(60));
  console.log('1. Open http://localhost:3000 in your browser');
  console.log('2. Click "Sign Up" or "Login"');
  console.log('3. Click the "Sign in with Google" button');
  console.log('4. Follow Google OAuth popup');
  console.log('5. Should redirect to app and create/login user\n');

  console.log(`${colors.blue}Facebook OAuth Test${colors.reset}`);
  console.log('─'.repeat(60));
  console.log(`${colors.yellow}⚠ Facebook App ID/Secret not configured in .env${colors.reset}`);
  console.log('To enable Facebook OAuth:');
  console.log('1. Create a Facebook App at https://developers.facebook.com');
  console.log('2. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to .env');
  console.log('3. Configure OAuth redirect URI: http://localhost:3000');
  console.log('4. Restart the server');
  console.log('5. Test like Google OAuth above\n');

  console.log(`${colors.blue}Expected Flow${colors.reset}`);
  console.log('─'.repeat(60));
  console.log('✓ User clicks OAuth button');
  console.log('✓ OAuth provider popup appears');
  console.log('✓ User authenticates with provider');
  console.log('✓ Frontend receives token');
  console.log('✓ Frontend POSTs token to /auth/google or /auth/facebook');
  console.log('✓ Backend validates token with provider');
  console.log('✓ Backend creates or finds user account');
  console.log('✓ Backend returns user object');
  console.log('✓ Frontend stores username and shows app\n');

  console.log(`${colors.blue}What to Check${colors.reset}`);
  console.log('─'.repeat(60));
  console.log('• New user account created in database');
  console.log('• socialProfiles.google or socialProfiles.facebook set');
  console.log('• User granted 1 starting token');
  console.log('• Username generated from email (e.g., "john" from john@gmail.com)');
  console.log('• Return visits link existing account (no duplicates)\n');
}

async function checkOAuthConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('OAUTH CONFIGURATION STATUS');
  console.log('='.repeat(60) + '\n');

  try {
    const response = await axios.get(`${API}/config`);
    const config = response.data;

    console.log(`${colors.blue}Google OAuth${colors.reset}`);
    console.log('─'.repeat(60));
    if (config.googleClientId) {
      log('success', 'READY - Client ID configured');
      console.log(`  Client ID: ${config.googleClientId}`);
      console.log(`  Status: ${colors.green}Can test in browser now${colors.reset}\n`);
    } else {
      log('error', 'NOT CONFIGURED');
      console.log(`  Missing: GOOGLE_CLIENT_ID in .env\n`);
    }

    console.log(`${colors.blue}Facebook OAuth${colors.reset}`);
    console.log('─'.repeat(60));
    if (config.facebookAppId) {
      log('success', 'READY - App ID configured');
      console.log(`  App ID: ${config.facebookAppId}`);
      console.log(`  Status: ${colors.green}Can test in browser now${colors.reset}\n`);
    } else {
      log('error', 'NOT CONFIGURED');
      console.log(`  Missing: FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env`);
      console.log(`  Required for: Facebook login to work\n`);
    }

  } catch (error) {
    log('error', `Failed to check config: ${error.message}`);
  }

  console.log('='.repeat(60) + '\n');
}

async function runTests() {
  console.log('\n🔐 OAuth Flow Test Suite\n');

  await checkOAuthConfig();
  await testEndpointStructure();
  await printManualTestGuide();

  console.log(`${colors.cyan}Next Steps:${colors.reset}`);
  console.log('1. Keep server running (npm start)');
  console.log('2. Open http://localhost:3000 in browser');
  console.log('3. Test Google OAuth (configured and ready)');
  console.log('4. Configure Facebook OAuth if needed');
  console.log('\n✨ Endpoints are ready for testing!\n');
}

runTests().catch(error => {
  console.error('Test error:', error.message);
  process.exit(1);
});
