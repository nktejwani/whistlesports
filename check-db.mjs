import { readFileSync } from 'fs';

const db = JSON.parse(readFileSync('data/db.json', 'utf-8'));

console.log('\n=== DATABASE RESULTS CHECK ===\n');
console.log('Total results stored:', db.results?.length || 0);

if (db.results && db.results.length > 0) {
  console.log('\nMost recent 5 results:');
  db.results.slice(-5).forEach((r, i) => {
    console.log(`${i + 1}. [${r.sport.toUpperCase()}] ${r.awayTeam} ${r.awayScore} @ ${r.homeTeam} ${r.homeScore}`);
  });
} else {
  console.log('\nNo results found in database.');
}

console.log('\n');
