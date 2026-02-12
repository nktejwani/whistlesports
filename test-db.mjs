import fs from 'fs';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// Reset database
console.log('1. Resetting database...');
fs.writeFileSync('data/db.json', JSON.stringify({ users: [], bets: [], results: [] }, null, 2));

// Initialize lowdb like the server does
console.log('2. Initializing lowdb...');
const adapter = new JSONFile('data/db.json');
const lowdb = new Low(adapter, { users: [], bets: [] });
await lowdb.read();
lowdb.data = lowdb.data || { users: [], bets: [], results: [] };

console.log('3. Database after read:', JSON.stringify(lowdb.data));

// Check if user exists
function dbGetUser(username) {
  const row = (lowdb.data.users || []).find((u) => u.username === username);
  if (!row) return null;
  return { ...row };
}

console.log('4. Checking for alice:', dbGetUser('alice'));

// Now reset again and check
console.log('5. Resetting database again...');
fs.writeFileSync('data/db.json', JSON.stringify({ users: [], bets: [], results: [] }, null, 2));

console.log('6. Lowdb data before re-read:', JSON.stringify(lowdb.data));

// Try reading again
await lowdb.read();
console.log('7. Lowdb data after re-read:', JSON.stringify(lowdb.data));
console.log('8. Checking for alice again:', dbGetUser('alice'));
