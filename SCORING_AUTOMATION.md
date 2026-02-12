# Scoring & Bet Resolution Automation

Your Whistle app already has **automatic bet resolution** built in! Here's how it works and how to improve it:

---

## 🔄 Current Automation (Already Working!)

Your backend has a `resolvePendingBets()` function that:
1. **Runs automatically** on startup and every hour (see line 1258 in index.js)
2. **Fetches scores** from The Odds API scores endpoint
3. **Resolves bets** by comparing final scores with bet selections
4. **Updates user tokens** and streaks automatically
5. **Falls back** to admin-submitted results when API quota is exhausted

---

## 🎯 How It Aligns With Your Mission

> **"Empowering sports fans to reclaim the thrill of smart picks and unbreakable streaks"**

✅ **Real-time tracking**: Automatic resolution provides instant gratification when bets win  
✅ **Unbreakable streaks**: System automatically updates `currentStreak` and `bestStreak`  
✅ **No financial stress**: Uses fun tokens, not real money  
✅ **Bragging rights**: Leaderboard updates automatically with wins  
✅ **Community**: Resolved bets feed into social sharing and leaderboards  

---

## 📊 3 Ways to Resolve Bets

### 1. **Automatic (The Odds API)** ⭐ Recommended
Your system already does this! The Odds API provides real-time scores.

**Pros:**
- Completely hands-off
- Real-time updates
- Covers all major sports

**Cons:**
- Limited free quota (500 requests/month)
- Costs $60/mo for 10,000 requests

**How it works:**
```javascript
// Already in index.js lines 877-1055
// Runs every hour via setInterval
async function resolvePendingBets() {
  // Fetches from: https://api.the-odds-api.com/v4/sports/{sport}/scores
  // Compares final scores with bet selections
  // Updates user tokens and streaks
}
```

---

### 2. **Manual Admin Submission** (Current Fallback)
When Odds API quota runs out, you can manually submit results.

**Submit a game result:**
```bash
curl -X POST http://localhost:3000/admin/results \
  -H "Content-Type: application/json" \
  -d '{
    "id": "b64e3587d7a4cf01a568e7150a2a1aec",
    "sport": "nfl",
    "homeTeam": "Buffalo Bills",
    "awayTeam": "New England Patriots",
    "homeScore": 24,
    "awayScore": 21
  }'
```

After submitting results, the `resolvePendingBets()` function automatically processes them on its next hourly run (or you can trigger it manually by restarting the server).

---

### 3. **Direct Bet Resolution** (Emergency Only)
Manually resolve individual bets (useful for corrections).

```bash
curl -X POST http://localhost:3000/admin/bets/kiki2-1770562291971/resolve \
  -H "Content-Type: application/json" \
  -d '{"outcome": "loss", "payout": 0}'
```

---

## 🚀 Improving Automation

### Option A: Increase Odds API Quota
Upgrade your Odds API plan to handle more requests:
- **$60/month**: 10,000 requests (supports ~300 daily auto-resolutions)
- **Free tier**: 500 requests/month (limited to ~16 daily resolutions)

### Option B: Build a Score Scraper
Create a custom scraper for ESPN, CBS Sports, or The Score:

```javascript
// Example: ESPN NBA scores scraper
import axios from 'axios';
import cheerio from 'cheerio';

async function scrapeNBAScores() {
  const { data } = await axios.get('https://www.espn.com/nba/scoreboard');
  const $ = cheerio.load(data);
  
  const games = [];
  $('.ScoreCell').each((i, el) => {
    // Parse score data...
    games.push({
      homeTeam: $(el).find('.home-team').text(),
      awayTeam: $(el).find('.away-team').text(),
      homeScore: parseInt($(el).find('.home-score').text()),
      awayScore: parseInt($(el).find('.away-score').text()),
      status: 'completed'
    });
  });
  
  return games;
}

// Submit to your backend
async function submitScores() {
  const scores = await scrapeNBAScores();
  for (const game of scores) {
    await fetch('http://localhost:3000/admin/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: game.gameId,
        sport: 'nba',
        ...game
      })
    });
  }
}
```

**Important**: Check ESPN's terms of service for scraping. Consider using their official API if available.

### Option C: Use SportsData.io
Alternative sports API with generous free tier:
- **Free tier**: 1,000 API calls/day
- Supports NFL, NBA, MLB, NHL, soccer

---

## 🎮 Enhancing the User Experience

To fully deliver on your mission:

### 1. **Push Notifications** (Future Feature)
Notify users when their bets are resolved:
```javascript
// When bet resolves...
if (outcome === 'win') {
  sendPushNotification(user, {
    title: '🎉 You won!',
    body: `Your ${selection} bet won! +${payout} tokens. Streak: ${user.currentStreak}`,
    action: '/bets'
  });
}
```

### 2. **Social Sharing** (Already Supported!)
Users can share wins instantly:
- Share button on resolved bets
- Auto-generate shareable streak cards
- "I just hit a 5-game winning streak on Whistle!" posts

### 3. **Leaderboard Push**
Show live updates when users climb the leaderboard:
```javascript
// After resolution, check rank change
const oldRank = getUserRank(user.username);
await resolvePendingBets();
const newRank = getUserRank(user.username);

if (newRank < oldRank) {
  showNotification(`📈 You moved up to #${newRank}!`);
}
```

---

## ⚡ Quick Setup for Patriots Bet

Run this now to resolve your Patriots bet:

```bash
node resolve-patriots.mjs
```

Then check the "My Bets" tab - it should show as resolved!

---

## 📝 Summary

Your app **already automates scoring**! The system:
1. ✅ Runs hourly automatic resolution
2. ✅ Uses The Odds API for real scores
3. ✅ Falls back to manual admin results
4. ✅ Updates tokens, streaks, and leaderboards
5. ✅ Aligns perfectly with your "no risk, all thrill" mission

**Next Steps:**
1. Resolve Patriots bet: `node resolve-patriots.mjs`
2. Monitor quota: Check `https://the-odds-api.com/account/` for API usage
3. Consider upgrading Odds API or adding ESPN scraper for better coverage
4. Enable future: Push notifications + real-time leaderboard updates

**Your mission is alive in the code!** Users get instant gratification from smart picks, automatic streak tracking, and zero financial stress. 🎯
