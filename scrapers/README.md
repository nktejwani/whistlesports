# ESPN Score Scraper

Free alternative to The Odds API for automatic bet resolution.

## Features

- ✅ **Free** - No API costs
- ✅ **Reliable** - Uses ESPN's official JSON API
- ✅ **Multi-sport** - NFL, NBA, MLB, NHL, NCAAF, NCAAB
- ✅ **Automatic** - Scheduled scraping every 15 minutes
- ✅ **Historical** - Checks last 3 days for delayed game results
- ✅ **Direct DB integration** - No authentication needed

## Quick Start

### 1. Test the scraper
```bash
node scrapers/test-scraper.js
```

### 2. Run manual scrape
```bash
node scrapers/espn-scraper.js
```

### 3. Start automated scheduler
```bash
node scrapers/scheduler.js
```

## How It Works

### Data Flow
```
ESPN API → Scraper → Database (data/db.json) → resolvePendingBets()
```

1. **Scraper fetches scores** from ESPN's hidden JSON API
2. **Parses completed games** (status === 'post')
3. **Stores in `db.results`** array
4. **Existing resolver** (`resolvePendingBets`) reads from `db.results`
5. **Bets are automatically resolved** on next hourly check

### API Endpoints Used

```
NBA:
https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD

NFL:
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD

MLB:
https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=YYYYMMDD

NHL:
https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=YYYYMMDD
```

## Configuration

### Scraper Frequency
Edit `scrapers/scheduler.js`:
```javascript
const SCRAPER_INTERVAL = 15 * 60 * 1000; // 15 minutes (default)
```

### Sports Coverage
Edit `scrapers/espn-scraper.js`:
```javascript
const ESPN_LEAGUES = {
  nfl: { id: 'nfl', league: 'nfl' },
  nba: { id: 'nba', league: 'nba' },
  // Add/remove sports as needed
};
```

## Running in Production

### Option A: Node.js Process (Simple)
```bash
# Start in background
node scrapers/scheduler.js &

# Or use screen/tmux
screen -S scraper
node scrapers/scheduler.js
# Ctrl+A, D to detach
```

### Option B: PM2 (Recommended)
```bash
npm install -g pm2
pm2 start scrapers/scheduler.js --name "whistle-scraper"
pm2 save
pm2 startup  # Enable auto-start on reboot
```

### Option C: Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task → "Whistle Scraper"
3. Trigger: At startup
4. Action: Start a program
5. Program: `node`
6. Arguments: `C:\Users\tejwa\Desktop\Whistle\scrapers\scheduler.js`
7. Start in: `C:\Users\tejwa\Desktop\Whistle`

### Option D: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "scrapers/scheduler.js"]
```

## Monitoring

### Check scraper logs
```bash
# If using PM2
pm2 logs whistle-scraper

# If using screen
screen -r scraper
```

### Verify results in database
```bash
# Check recent results
node -e "console.log(JSON.parse(require('fs').readFileSync('data/db.json')).results.slice(-5))"
```

### Test resolution
```bash
# Trigger manual resolution
node -e "const r = await import('./index.js'); r.resolvePendingBets()"
```

## Legal & Terms of Service

### ESPN API Usage
ESPN's scoreboard API is publicly accessible but **not officially documented** for third-party use.

**Considerations:**
- ✅ No authentication required (public data)
- ✅ Read-only access (no POST/PUT operations)
- ✅ Reasonable rate limiting (500ms between requests)
- ⚠️ Not officially supported by ESPN
- ⚠️ Could change without notice

**Best Practices:**
1. **Rate limiting** - Wait 500ms between requests
2. **User-Agent** - Identify as a browser
3. **Error handling** - Graceful fallback if endpoint changes
4. **Caching** - Don't re-fetch same games
5. **Attribution** - Credit ESPN if displaying scores publicly

### Alternative Free Sources
If ESPN blocks access, consider:
- **The Score** (mobile API)
- **CBS Sports** (similar JSON API)
- **SportsData.io** (1,000 free calls/day)
- **API-FOOTBALL** (100 free calls/day)

## Troubleshooting

### Scraper returns empty results
- Check if sport is in season (NBA: Oct-Jun, NFL: Sep-Feb)
- Verify date format is correct (YYYYMMDD)
- Check network connectivity
- ESPN API may be temporarily down

### Results not resolving bets
- Verify `db.results` has entries: `cat data/db.json | grep results`
- Check team names match between ESPN and Odds API
- Ensure `resolvePendingBets()` is running hourly
- Team name mismatches (e.g., "LA Lakers" vs "Los Angeles Lakers")

### Rate limiting errors
- Increase delay between requests in scraper
- Reduce scraper frequency
- Add exponential backoff on errors

## Team Name Normalization

ESPN and The Odds API may use different team names:

```javascript
// Add to espn-scraper.js if needed
const TEAM_NAME_MAP = {
  'LA Lakers': 'Los Angeles Lakers',
  'LA Clippers': 'Los Angeles Clippers',
  'GS Warriors': 'Golden State Warriors',
  // Add more mappings as discovered
};
```

## Performance

- **Memory usage**: ~50MB
- **CPU usage**: Minimal (spikes during scrape)
- **Network usage**: ~1KB per game
- **Disk usage**: Minimal (appends to db.json)

## Support

For issues or questions:
1. Check logs for error messages
2. Test with `test-scraper.js`
3. Verify ESPN API is accessible: `curl https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
4. Check database permissions: `ls -la data/db.json`
