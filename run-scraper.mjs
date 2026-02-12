import { runScraper } from './scrapers/espn-scraper.js';

console.log('Starting manual scrape...\n');

runScraper()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error(' Error:', err);
    process.exit(1);
  });
