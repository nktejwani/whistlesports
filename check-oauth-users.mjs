#!/usr/bin/env node
/**
 * Check OAuth Users in Database
 * Shows all users who logged in via Google or Facebook
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'data', 'db.json');

function checkOAuthUsers() {
  console.log('\n' + '='.repeat(60));
  console.log('OAUTH USERS IN DATABASE');
  console.log('='.repeat(60) + '\n');

  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf-8'));
    const users = db.users || [];

    const googleUsers = users.filter(u => u.socialProfiles?.google);
    const facebookUsers = users.filter(u => u.socialProfiles?.facebook);
    const bothUsers = users.filter(u => u.socialProfiles?.google && u.socialProfiles?.facebook);

    console.log(`Total Users: ${users.length}`);
    console.log(`Google OAuth Users: ${googleUsers.length}`);
    console.log(`Facebook OAuth Users: ${facebookUsers.length}`);
    console.log(`Both Google & Facebook: ${bothUsers.length}\n`);

    if (googleUsers.length > 0) {
      console.log('Google OAuth Users:');
      console.log('─'.repeat(60));
      googleUsers.forEach(user => {
        console.log(`  Username: ${user.username}`);
        console.log(`  Email: ${user.email || 'N/A'}`);
        console.log(`  Google ID: ${user.socialProfiles.google}`);
        console.log(`  Tokens: ${user.tokens}`);
        console.log(`  Created: ${user.createdAt}`);
        console.log('');
      });
    }

    if (facebookUsers.length > 0) {
      console.log('Facebook OAuth Users:');
      console.log('─'.repeat(60));
      facebookUsers.forEach(user => {
        console.log(`  Username: ${user.username}`);
        console.log(`  Email: ${user.email || 'N/A'}`);
        console.log(`  Facebook ID: ${user.socialProfiles.facebook}`);
        console.log(`  Tokens: ${user.tokens}`);
        console.log(`  Created: ${user.createdAt}`);
        console.log('');
      });
    }

    if (googleUsers.length === 0 && facebookUsers.length === 0) {
      console.log('ℹ️  No OAuth users found yet.');
      console.log('   Test Google OAuth in the browser to create one!\n');
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Error reading database:', error.message);
  }
}

checkOAuthUsers();
