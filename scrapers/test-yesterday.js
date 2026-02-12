/**
 * Test scraper with yesterday's date (more likely to have completed games)
 */

import { fetchESPNScores } from './espn-scraper.js';

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');

console.log(`Testing ESPN Scraper for ${yesterday.toDateString()}\n`);

async function test() {
  const sports = ['nba', 'nfl', 'nhl'];
  let totalGames = 0;
  
  for (const sport of sports) {
    console.log(`\n=== ${sport.toUpperCase()} ===`);
    const results = await fetchESPNScores(sport, dateStr);
    totalGames += results.length;
    
    if (results.length > 0) {
      results.slice(0, 3).forEach(game => {
        console.log(`  ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore}`);
      });
      if (results.length > 3) {
        console.log(`  ... and ${results.length - 3} more`);
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n\n✅ Total completed games found: ${totalGames}`);
  
  if (totalGames === 0) {
    console.log('\nℹ️  No games found. This is normal if:');
    console.log('   - It\'s the off-season for these sports');
    console.log('   - No games were scheduled yesterday');
    console.log('   - Games are in progress but not finished yet\n');
  }
}

test().catch(console.error);
