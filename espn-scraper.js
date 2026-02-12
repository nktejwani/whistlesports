/**
 * ESPN Score Scraper
 * Fetches completed game scores from ESPN's JSON API
 * Free alternative to The Odds API
 */

import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'db.json');
const API_URL = process.env.WHISTLE_API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token';

// ESPN Sport League IDs
const ESPN_LEAGUES = {
  nfl: { id: 'football', league: 'nfl' },
  nba: { id: 'basketball', league: 'nba' },
  mlb: { id: 'baseball', league: 'mlb' },
  nhl: { id: 'hockey', league: 'nhl' },
  ncaaf: { id: 'football', league: 'college-football' },
  ncaab: { id: 'basketball', league: 'mens-college-basketball' }
};

/**
 * Fetch scores for a specific sport from ESPN
 * @param {string} sport - Sport key (nfl, nba, mlb, etc.)
 * @param {string} date - Date in YYYYMMDD format (optional, defaults to today)
 * @returns {Promise<Array>} Array of game results
 */
async function fetchESPNScores(sport, date = null) {
  const league = ESPN_LEAGUES[sport];
  if (!league) {
    console.warn(`[ESPN] Unknown sport: ${sport}`);
    return [];
  }

  try {
    // ESPN Scoreboard API endpoint
    const targetDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/${league.id}/${league.league}/scoreboard?dates=${targetDate}`;

    console.log(`[ESPN] Fetching ${sport} scores from: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const events = response.data?.events || [];
    const results = [];

    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      // Only process completed games
      const status = competition.status?.type?.state || event.status?.type?.state;
      if (status !== 'post') continue;

      const competitors = competition.competitors || [];
      const homeTeam = competitors.find(c => c.homeAway === 'home');
      const awayTeam = competitors.find(c => c.homeAway === 'away');

      if (!homeTeam || !awayTeam) continue;

      const result = {
        id: event.id || event.uid,
        sport: sport,
        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
        homeScore: parseInt(homeTeam.score || 0),
        awayScore: parseInt(awayTeam.score || 0),
        status: 'completed',
        occurredAt: event.date || new Date().toISOString(),
        source: 'espn',
        createdAt: new Date().toISOString()
      };

      results.push(result);
      console.log(`[ESPN] ✅ ${result.awayTeam} ${result.awayScore} @ ${result.homeTeam} ${result.homeScore}`);
    }

    console.log(`[ESPN] Found ${results.length} completed ${sport} games`);
    return results;

  } catch (error) {
    console.error(`[ESPN] Error fetching ${sport} scores:`, error.message);
    if (error.response) {
      console.error(`[ESPN] Response status: ${error.response.status}`);
    }
    return [];
  }
}

/**
 * Fetch scores for all supported sports
 * @returns {Promise<Array>} Combined array of all game results
 */
async function fetchAllScores() {
  const sports = Object.keys(ESPN_LEAGUES);
  const allResults = [];

  for (const sport of sports) {
    const results = await fetchESPNScores(sport);
    allResults.push(...results);
    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allResults;
}

/**
 * Submit results to the database directly (bypassing API authentication)
 * @param {Array} results - Array of game results
 */
function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function fetchPendingBetsFromApi() {
  try {
    const res = await axios.get(`${API_URL}/admin/bets/pending`, {
      headers: { 'x-admin-token': ADMIN_TOKEN },
      timeout: 10000
    });
    return res.data || [];
  } catch (error) {
    console.warn('[ESPN] Unable to fetch pending bets from API:', error.message);
    return [];
  }
}

async function submitResultsViaApi(results) {
  const pendingBets = await fetchPendingBetsFromApi();
  let addedCount = 0;

  for (const result of results) {
    const resultHome = normalizeTeamName(result.homeTeam);
    const resultAway = normalizeTeamName(result.awayTeam);
    const resultSport = String(result.sport || '').toLowerCase();

    const match = pendingBets.find((b) => {
      if (String(b.sport || '').toLowerCase() !== resultSport) return false;
      const selection = normalizeTeamName(b.selection || '');
      return selection && (selection.includes(resultHome) || selection.includes(resultAway));
    });

    const id = match && match.eventId ? String(match.eventId) : String(result.id);

    try {
      await axios.post(
        `${API_URL}/admin/results`,
        {
          id,
          sport: result.sport,
          homeTeam: result.homeTeam,
          awayTeam: result.awayTeam,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          occurredAt: result.occurredAt
        },
        { headers: { 'x-admin-token': ADMIN_TOKEN }, timeout: 10000 }
      );
      addedCount += 1;
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      if (msg && String(msg).includes('already exists')) {
        continue;
      }
      console.warn('[ESPN] Failed to submit result:', msg);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (addedCount > 0) {
    console.log(`[ESPN] ✅ Submitted ${addedCount} results via API`);
    try {
      await axios.post(`${API_URL}/resolve-bets`, {}, { timeout: 10000 });
      console.log('[ESPN] ✅ Triggered bet resolver');
    } catch (error) {
      console.warn('[ESPN] Failed to trigger resolver:', error.message);
    }
  } else {
    console.log('[ESPN] ℹ️ No new results to submit via API');
  }
}

function submitResultsToDatabase(results) {
  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf-8'));
    
    if (!db.results) {
      db.results = [];
    }

    let addedCount = 0;
    for (const result of results) {
      // Check if result already exists
      const exists = db.results.find(r => r.id === result.id);
      if (!exists) {
        db.results.push(result);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log(`[ESPN] ✅ Added ${addedCount} new results to database`);
    } else {
      console.log(`[ESPN] ℹ️ No new results to add`);
    }

  } catch (error) {
    console.error('[ESPN] Error submitting results:', error.message);
  }
}

async function submitResults(results) {
  if (process.env.WHISTLE_API_URL || process.env.ADMIN_TOKEN) {
    await submitResultsViaApi(results);
    return;
  }
  submitResultsToDatabase(results);
}

/**
 * Main scraper function - fetches and stores scores
 */
async function runScraper() {
  console.log('\n🏈 ESPN Score Scraper Started\n');
  console.log('='.repeat(50));
  
  try {
    // Fetch scores for the last 3 days to catch any delayed updates
    const today = new Date();
    const dates = [];
    
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0].replace(/-/g, ''));
    }

    console.log(`[ESPN] Checking dates: ${dates.join(', ')}`);
    
    const allResults = [];
    
    // Fetch for each date
    for (const date of dates) {
      for (const sport of Object.keys(ESPN_LEAGUES)) {
        const results = await fetchESPNScores(sport, date);
        allResults.push(...results);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`[ESPN] Total games found: ${allResults.length}`);

    if (allResults.length > 0) {
      await submitResults(allResults);
    }

    console.log('='.repeat(50));
    console.log('✅ Scraper completed successfully\n');

  } catch (error) {
    console.error('❌ Scraper failed:', error.message);
    throw error;
  }
}

// If run directly, execute the scraper
if (import.meta.url === `file://${process.argv[1]}`) {
  runScraper()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { fetchESPNScores, fetchAllScores, runScraper, submitResultsToDatabase };
