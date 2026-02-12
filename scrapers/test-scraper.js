/**
 * Test the ESPN scraper
 * Run with: node scrapers/test-scraper.js
 */

import { fetchESPNScores, fetchAllScores } from './espn-scraper.js';

console.log('Testing ESPN Scraper...\n');

async function testSingleSport() {
  console.log('=== Testing NBA Scraper ===');
  const nbaResults = await fetchESPNScores('nba');
  console.log(`Found ${nbaResults.length} NBA games\n`);
  
  if (nbaResults.length > 0) {
    console.log('Sample result:');
    console.log(JSON.stringify(nbaResults[0], null, 2));
  }
}

async function testAllSports() {
  console.log('\n=== Testing All Sports ===');
  const allResults = await fetchAllScores();
  
  const breakdown = allResults.reduce((acc, r) => {
    acc[r.sport] = (acc[r.sport] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\nResults by sport:');
  Object.entries(breakdown).forEach(([sport, count]) => {
    console.log(`  ${sport}: ${count} games`);
  });
  
  console.log(`\nTotal: ${allResults.length} completed games`);
}

// Run tests
(async () => {
  try {
    await testSingleSport();
    await testAllSports();
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
})();
