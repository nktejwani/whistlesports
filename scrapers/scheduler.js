/**
 * Automated Score Scraper Scheduler
 * Runs ESPN scraper on a regular schedule
 */

import { runScraper } from './espn-scraper.js';

// Configuration
const SCRAPER_INTERVAL = 15 * 60 * 1000; // Run every 15 minutes

console.log(`
╔═══════════════════════════════════════════╗
║   🏆 Whistle Score Scraper Scheduler     ║
║   Running ESPN scraper every 15 minutes   ║
╚═══════════════════════════════════════════╝
`);

// Run immediately on startup
console.log('⏰ Running initial scrape...\n');
runScraper().catch(err => console.error('Initial scrape failed:', err));

// Then run on schedule
setInterval(() => {
  const now = new Date().toLocaleString();
  console.log(`\n⏰ Scheduled scrape triggered at ${now}\n`);
  runScraper().catch(err => console.error('Scheduled scrape failed:', err));
}, SCRAPER_INTERVAL);

console.log(`✅ Scheduler started. Next run in 15 minutes.\n`);

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down scraper scheduler...');
  process.exit(0);
});
