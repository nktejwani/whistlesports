<<<<<<< HEAD
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import Stripe from "stripe";
import { runScraper } from "./scrapers/espn-scraper.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Initialize Stripe (requires STRIPE_SECRET_KEY in .env)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve a tiny frontend for onboarding + sharing
app.use(express.static("public"));

// Admin auth middleware: require ADMIN_TOKEN env var or default dev token.
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || req.headers['x-admin-token'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const expected = process.env.ADMIN_TOKEN || 'dev-admin-token';
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized - admin token required' });
  }
  next();
}
const SPORTS = {
  nba: { key: "basketball_nba", label: "NBA" },
  nfl: { key: "americanfootball_nfl", label: "NFL" },
  ncaaf: { key: "americanfootball_ncaaf", label: "College Football" },
  ncaab: { key: "basketball_ncaab", label: "College Basketball" },
  mlb: { key: "baseball_mlb", label: "MLB" },
  ncaa_baseball: { key: "baseball_ncaa", label: "College Baseball" },
  nhl: { key: "icehockey_nhl", label: "NHL" },
  soccer: { key: "soccer_epl", label: "Soccer (EPL)" },
  tennis: { key: "tennis_atp", label: "Tennis" },
  golf: { key: "golf", label: "Golf" }
};

// Pathway / support settings
const PATHWAYS = {
  competitive: {
    id: "competitive",
    description: "Light, optional play with no special limits."
  },
  casual: {
    id: "casual",
    description: "Assistance pathway: strict limits and play-time restrictions to support healthy play.",
    maxStakePerBet: 1,
    dailySpendLimit: 5,
    allowedStartHour: 10, // 10:00 local
    allowedEndHour: 20, // 20:00 local
    encouragements: [
      "You got this — one step at a time. Try a walk instead! 🚶",
      "Remember: betting won't fix feelings. Maybe call a friend? ☎️",
      "Treat yourself to a snack, not a bet. Snacks > regrets. 🍪"
    ]
  }
};

// Persist users and bets to a local SQLite database
fs.mkdirSync("data", { recursive: true });
const adapter = new JSONFile("data/db.json");
const lowdb = new Low(adapter, { users: [], bets: [], results: [], resetTokens: [] });

// Initialize the JSON DB (top-level await is supported in modern Node ESM)
await lowdb.read();
if (!lowdb.data.results) lowdb.data.results = [];
if (!lowdb.data.resetTokens) lowdb.data.resetTokens = [];
await lowdb.write();

function serializeFavorites(fav) {
  return fav || [];
}

// Generate a random reset token
function generateResetToken() {
  return Math.random().toString(36).substr(2, 32) + Date.now().toString(36);
}

// Create a password reset token
async function createResetToken(username) {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  lowdb.data.resetTokens = lowdb.data.resetTokens || [];
  lowdb.data.resetTokens.push({
    token,
    username,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  await lowdb.write();
  
  return token;
}

// Validate and consume reset token
async function validateResetToken(token) {
  if (!lowdb.data.resetTokens) return null;
  
  const idx = lowdb.data.resetTokens.findIndex((t) => t.token === token);
  if (idx === -1) return null;
  
  const resetToken = lowdb.data.resetTokens[idx];
  const now = new Date();
  const expiresAt = new Date(resetToken.expiresAt);
  
  if (now > expiresAt) {
    // Token expired - remove it
    lowdb.data.resetTokens.splice(idx, 1);
    await lowdb.write();
    return null;
  }
  
  // Token is valid - consume it
  const username = resetToken.username;
  lowdb.data.resetTokens.splice(idx, 1);
  await lowdb.write();
  
  return username;
}

function dbGetUser(username) {
  const row = (lowdb.data.users || []).find((u) => u.username === username);
  if (!row) return null;
  return { ...row };
}

function dbGetAllUsers() {
  return (lowdb.data.users || []).map((u) => ({ ...u }));
}

async function dbCreateUser(user) {
  lowdb.data.users.push({
    id: user.id,
    username: user.username,
    email: user.email || null,
    passwordHash: user.passwordHash, // store hashed password
    avatar: user.avatar || null, // team avatar/logo
    favoriteSports: serializeFavorites(user.favoriteSports),
    intent: user.intent,
    tier: user.tier,
    tokens: user.tokens,
    premium: user.premium || false,
    premiumSince: user.premiumSince || null,
    stripeCustomerId: user.stripeCustomerId || null,
    lastTokenGrant: user.lastTokenGrant ? new Date(user.lastTokenGrant).toISOString() : null,
    socialProfiles: user.socialProfiles || {},
    customLimits: user.customLimits || null,
    lockedUntil: user.lockedUntil || null,
    supportContact: user.supportContact || null,
    // streak & onboarding
    currentStreak: 0,
    bestStreak: 0,
    lastWinDate: null,
    onboarding: user.onboarding || { completed: false, step: 0 },
    createdAt: new Date().toISOString()
  });
  await lowdb.write();
  return dbGetUser(user.username);
}

async function dbUpdateUser(user) {
  const idx = (lowdb.data.users || []).findIndex((u) => u.username === user.username);
  if (idx === -1) return;
  lowdb.data.users[idx] = {
    ...lowdb.data.users[idx],
    passwordHash: user.passwordHash || lowdb.data.users[idx].passwordHash,
    email: user.email || lowdb.data.users[idx].email || null,
    avatar: user.avatar !== undefined ? user.avatar : (lowdb.data.users[idx].avatar || null),
    favoriteSports: serializeFavorites(user.favoriteSports),
    intent: user.intent,
    tier: user.tier,
    tokens: (typeof user.tokens === 'number') ? Math.max(0, user.tokens) : (lowdb.data.users[idx].tokens || 0),
    premium: user.premium !== undefined ? user.premium : (lowdb.data.users[idx].premium || false),
    premiumSince: user.premiumSince || (lowdb.data.users[idx].premiumSince || null),
    stripeCustomerId: user.stripeCustomerId || (lowdb.data.users[idx].stripeCustomerId || null),
    lastTokenGrant: user.lastTokenGrant ? new Date(user.lastTokenGrant).toISOString() : null,
    customLimits: user.customLimits || lowdb.data.users[idx].customLimits || null,
    socialProfiles: user.socialProfiles || lowdb.data.users[idx].socialProfiles || {},
    lockedUntil: user.lockedUntil || lowdb.data.users[idx].lockedUntil || null,
    supportContact: user.supportContact || lowdb.data.users[idx].supportContact || null,
    currentStreak: typeof user.currentStreak === 'number' ? user.currentStreak : (lowdb.data.users[idx].currentStreak || 0),
    bestStreak: typeof user.bestStreak === 'number' ? user.bestStreak : (lowdb.data.users[idx].bestStreak || 0),
    lastWinDate: user.lastWinDate || lowdb.data.users[idx].lastWinDate || null,
    onboarding: user.onboarding || lowdb.data.users[idx].onboarding || { completed: false, step: 0 }
  };
  await lowdb.write();
}

function grantDailyTokens(user) {
  const now = new Date();
  const last = user.lastTokenGrant ? new Date(user.lastTokenGrant) : null;

  if (!last) {
    user.tokens = (user.tokens || 0) + 1;
    user.lastTokenGrant = now;
    return;
  }

  const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if (diffDays >= 1) {
    user.tokens = (user.tokens || 0) + diffDays;
    user.lastTokenGrant = now;
  }
}

function sumDailyStake(username) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const bets = (lowdb.data.bets || []).filter((b) => b.username === username && new Date(b.createdAt) >= startOfDay);
  return bets.reduce((s, b) => s + (b.stake || 0), 0);
}

function simplifyOdds(rawGames, sportLabel) {
  return rawGames.map((game) => {
    const home = game.home_team;
    const away = game.away_team;

    const odds = [];

    game.bookmakers?.forEach((book) => {
      book.markets?.forEach((market) => {
        // Head-to-Head / Moneyline
        if (market.key === "h2h") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "moneyline",
              team: outcome.name,
              line: null,
              price: outcome.price
            });
          });
        }

        // Spreads
        if (market.key === "spreads") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "spread",
              team: outcome.name,
              line: outcome.point,
              price: outcome.price
            });
          });
        }

        // Totals (Over / Under)
        if (market.key === "totals") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "total",
              side: outcome.name.toLowerCase(), // over / under
              line: outcome.point,
              price: outcome.price
            });
          });
        }
      });
    });

    return {
      id: `${sportLabel}-${home}-${away}`.toLowerCase().replace(/\s+/g, "-"),
      eventId: game.id || game.key || null,
      sport: sportLabel,
      homeTeam: home,
      awayTeam: away,
      startTime: game.commence_time,
      odds
};
  });
}

function generateTestOdds(sportKey, sportLabel) {
  const now = Date.now();
  const teamsBySport = {
    nba: ["Boston Celtics", "New York Knicks", "Miami Heat", "LA Lakers", "Golden State Warriors", "Denver Nuggets"],
    nfl: ["New England Patriots", "Kansas City Chiefs", "San Francisco 49ers", "Dallas Cowboys", "Buffalo Bills", "Philadelphia Eagles"],
    mlb: ["New York Yankees", "Boston Red Sox", "Los Angeles Dodgers", "Chicago Cubs", "Houston Astros", "Atlanta Braves"],
    nhl: ["Boston Bruins", "Toronto Maple Leafs", "New York Rangers", "Vegas Golden Knights", "Colorado Avalanche", "Tampa Bay Lightning"],
    ncaaf: ["Alabama Crimson Tide", "Georgia Bulldogs", "Ohio State Buckeyes", "Michigan Wolverines", "Texas Longhorns", "Notre Dame Fighting Irish"],
    ncaab: ["Duke Blue Devils", "North Carolina Tar Heels", "Kansas Jayhawks", "Kentucky Wildcats", "UCLA Bruins", "Gonzaga Bulldogs"]
  };

  const teams = teamsBySport[sportKey] || ["Home Team", "Away Team", "City A", "City B", "City C", "City D"];
  const games = [];

  for (let i = 0; i < 3; i += 1) {
    const homeTeam = teams[i * 2] || teams[0];
    const awayTeam = teams[i * 2 + 1] || teams[1];
    const startTime = new Date(now + (i + 1) * 60 * 60 * 1000).toISOString();
    const eventId = `test-${sportKey}-${i}-${now}`;

    games.push({
      id: eventId,
      eventId,
      sport: sportLabel,
      homeTeam,
      awayTeam,
      startTime,
      odds: [
        { book: "test", market: "moneyline", team: homeTeam, line: null, price: -120 },
        { book: "test", market: "moneyline", team: awayTeam, line: null, price: 110 },
        { book: "test", market: "spread", team: homeTeam, line: -2.5, price: -110 },
        { book: "test", market: "spread", team: awayTeam, line: 2.5, price: -110 },
        { book: "test", market: "total", side: "over", line: 44.5, price: -110 },
        { book: "test", market: "total", side: "under", line: 44.5, price: -110 }
      ]
    });
  }

  return games;
}

app.get("/", (req, res) => {
  res.send("Whistle backend is running 🏈");
});

app.get("/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    facebookAppId: process.env.FACEBOOK_APP_ID || "",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ""
  });
}); 
app.post("/users", express.json(), async (req, res) => {
  const { username, email = null, password, favoriteSports = [], intent = "competitive" } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password required (minimum 4 characters)" });
  }

  // Check for duplicate username
  const existing = dbGetUser(username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists" });
  }

  try {
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: username,
      username,
      email,
      passwordHash,
      favoriteSports,
      intent,
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date()
    };

    const created = await dbCreateUser(user);
    // Don't return passwordHash to client
    const { passwordHash: _, ...safeUser } = created;
    res.json(safeUser);
  } catch (err) {
    console.error('Error registering user:', err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login endpoint
app.post("/auth/login", express.json(), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = dbGetUser(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  try {
    const passwordMatch = await bcrypt.compare(password, user.passwordHash || "");
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Grant daily tokens on login
    grantDailyTokens(user);
    await dbUpdateUser(user);

    // Don't return passwordHash to client
    const { passwordHash: _, ...safeUser } = user;
    res.json({ message: "Login successful", user: safeUser });
  } catch (err) {
    console.error('Error logging in user:', err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot Password endpoint - generate reset token
app.post("/auth/forgot-password", express.json(), async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }

  const user = dbGetUser(username);
  if (!user) {
    // Don't reveal if username exists (security best practice)
    return res.status(200).json({ message: "If username exists, reset link will be sent" });
  }

  try {
    const token = await createResetToken(username);
    
    // In production, send email with reset link
    // For now, return the token so user can test it
    const resetLink = `http://localhost:3000/app.html?reset=${token}`;
    
    console.log(`[Password Reset] User: ${username}, Token: ${token}, Link: ${resetLink}`);
    
    res.json({
      message: "Password reset link generated",
      resetLink: resetLink, // For testing only - in production, send via email
      token: token // For testing only
    });
  } catch (err) {
    console.error('Error generating reset token:', err.message);
    res.status(500).json({ error: "Failed to generate reset link" });
  }
});

// Reset Password endpoint - validate token and set new password
app.post("/auth/reset-password/:token", express.json(), async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Reset token required" });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password required (minimum 4 characters)" });
  }

  try {
    const username = await validateResetToken(token);
    if (!username) {
      return res.status(401).json({ error: "Invalid or expired reset token" });
    }

    const user = dbGetUser(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hash and save new password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    await dbUpdateUser(user);

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error('Error resetting password:', err.message);
    res.status(500).json({ error: "Password reset failed" });
  }
});

// Facebook OAuth endpoint
app.post("/auth/facebook", express.json(), async (req, res) => {
  const { accessToken, favoriteSports = [], intent = "competitive" } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: "Access token required" });
  }

  const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
  const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.error('Facebook credentials not configured in .env');
    return res.status(500).json({ error: "Facebook authentication not configured" });
  }

  try {
    // Verify Facebook access token by fetching user info
    const fbResponse = await axios.get('https://graph.facebook.com/me', {
      params: {
        access_token: accessToken,
        fields: 'id,name,email,picture'
      }
    });

    const { id: facebookId, name, email } = fbResponse.data;

    if (!facebookId) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }

    // Try to find user by Facebook social profile
    const users = lowdb.data.users || [];
    let user = users.find((u) => u.socialProfiles && u.socialProfiles.facebook === facebookId);

    if (user) {
      // Existing Facebook user - just grant daily tokens and return
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false });
    }

    // Check if email already exists (if Facebook provided it)
    if (email) {
      user = users.find((u) => u.email === email);
      if (user) {
        // Email exists - link Facebook profile to existing account
        user.socialProfiles = user.socialProfiles || {};
        user.socialProfiles.facebook = facebookId;
        if (!user.email) user.email = email;
        grantDailyTokens(user);
        await dbUpdateUser(user);
        const { passwordHash: _, ...safeUser } = user;
        return res.json({ user: safeUser, created: false, linked: true });
      }
    }

    // New user - create account from Facebook profile
    // Generate username from email or name
    let baseUsername = email ? email.split('@')[0] : name.toLowerCase().replace(/\s+/g, '');
    let username = baseUsername;
    let counter = 1;
    while (dbGetUser(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newUser = {
      id: username,
      username,
      email: email || null,
      favoriteSports: favoriteSports && favoriteSports.length > 0 ? favoriteSports : [],
      intent: intent || "competitive",
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date(),
      socialProfiles: { facebook: facebookId }
    };

    const created = await dbCreateUser(newUser);
    const { passwordHash: _, ...safeUser } = created;
    res.json({ user: safeUser, created: true });
  } catch (err) {
    console.error('Facebook OAuth error:', err.message);
    if (err.response?.status === 400) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }
    res.status(401).json({ error: "Facebook authentication failed" });
  }
});


app.post("/auth/google", express.json(), async (req, res) => {
  const { idToken, favoriteSports = [], intent = "competitive" } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "ID token required" });
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID not configured in .env');
    return res.status(500).json({ error: "Google authentication not configured" });
  }

  try {
    // Verify Google ID token (no client secret needed for web apps with public client ID)
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub; // Google's unique user ID
    const email = payload.email;
    const name = payload.name || email;

    // Try to find user by Google social profile
    const users = lowdb.data.users || [];
    let user = users.find((u) => u.socialProfiles && u.socialProfiles.google === googleId);

    if (user) {
      // Existing Google user - just grant daily tokens and return
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false });
    }

    // Check if email already exists as a password-based account
    user = users.find((u) => u.email === email);
    if (user) {
      // Email exists - link Google profile to existing account
      user.socialProfiles = user.socialProfiles || {};
      user.socialProfiles.google = googleId;
      if (!user.email) user.email = email;
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false, linked: true });
    }

    // New user - create account from Google profile
    // Generate username from email (before @) or name
    let baseUsername = email.split('@')[0] || name.toLowerCase().replace(/\s+/g, '');
    let username = baseUsername;
    let counter = 1;
    while (dbGetUser(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newUser = {
      id: username,
      username,
      email,
      favoriteSports: favoriteSports && favoriteSports.length > 0 ? favoriteSports : [],
      intent: intent || "competitive",
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date(),
      socialProfiles: { google: googleId }
    };

    const created = await dbCreateUser(newUser);
    const { passwordHash: _, ...safeUser } = created;
    res.json({ user: safeUser, created: true });
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.status(401).json({ error: "Invalid token or Google authentication failed" });
  }
});

app.get("/odds", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.the-odds-api.com/v4/sports/basketball_nba/odds",
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: "us",
          markets: "h2h,spreads",
          oddsFormat: "american"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[/odds] Axios error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: error.config ? { url: error.config.url, method: error.config.method } : null
    });
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});
app.get("/odds/simple", async (req, res) => {
  try {
   const sportParam = req.query.sport || "nba";
const sport = SPORTS[sportParam];

if (!sport) {
  return res.status(400).json({ error: "Unsupported sport" });
}

console.log("SPORT REQUESTED:", sportParam, "→", sport.key);

    if (!process.env.ODDS_API_KEY) {
      return res.json(generateTestOdds(sportParam, sport.label));
    }

    // Request markets for all sports
    const params = {
      apiKey: process.env.ODDS_API_KEY,
      regions: "us",
      markets: "h2h,spreads,totals",
      oddsFormat: "american"
    };

    const response = await axios.get(
      `https://api.the-odds-api.com/v4/sports/${sport.key}/odds`,
      { params }
    );

    // Ensure response.data is an array
    const gamesArray = Array.isArray(response.data) ? response.data : [];
    const now = new Date();
    const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcomingToday = gamesArray.filter((game) => {
      if (!game.commence_time) return false;
      const start = new Date(game.commence_time);
      return start > now && start <= cutoff;
    });
    
    // Debug: log available markets
    if (gamesArray.length > 0) {
      const markets = gamesArray[0].bookmakers?.[0]?.markets?.map(m => m.key) || [];
      console.log(`[${sportParam.toUpperCase()}] Available markets:`, markets);
    }
    
    const simplified = simplifyOdds(upcomingToday, sport.label);
    res.json(simplified);
  } catch (error) {
    console.error('[/odds/simple] Axios error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: error.config ? { url: error.config.url, method: error.config.method } : null
    });
    // Return empty array to avoid showing stale test games when live odds are enabled
    res.json([]);
  }
});


// Return all users
app.get("/users", requireAdmin, (req, res) => {
  const all = dbGetAllUsers().map((u) => {
    const { passwordHash: _passwordHash, ...safeUser } = u;
    return safeUser;
  });
  res.json(all);
});

// Return single user and grant daily tokens when fetched
app.get("/users/:username", async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  grantDailyTokens(user);
  await dbUpdateUser(user);
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// Update user profile
app.put("/users/:username", express.json(), async (req, res) => {
  const username = req.params.username;
  const { favoriteSports = null, avatar = null, intent = null } = req.body;

  const user = dbGetUser(username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Update only provided fields
  if (favoriteSports !== null) {
    user.favoriteSports = Array.isArray(favoriteSports) ? favoriteSports : [favoriteSports];
  }
  if (avatar !== null) {
    user.avatar = avatar; // Store avatar choice (team name or emoji)
  }
  if (intent !== null && ['competitive', 'casual'].includes(intent)) {
    user.intent = intent;
  }

  await dbUpdateUser(user);
  const { passwordHash: _, ...safeUser } = user;
  res.json({ message: "Profile updated", user: safeUser });
});

// Create a bet (user stakes tokens)
app.post("/bets", express.json(), async (req, res) => {
  const { username, sport, eventId = null, market = null, selection, line = null, stake = 1, odds = null } = req.body;

  if (!username || !sport || !selection) {
    return res.status(400).json({ error: "username, sport and selection required" });
  }

  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!Number.isInteger(stake) || stake <= 0) {
    return res.status(400).json({ error: "Stake must be a positive integer" });
  }

  if ((user.tokens || 0) < stake) {
    return res.status(400).json({ error: "Insufficient tokens" });
  }

  // Enforce casual pathway limits
  const intent = (user.intent || "competitive").toLowerCase();
  if (user.lockedUntil) {
    const until = new Date(user.lockedUntil);
    if (until > new Date()) {
      return res.status(403).json({ error: "User is currently locked from betting", lockedUntil: user.lockedUntil });
    }
  }

  // allow custom limits to override pathway
  const custom = user.customLimits || {};

  if (intent === "casual") {
    const cfg = PATHWAYS.casual;

    // Play time restriction
    const now = new Date();
    const hour = now.getHours();
    if (hour < cfg.allowedStartHour || hour >= cfg.allowedEndHour) {
      const msg = `${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]} Play hours: ${cfg.allowedStartHour}:00-${cfg.allowedEndHour}:00.`;
      return res.status(403).json({ error: "Play-time restricted for casual pathway", message: msg });
    }

    // Max per-bet stake (allow custom override)
    const maxPerBet = custom.maxStakePerBet != null ? custom.maxStakePerBet : cfg.maxStakePerBet;
    if (stake > maxPerBet) {
      const msg = `Casual limit: max ${maxPerBet} token(s) per bet. ${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]}`;
      return res.status(403).json({ error: "Stake exceeds casual limit", message: msg });
    }

    // Daily spend limit (allow custom override)
    const daily = sumDailyStake(username);
    const dailyLimit = custom.dailySpendLimit != null ? custom.dailySpendLimit : cfg.dailySpendLimit;
    if ((daily + stake) > dailyLimit) {
      const remaining = Math.max(0, dailyLimit - daily);
      const msg = `Daily casual limit reached or exceeded. Remaining today: ${remaining} token(s). ${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]}`;
      return res.status(403).json({ error: "Daily spend limit exceeded for casual pathway", message: msg });
    }
  }

  // Deduct tokens and persist
  user.tokens = Math.max(0, (user.tokens || 0) - stake);
  await dbUpdateUser(user);

  const betId = `${username}-${Date.now()}`;
  lowdb.data.bets.push({
    id: betId,
    username,
    sport,
    eventId: eventId || null,
    market: market || null,
    selection,
    line: line != null ? Number(line) : null,
    stake,
    odds: odds != null ? odds : null,
    outcome: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null
  });
  await lowdb.write();

  const bet = lowdb.data.bets.find((b) => b.id === betId);
  // Friendly nudge for casual users when bet is accepted
  let note = null;
  if ((user.intent || "competitive").toLowerCase() === "casual") {
    const cfg = PATHWAYS.casual;
    note = cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)];
  }

  res.json({ bet, note });
});

// Get bets for a user
app.get("/bets/:username", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Get active (pending) bets for a user
app.get("/bets/:username/active", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome === "pending").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Get all active (pending) bets
app.get("/bets/active", (req, res) => {
  const rows = (lowdb.data.bets || []).filter((b) => b.outcome === "pending").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Simple stats: win percentage for a user
app.get("/users/:username/stats", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome && b.outcome !== "pending");
  const total = rows.length;
  const wins = rows.filter((r) => r.outcome === "win").length;
  const pct = total === 0 ? 0 : (wins / total) * 100;
  res.json({ username, totalResolved: total, wins, winPercentage: pct });
});

function americanToDecimal(odds) {
  if (odds === 0 || odds == null) return 1;
  const o = Number(odds);
  if (o > 0) return (o / 100) + 1;
  return (100 / Math.abs(o)) + 1;
}

function americanToImpliedProb(odds) {
  const dec = americanToDecimal(odds);
  return 1 / dec;
}

// Resolve pending bets automatically using odds API when possible.
// Extracted into a callable function so it can be used by the HTTP endpoint and a scheduler.
async function resolvePendingBets() {
  const now = new Date();
  const pending = (lowdb.data.bets || []).filter((b) => b.outcome === "pending");
  const resolved = [];

  // Fetch completed events from the Odds API scores endpoint and resolve deterministically.
  // If no ODDS_API_KEY is configured, fall back to admin-submitted `lowdb.data.results`.
  const hasOddsApi = Boolean(process.env.ODDS_API_KEY);

  // Group pending bets by sport to minimize API calls
  const bySport = {};
  for (const b of pending) {
    if (!b.eventId) continue; // only resolve bets that reference an eventId
    const s = (b.sport || '').toLowerCase();
    bySport[s] = bySport[s] || [];
    bySport[s].push(b);
  }

  for (const sportKeyRaw of Object.keys(bySport)) {
    try {
      const sportKey = (SPORTS[sportKeyRaw] && SPORTS[sportKeyRaw].key) || sportKeyRaw;
      let events = [];
      if (hasOddsApi) {
        try {
          const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`, {
            params: {
              apiKey: process.env.ODDS_API_KEY,
              daysFrom: 7,
              regions: 'us'
            },
            timeout: 15000
          });
          events = response.data || [];
        } catch (axiosErr) {
          console.error(`[resolvePendingBets] Axios error for sport ${sportKey}:`, {
            message: axiosErr.message,
            status: axiosErr.response?.status,
            statusText: axiosErr.response?.statusText,
            data: axiosErr.response?.data,
            config: axiosErr.config ? { url: axiosErr.config.url, method: axiosErr.config.method } : null
          });
          // Fall back to admin results instead of throwing
          console.log(`[resolvePendingBets] Falling back to admin-submitted results for ${sportKeyRaw}`);
          events = (lowdb.data.results || []).filter((r) => (r.sport || '').toLowerCase() === sportKeyRaw.toLowerCase());
        }
      } else {
        // fallback to admin-submitted results stored in lowdb
        events = (lowdb.data.results || []).filter((r) => (r.sport || '').toLowerCase() === sportKeyRaw.toLowerCase());
      }
      // Build map by event id (support multiple id field names)
      const eventMap = new Map();
      for (const e of events) {
        const id = e.id || e.key || e.event_id || e.event_key;
        if (!id) continue;
        eventMap.set(String(id), e);
      }

      for (const bet of bySport[sportKeyRaw]) {
        try {
          const eid = bet.eventId && String(bet.eventId);
          const ev = eventMap.get(eid);
          if (!ev) continue; // no official event found

          // check event status - only resolve if completed/closed
          // Admin-submitted results have homeScore/awayScore and should be treated as complete
          const hasAdminScore = typeof ev.homeScore === 'number' && typeof ev.awayScore === 'number';
          const status = ev.status || ev.completed || ev.is_complete || ev.state;
          const isCompleted = hasAdminScore || status === 'closed' || status === 'completed' || status === true || ev.completed === true || ev.is_complete === true;
          if (!isCompleted) continue;

          // extract final scores robustly
          let homeScore = null;
          let awayScore = null;
          if (typeof ev.home_score === 'number' && typeof ev.away_score === 'number') {
            homeScore = Number(ev.home_score);
            awayScore = Number(ev.away_score);
          } else if (typeof ev.homeScore === 'number' && typeof ev.awayScore === 'number') {
            homeScore = Number(ev.homeScore);
            awayScore = Number(ev.awayScore);
          } else if (ev.scores && Array.isArray(ev.scores)) {
            // try to find by side
            const homeObj = ev.scores.find((x) => (x.name || '').toLowerCase().includes((ev.home_team || ev.homeTeam || '').toLowerCase())) || ev.scores[0];
            const awayObj = ev.scores.find((x) => (x.name || '').toLowerCase().includes((ev.away_team || ev.awayTeam || '').toLowerCase())) || ev.scores[1] || ev.scores[0];
            homeScore = homeObj ? Number(homeObj.score || homeObj.points || 0) : 0;
            awayScore = awayObj ? Number(awayObj.score || awayObj.points || 0) : 0;
          } else if (ev.away_scores || ev.home_scores) {
            homeScore = Number(ev.home_scores || ev.homeScore || 0);
            awayScore = Number(ev.away_scores || ev.awayScore || 0);
          } else {
            // as a last resort, try common keys
            homeScore = Number(ev.home || ev.homeTeamScore || 0);
            awayScore = Number(ev.away || ev.awayTeamScore || 0);
          }

          if (homeScore == null || awayScore == null) continue;

          // Determine outcome based on market
          let outcome = 'loss';
          let payout = 0;

          const market = (bet.market || 'h2h').toLowerCase();
          const selection = (bet.selection || '').toLowerCase();

          if (market === 'total' || market === 'totals') {
            const total = Number(homeScore) + Number(awayScore);
            const line = Number(bet.line || 0);
            // determine over/under from selection text
            if (selection.includes('over')) {
              if (total > line) outcome = 'win';
              else if (total === line) outcome = 'push';
              else outcome = 'loss';
            } else if (selection.includes('under')) {
              if (total < line) outcome = 'win';
              else if (total === line) outcome = 'push';
              else outcome = 'loss';
            } else {
              // fallback - compare to home/away inclusion
              const winner = homeScore > awayScore ? ev.home_team || ev.homeTeam || '' : ev.away_team || ev.awayTeam || '';
              outcome = selection.includes((winner || '').toLowerCase()) ? 'win' : 'loss';
            }
          } else if (market === 'spread') {
            const line = Number(bet.line || 0);
            const homeAdj = Number(homeScore) + (selection.includes((ev.home_team || ev.homeTeam || '').toLowerCase()) ? line : 0);
            const awayAdj = Number(awayScore) + (selection.includes((ev.away_team || ev.awayTeam || '').toLowerCase()) ? line : 0);
            // If selection is a team name, check its adjusted margin
            if (homeAdj > awayAdj && selection.includes((ev.home_team || ev.homeTeam || '').toLowerCase())) outcome = 'win';
            else if (awayAdj > homeAdj && selection.includes((ev.away_team || ev.awayTeam || '').toLowerCase())) outcome = 'win';
            else if (homeAdj === awayAdj) outcome = 'push';
            else outcome = 'loss';
          } else {
            // default: head-to-head winner
            if (homeScore === awayScore) {
              outcome = 'push';
            } else {
              const winner = homeScore > awayScore ? (ev.home_team || ev.homeTeam || '') : (ev.away_team || ev.awayTeam || '');
              outcome = selection.includes((winner || '').toLowerCase()) ? 'win' : 'loss';
            }
          }

          if (outcome === 'win') {
            const multiplier = bet.odds ? americanToDecimal(bet.odds) : 2;
            payout = Math.max(1, Math.floor((bet.stake || 0) * multiplier));
          } else if (outcome === 'push') {
            payout = bet.stake || 0;
          }

          // apply resolution
          bet.outcome = outcome;
          bet.resolvedAt = new Date().toISOString();
          bet.payout = payout;

          const user = dbGetUser(bet.username);
          if (user) {
            if (outcome === 'win') {
              user.tokens = (user.tokens || 0) + payout;
              const lastWin = user.lastWinDate ? new Date(user.lastWinDate) : null;
              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(today.getDate() - 1);

              const lastWinDay = lastWin ? lastWin.toDateString() : null;
              if (lastWinDay === yesterday.toDateString()) {
                user.currentStreak = (user.currentStreak || 0) + 1;
              } else if (lastWinDay === today.toDateString()) {
                user.currentStreak = user.currentStreak || 1;
              } else {
                user.currentStreak = 1;
              }
              if ((user.currentStreak || 0) > (user.bestStreak || 0)) user.bestStreak = user.currentStreak;
              user.lastWinDate = today.toISOString();
            } else if (outcome === 'push') {
              user.tokens = (user.tokens || 0) + payout;
            } else {
              user.currentStreak = 0;
            }
            await dbUpdateUser(user);
          }

          resolved.push({ id: bet.id, username: bet.username, outcome: bet.outcome, payout: bet.payout });
        } catch (innerErr) {
          console.error('Error resolving bet', bet.id, innerErr.message);
        }
      }
    } catch (err) {
      console.warn('Failed fetching scores for sport', sportKeyRaw, err.message);
    }
  }

  // persist bets updates
  await lowdb.write();

  return { resolvedCount: resolved.length, resolved };
}

// HTTP endpoint wraps the resolver
app.post("/resolve-bets", async (req, res) => {
  try {
    const result = await resolvePendingBets();
    res.json(result);
  } catch (err) {
    console.error("Resolver failed", err.message);
    res.status(500).json({ error: "Resolver failed" });
  }
});

// Onboarding endpoints
app.get("/onboarding/:username", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ username, onboarding: user.onboarding || { completed: false, step: 0 } });
});

app.put("/onboarding/:username", express.json(), async (req, res) => {
  const username = req.params.username;
  const { step, completed } = req.body;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.onboarding = user.onboarding || { completed: false, step: 0 };
  if (step !== undefined) user.onboarding.step = step;
  if (completed !== undefined) user.onboarding.completed = completed;
  await dbUpdateUser(user);
  res.json({ username, onboarding: user.onboarding });
});

// Simple social auth endpoints (demo-friendly):
// POST /auth/:provider/login  { externalId, username, favoriteSport?, intent? }
// This is a lightweight demo flow: it links an external id to a local user record.
async function handleSocialLogin(provider, payload) {
  const { externalId, username, favoriteSport, intent } = payload;

  if (!externalId) {
    return { status: 400, body: { error: 'externalId required' } };
  }

  // find user by social profile
  const users = lowdb.data.users || [];
  let user = users.find((u) => u.socialProfiles && u.socialProfiles[provider] === externalId);

  if (!user) {
    // if username provided and exists, attach profile; otherwise create new user
    if (username) user = dbGetUser(username);
    if (!user) {
      const newUser = {
        id: username || `${provider}-${externalId}`,
        username: username || `${provider}-${externalId}`,
        favoriteSports: favoriteSport ? [favoriteSport] : [],
        intent: intent || 'competitive',
        tier: 'free',
        tokens: 1,
        lastTokenGrant: new Date(),
        socialProfiles: { [provider]: externalId }
      };

      user = await dbCreateUser(newUser);
      return { status: 200, body: { user, created: true } };
    }

    // attach social profile to existing user
    user.socialProfiles = user.socialProfiles || {};
    user.socialProfiles[provider] = externalId;
    await dbUpdateUser(user);
    return { status: 200, body: { user, created: false, linked: true } };
  }

  // existing linked user
  return { status: 200, body: { user, created: false, linked: true } };
}

app.post('/auth/:provider/login', express.json(), async (req, res) => {
  const provider = req.params.provider;
  const result = await handleSocialLogin(provider, req.body);
  res.status(result.status).json(result.body);
});

// Convenience endpoint to accept a generic social payload
app.post('/auth/social', express.json(), async (req, res) => {
  const { provider, externalId, username, favoriteSport, intent } = req.body;
  if (!provider || !externalId) return res.status(400).json({ error: 'provider and externalId required' });
  const result = await handleSocialLogin(provider, { externalId, username, favoriteSport, intent });
  return res.status(result.status).json(result.body);
});

// Results API: store final game results as source-of-truth for resolving bets
// Admin-protected: POST /admin/results { id, sport, homeTeam, awayTeam, homeScore, awayScore }
app.post('/admin/results', requireAdmin, express.json(), async (req, res) => {
  const { id, sport, homeTeam, awayTeam, homeScore, awayScore, occurredAt } = req.body;
  if (!id || !sport || !homeTeam || !awayTeam || homeScore == null || awayScore == null) {
    return res.status(400).json({ error: 'id, sport, homeTeam, awayTeam, homeScore, awayScore required' });
  }

  const existing = (lowdb.data.results || []).find((r) => r.id === id);
  if (existing) return res.status(400).json({ error: 'Result with id already exists' });

  const row = {
    id,
    sport,
    homeTeam,
    awayTeam,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  lowdb.data.results = lowdb.data.results || [];
  lowdb.data.results.push(row);
  await lowdb.write();

  res.json({ result: row });
});

// Public read endpoints for results
app.get('/results', (req, res) => {
  const sport = req.query.sport;
  let rows = lowdb.data.results || [];
  if (sport) rows = rows.filter((r) => (r.sport || '').toLowerCase() === (sport || '').toLowerCase());
  res.json(rows.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/results/:id', (req, res) => {
  const id = req.params.id;
  const r = (lowdb.data.results || []).find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: 'Result not found' });
  res.json(r);
});

// Streak endpoint
app.get("/users/:username/streak", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ username, currentStreak: user.currentStreak || 0, bestStreak: user.bestStreak || 0, lastWinDate: user.lastWinDate || null });
});

// Leaderboard endpoint
app.get("/leaderboard", (req, res) => {
  const metric = req.query.metric || "wins"; // wins, tokens, streak
  const limit = parseInt(req.query.limit || "10", 10);

  const users = dbGetAllUsers();

  // compute wins from bets
  const winsByUser = {};
  for (const b of (lowdb.data.bets || [])) {
    if (b.outcome === "win") winsByUser[b.username] = (winsByUser[b.username] || 0) + 1;
  }

  let sorted = users.map((u) => ({
    username: u.username,
    tokens: u.tokens || 0,
    wins: winsByUser[u.username] || 0,
    streak: u.currentStreak || 0
  }));

  if (metric === "tokens") sorted.sort((a, b) => b.tokens - a.tokens);
  else if (metric === "streak") sorted.sort((a, b) => b.streak - a.streak);
  else sorted.sort((a, b) => b.wins - a.wins);

  res.json(sorted.slice(0, limit));
});

// Social share: returns a short shareable summary for a user
app.get("/share/:username", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  // compute wins
  const wins = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome === "win").length;
  const totalResolved = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome && b.outcome !== "pending").length;

  const summary = `${username} — ${wins}/${totalResolved} wins. Current streak: ${user.currentStreak || 0}. Tokens: ${user.tokens || 0}`;
  // simple encoded link (client can expand into nicer UI)
  const shareUrl = `https://example.com/share?u=${encodeURIComponent(username)}&s=${encodeURIComponent(summary)}`;

  res.json({ summary, shareUrl });
});

// Pathways config
app.get("/pathways", (req, res) => {
  res.json(PATHWAYS);
});

// Scheduler: resolve pending bets periodically
const RESOLVE_INTERVAL_MS = process.env.RESOLVE_INTERVAL_MS ? Number(process.env.RESOLVE_INTERVAL_MS) : 5 * 60 * 1000;
setInterval(() => {
  resolvePendingBets().catch((err) => console.error("Scheduled resolver error:", err.message));
}, RESOLVE_INTERVAL_MS);

// Run once on startup (non-blocking)
resolvePendingBets().catch(() => {});

// Admin endpoints (protected)
app.use('/admin', requireAdmin);

app.get("/admin/bets/pending", (req, res) => {
  const rows = (lowdb.data.bets || []).filter((b) => b.outcome === "pending");
  res.json(rows);
});

app.post("/admin/bets/:id/resolve", express.json(), async (req, res) => {
  const id = req.params.id;
  const { outcome, payout = null } = req.body;
  const bet = (lowdb.data.bets || []).find((b) => b.id === id);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  if (!["win", "loss"].includes(outcome)) return res.status(400).json({ error: "Invalid outcome" });

  bet.outcome = outcome;
  bet.resolvedAt = new Date().toISOString();
  if (outcome === "win") {
    if (payout != null) {
      bet.payout = payout;
    } else {
      // calculate payout using stored odds when available (decimal multiplier includes stake)
      const multiplier = bet.odds ? americanToDecimal(bet.odds) : 2;
      bet.payout = Math.max(1, Math.floor((bet.stake || 0) * multiplier));
    }
  } else {
    bet.payout = 0;
  }

  // update user tokens
  const user = dbGetUser(bet.username);
  if (user && bet.outcome === "win") {
    user.tokens = Math.max(0, (user.tokens || 0) + bet.payout);
    await dbUpdateUser(user);
  }

  await lowdb.write();
  res.json({ bet });
});

app.post("/admin/users/:username/lock", express.json(), async (req, res) => {
  const username = req.params.username;
  const { until } = req.body; // ISO timestamp or minutes from now
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  let lockUntil = null;
  if (!until) {
    return res.status(400).json({ error: "Provide 'until' as ISO timestamp or minutes" });
  }
  // if numeric, treat as minutes
  if (!isNaN(Number(until))) {
    lockUntil = new Date(Date.now() + Number(until) * 60 * 1000).toISOString();
  } else {
    lockUntil = new Date(until).toISOString();
  }

  user.lockedUntil = lockUntil;
  await dbUpdateUser(user);
  res.json({ username, lockedUntil: lockUntil });
});

app.post("/admin/users/:username/unlock", express.json(), async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.lockedUntil = null;
  await dbUpdateUser(user);
  res.json({ username, unlocked: true });
});

// User settings endpoint
app.put("/users/:username/settings", express.json(), async (req, res) => {
  const username = req.params.username;
  const { intent, customLimits, lockedUntil, supportContact } = req.body;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (intent) user.intent = intent;
  if (customLimits) user.customLimits = customLimits;
  if (supportContact) user.supportContact = supportContact;
  if (lockedUntil !== undefined) user.lockedUntil = lockedUntil;

  await dbUpdateUser(user);
  res.json({ username, settings: { intent: user.intent, customLimits: user.customLimits, lockedUntil: user.lockedUntil, supportContact: user.supportContact } });
});

// Create Stripe checkout session for premium upgrade
app.post("/users/:username/premium-checkout", express.json(), async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Check if already premium
  if (user.premium) {
    return res.status(400).json({ error: "User is already premium" });
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email || undefined,
      client_reference_id: username,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Whistle Premium - 1000 Tokens',
              description: '1000 tokens for premium betting access'
            },
            unit_amount: 999 // $9.99 in cents
          },
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/app.html?upgrade-success=true`,
      cancel_url: `${baseUrl}/app.html?upgrade-canceled=true`
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
});

// Webhook endpoint for Stripe payment events
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const username = session.client_reference_id;
    
    if (username) {
      const user = dbGetUser(username);
      if (user) {
        // Upgrade user to premium
        user.premium = true;
        user.premiumSince = new Date().toISOString();
        user.tokens = (user.tokens || 0) + 1000;
        user.stripeCustomerId = session.customer;
        await dbUpdateUser(user);
        console.log(`[Stripe] Upgraded ${username} to premium after payment`);
      }
    }
  }

  res.json({ received: true });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', {
    message: err.message,
    status: err.status,
    stack: err.stack
  });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/**
 * Initialize ESPN scraper to run in background
 * Runs immediately on startup, then every 30 minutes
 */
function initializeScraperSchedule() {
  console.log('[SCRAPER] Initializing ESPN score scraper...');
  
  // Run immediately on startup
  runScraper()
    .catch(err => console.error('[SCRAPER] Initial run failed:', err.message));
  
  // Run periodically every 30 minutes
  const SCRAPER_INTERVAL = 30 * 60 * 1000; // 30 minutes
  setInterval(() => {
    console.log('[SCRAPER] Running scheduled scraper...');
    runScraper()
      .catch(err => console.error('[SCRAPER] Scheduled run failed:', err.message));
  }, SCRAPER_INTERVAL);
  
  console.log('[SCRAPER] Scraper will run every 30 minutes');
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  
  // Start scraper after server is ready
  initializeScraperSchedule();
});
=======
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import Stripe from "stripe";
import { runScraper } from "./scrapers/espn-scraper.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Initialize Stripe (requires STRIPE_SECRET_KEY in .env)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve a tiny frontend for onboarding + sharing
app.use(express.static("public"));

// Admin auth middleware: require ADMIN_TOKEN env var or default dev token.
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || req.headers['x-admin-token'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const expected = process.env.ADMIN_TOKEN || 'dev-admin-token';
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized - admin token required' });
  }
  next();
}
const SPORTS = {
  nba: { key: "basketball_nba", label: "NBA" },
  nfl: { key: "americanfootball_nfl", label: "NFL" },
  ncaaf: { key: "americanfootball_ncaaf", label: "College Football" },
  ncaab: { key: "basketball_ncaab", label: "College Basketball" },
  mlb: { key: "baseball_mlb", label: "MLB" },
  ncaa_baseball: { key: "baseball_ncaa", label: "College Baseball" },
  nhl: { key: "icehockey_nhl", label: "NHL" },
  soccer: { key: "soccer_epl", label: "Soccer (EPL)" },
  tennis: { key: "tennis_atp", label: "Tennis" },
  golf: { key: "golf", label: "Golf" }
};

// Pathway / support settings
const PATHWAYS = {
  competitive: {
    id: "competitive",
    description: "Light, optional play with no special limits."
  },
  casual: {
    id: "casual",
    description: "Assistance pathway: strict limits and play-time restrictions to support healthy play.",
    maxStakePerBet: 1,
    dailySpendLimit: 5,
    allowedStartHour: 10, // 10:00 local
    allowedEndHour: 20, // 20:00 local
    encouragements: [
      "You got this — one step at a time. Try a walk instead! 🚶",
      "Remember: betting won't fix feelings. Maybe call a friend? ☎️",
      "Treat yourself to a snack, not a bet. Snacks > regrets. 🍪"
    ]
  }
};

// Persist users and bets to a local SQLite database
fs.mkdirSync("data", { recursive: true });
const adapter = new JSONFile("data/db.json");
const lowdb = new Low(adapter, { users: [], bets: [], results: [], resetTokens: [] });

// Initialize the JSON DB (top-level await is supported in modern Node ESM)
await lowdb.read();
if (!lowdb.data.results) lowdb.data.results = [];
if (!lowdb.data.resetTokens) lowdb.data.resetTokens = [];
await lowdb.write();

function serializeFavorites(fav) {
  return fav || [];
}

// Generate a random reset token
function generateResetToken() {
  return Math.random().toString(36).substr(2, 32) + Date.now().toString(36);
}

// Create a password reset token
async function createResetToken(username) {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  lowdb.data.resetTokens = lowdb.data.resetTokens || [];
  lowdb.data.resetTokens.push({
    token,
    username,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  await lowdb.write();
  
  return token;
}

// Validate and consume reset token
async function validateResetToken(token) {
  if (!lowdb.data.resetTokens) return null;
  
  const idx = lowdb.data.resetTokens.findIndex((t) => t.token === token);
  if (idx === -1) return null;
  
  const resetToken = lowdb.data.resetTokens[idx];
  const now = new Date();
  const expiresAt = new Date(resetToken.expiresAt);
  
  if (now > expiresAt) {
    // Token expired - remove it
    lowdb.data.resetTokens.splice(idx, 1);
    await lowdb.write();
    return null;
  }
  
  // Token is valid - consume it
  const username = resetToken.username;
  lowdb.data.resetTokens.splice(idx, 1);
  await lowdb.write();
  
  return username;
}

function dbGetUser(username) {
  const row = (lowdb.data.users || []).find((u) => u.username === username);
  if (!row) return null;
  return { ...row };
}

function dbGetAllUsers() {
  return (lowdb.data.users || []).map((u) => ({ ...u }));
}

async function dbCreateUser(user) {
  lowdb.data.users.push({
    id: user.id,
    username: user.username,
    email: user.email || null,
    passwordHash: user.passwordHash, // store hashed password
    avatar: user.avatar || null, // team avatar/logo
    favoriteSports: serializeFavorites(user.favoriteSports),
    intent: user.intent,
    tier: user.tier,
    tokens: user.tokens,
    premium: user.premium || false,
    premiumSince: user.premiumSince || null,
    stripeCustomerId: user.stripeCustomerId || null,
    lastTokenGrant: user.lastTokenGrant ? new Date(user.lastTokenGrant).toISOString() : null,
    socialProfiles: user.socialProfiles || {},
    customLimits: user.customLimits || null,
    lockedUntil: user.lockedUntil || null,
    supportContact: user.supportContact || null,
    // streak & onboarding
    currentStreak: 0,
    bestStreak: 0,
    lastWinDate: null,
    onboarding: user.onboarding || { completed: false, step: 0 },
    createdAt: new Date().toISOString()
  });
  await lowdb.write();
  return dbGetUser(user.username);
}

async function dbUpdateUser(user) {
  const idx = (lowdb.data.users || []).findIndex((u) => u.username === user.username);
  if (idx === -1) return;
  lowdb.data.users[idx] = {
    ...lowdb.data.users[idx],
    passwordHash: user.passwordHash || lowdb.data.users[idx].passwordHash,
    email: user.email || lowdb.data.users[idx].email || null,
    avatar: user.avatar !== undefined ? user.avatar : (lowdb.data.users[idx].avatar || null),
    favoriteSports: serializeFavorites(user.favoriteSports),
    intent: user.intent,
    tier: user.tier,
    tokens: (typeof user.tokens === 'number') ? Math.max(0, user.tokens) : (lowdb.data.users[idx].tokens || 0),
    premium: user.premium !== undefined ? user.premium : (lowdb.data.users[idx].premium || false),
    premiumSince: user.premiumSince || (lowdb.data.users[idx].premiumSince || null),
    stripeCustomerId: user.stripeCustomerId || (lowdb.data.users[idx].stripeCustomerId || null),
    lastTokenGrant: user.lastTokenGrant ? new Date(user.lastTokenGrant).toISOString() : null,
    customLimits: user.customLimits || lowdb.data.users[idx].customLimits || null,
    socialProfiles: user.socialProfiles || lowdb.data.users[idx].socialProfiles || {},
    lockedUntil: user.lockedUntil || lowdb.data.users[idx].lockedUntil || null,
    supportContact: user.supportContact || lowdb.data.users[idx].supportContact || null,
    currentStreak: typeof user.currentStreak === 'number' ? user.currentStreak : (lowdb.data.users[idx].currentStreak || 0),
    bestStreak: typeof user.bestStreak === 'number' ? user.bestStreak : (lowdb.data.users[idx].bestStreak || 0),
    lastWinDate: user.lastWinDate || lowdb.data.users[idx].lastWinDate || null,
    onboarding: user.onboarding || lowdb.data.users[idx].onboarding || { completed: false, step: 0 }
  };
  await lowdb.write();
}

function grantDailyTokens(user) {
  const now = new Date();
  const last = user.lastTokenGrant ? new Date(user.lastTokenGrant) : null;

  if (!last) {
    user.tokens = (user.tokens || 0) + 1;
    user.lastTokenGrant = now;
    return;
  }

  const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if (diffDays >= 1) {
    user.tokens = (user.tokens || 0) + diffDays;
    user.lastTokenGrant = now;
  }
}

function sumDailyStake(username) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const bets = (lowdb.data.bets || []).filter((b) => b.username === username && new Date(b.createdAt) >= startOfDay);
  return bets.reduce((s, b) => s + (b.stake || 0), 0);
}

function simplifyOdds(rawGames, sportLabel) {
  return rawGames.map((game) => {
    const home = game.home_team;
    const away = game.away_team;

    const odds = [];

    game.bookmakers?.forEach((book) => {
      book.markets?.forEach((market) => {
        // Head-to-Head / Moneyline
        if (market.key === "h2h") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "moneyline",
              team: outcome.name,
              line: null,
              price: outcome.price
            });
          });
        }

        // Spreads
        if (market.key === "spreads") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "spread",
              team: outcome.name,
              line: outcome.point,
              price: outcome.price
            });
          });
        }

        // Totals (Over / Under)
        if (market.key === "totals") {
          market.outcomes?.forEach((outcome) => {
            odds.push({
              book: book.key,
              market: "total",
              side: outcome.name.toLowerCase(), // over / under
              line: outcome.point,
              price: outcome.price
            });
          });
        }
      });
    });

    return {
      id: `${sportLabel}-${home}-${away}`.toLowerCase().replace(/\s+/g, "-"),
      eventId: game.id || game.key || null,
      sport: sportLabel,
      homeTeam: home,
      awayTeam: away,
      startTime: game.commence_time,
      odds
};
  });
}

function generateTestOdds(sportKey, sportLabel) {
  const now = Date.now();
  const teamsBySport = {
    nba: ["Boston Celtics", "New York Knicks", "Miami Heat", "LA Lakers", "Golden State Warriors", "Denver Nuggets"],
    nfl: ["New England Patriots", "Kansas City Chiefs", "San Francisco 49ers", "Dallas Cowboys", "Buffalo Bills", "Philadelphia Eagles"],
    mlb: ["New York Yankees", "Boston Red Sox", "Los Angeles Dodgers", "Chicago Cubs", "Houston Astros", "Atlanta Braves"],
    nhl: ["Boston Bruins", "Toronto Maple Leafs", "New York Rangers", "Vegas Golden Knights", "Colorado Avalanche", "Tampa Bay Lightning"],
    ncaaf: ["Alabama Crimson Tide", "Georgia Bulldogs", "Ohio State Buckeyes", "Michigan Wolverines", "Texas Longhorns", "Notre Dame Fighting Irish"],
    ncaab: ["Duke Blue Devils", "North Carolina Tar Heels", "Kansas Jayhawks", "Kentucky Wildcats", "UCLA Bruins", "Gonzaga Bulldogs"]
  };

  const teams = teamsBySport[sportKey] || ["Home Team", "Away Team", "City A", "City B", "City C", "City D"];
  const games = [];

  for (let i = 0; i < 3; i += 1) {
    const homeTeam = teams[i * 2] || teams[0];
    const awayTeam = teams[i * 2 + 1] || teams[1];
    const startTime = new Date(now + (i + 1) * 60 * 60 * 1000).toISOString();
    const eventId = `test-${sportKey}-${i}-${now}`;

    games.push({
      id: eventId,
      eventId,
      sport: sportLabel,
      homeTeam,
      awayTeam,
      startTime,
      odds: [
        { book: "test", market: "moneyline", team: homeTeam, line: null, price: -120 },
        { book: "test", market: "moneyline", team: awayTeam, line: null, price: 110 },
        { book: "test", market: "spread", team: homeTeam, line: -2.5, price: -110 },
        { book: "test", market: "spread", team: awayTeam, line: 2.5, price: -110 },
        { book: "test", market: "total", side: "over", line: 44.5, price: -110 },
        { book: "test", market: "total", side: "under", line: 44.5, price: -110 }
      ]
    });
  }

  return games;
}

app.get("/", (req, res) => {
  res.send("Whistle backend is running 🏈");
});

app.get("/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    facebookAppId: process.env.FACEBOOK_APP_ID || "",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ""
  });
}); 
app.post("/users", express.json(), async (req, res) => {
  const { username, email = null, password, favoriteSports = [], intent = "competitive" } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password required (minimum 4 characters)" });
  }

  // Check for duplicate username
  const existing = dbGetUser(username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists" });
  }

  try {
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: username,
      username,
      email,
      passwordHash,
      favoriteSports,
      intent,
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date()
    };

    const created = await dbCreateUser(user);
    // Don't return passwordHash to client
    const { passwordHash: _, ...safeUser } = created;
    res.json(safeUser);
  } catch (err) {
    console.error('Error registering user:', err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login endpoint
app.post("/auth/login", express.json(), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = dbGetUser(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  try {
    const passwordMatch = await bcrypt.compare(password, user.passwordHash || "");
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Grant daily tokens on login
    grantDailyTokens(user);
    await dbUpdateUser(user);

    // Don't return passwordHash to client
    const { passwordHash: _, ...safeUser } = user;
    res.json({ message: "Login successful", user: safeUser });
  } catch (err) {
    console.error('Error logging in user:', err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot Password endpoint - generate reset token
app.post("/auth/forgot-password", express.json(), async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }

  const user = dbGetUser(username);
  if (!user) {
    // Don't reveal if username exists (security best practice)
    return res.status(200).json({ message: "If username exists, reset link will be sent" });
  }

  try {
    const token = await createResetToken(username);
    
    // In production, send email with reset link
    // For now, return the token so user can test it
    const resetLink = `http://localhost:3000/app.html?reset=${token}`;
    
    console.log(`[Password Reset] User: ${username}, Token: ${token}, Link: ${resetLink}`);
    
    res.json({
      message: "Password reset link generated",
      resetLink: resetLink, // For testing only - in production, send via email
      token: token // For testing only
    });
  } catch (err) {
    console.error('Error generating reset token:', err.message);
    res.status(500).json({ error: "Failed to generate reset link" });
  }
});

// Reset Password endpoint - validate token and set new password
app.post("/auth/reset-password/:token", express.json(), async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Reset token required" });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password required (minimum 4 characters)" });
  }

  try {
    const username = await validateResetToken(token);
    if (!username) {
      return res.status(401).json({ error: "Invalid or expired reset token" });
    }

    const user = dbGetUser(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hash and save new password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    await dbUpdateUser(user);

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error('Error resetting password:', err.message);
    res.status(500).json({ error: "Password reset failed" });
  }
});

// Facebook OAuth endpoint
app.post("/auth/facebook", express.json(), async (req, res) => {
  const { accessToken, favoriteSports = [], intent = "competitive" } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: "Access token required" });
  }

  const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
  const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.error('Facebook credentials not configured in .env');
    return res.status(500).json({ error: "Facebook authentication not configured" });
  }

  try {
    // Verify Facebook access token by fetching user info
    const fbResponse = await axios.get('https://graph.facebook.com/me', {
      params: {
        access_token: accessToken,
        fields: 'id,name,email,picture'
      }
    });

    const { id: facebookId, name, email } = fbResponse.data;

    if (!facebookId) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }

    // Try to find user by Facebook social profile
    const users = lowdb.data.users || [];
    let user = users.find((u) => u.socialProfiles && u.socialProfiles.facebook === facebookId);

    if (user) {
      // Existing Facebook user - just grant daily tokens and return
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false });
    }

    // Check if email already exists (if Facebook provided it)
    if (email) {
      user = users.find((u) => u.email === email);
      if (user) {
        // Email exists - link Facebook profile to existing account
        user.socialProfiles = user.socialProfiles || {};
        user.socialProfiles.facebook = facebookId;
        if (!user.email) user.email = email;
        grantDailyTokens(user);
        await dbUpdateUser(user);
        const { passwordHash: _, ...safeUser } = user;
        return res.json({ user: safeUser, created: false, linked: true });
      }
    }

    // New user - create account from Facebook profile
    // Generate username from email or name
    let baseUsername = email ? email.split('@')[0] : name.toLowerCase().replace(/\s+/g, '');
    let username = baseUsername;
    let counter = 1;
    while (dbGetUser(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newUser = {
      id: username,
      username,
      email: email || null,
      favoriteSports: favoriteSports && favoriteSports.length > 0 ? favoriteSports : [],
      intent: intent || "competitive",
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date(),
      socialProfiles: { facebook: facebookId }
    };

    const created = await dbCreateUser(newUser);
    const { passwordHash: _, ...safeUser } = created;
    res.json({ user: safeUser, created: true });
  } catch (err) {
    console.error('Facebook OAuth error:', err.message);
    if (err.response?.status === 400) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }
    res.status(401).json({ error: "Facebook authentication failed" });
  }
});


app.post("/auth/google", express.json(), async (req, res) => {
  const { idToken, favoriteSports = [], intent = "competitive" } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "ID token required" });
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID not configured in .env');
    return res.status(500).json({ error: "Google authentication not configured" });
  }

  try {
    // Verify Google ID token (no client secret needed for web apps with public client ID)
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub; // Google's unique user ID
    const email = payload.email;
    const name = payload.name || email;

    // Try to find user by Google social profile
    const users = lowdb.data.users || [];
    let user = users.find((u) => u.socialProfiles && u.socialProfiles.google === googleId);

    if (user) {
      // Existing Google user - just grant daily tokens and return
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false });
    }

    // Check if email already exists as a password-based account
    user = users.find((u) => u.email === email);
    if (user) {
      // Email exists - link Google profile to existing account
      user.socialProfiles = user.socialProfiles || {};
      user.socialProfiles.google = googleId;
      if (!user.email) user.email = email;
      grantDailyTokens(user);
      await dbUpdateUser(user);
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ user: safeUser, created: false, linked: true });
    }

    // New user - create account from Google profile
    // Generate username from email (before @) or name
    let baseUsername = email.split('@')[0] || name.toLowerCase().replace(/\s+/g, '');
    let username = baseUsername;
    let counter = 1;
    while (dbGetUser(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newUser = {
      id: username,
      username,
      email,
      favoriteSports: favoriteSports && favoriteSports.length > 0 ? favoriteSports : [],
      intent: intent || "competitive",
      tier: "free",
      tokens: 1,
      lastTokenGrant: new Date(),
      socialProfiles: { google: googleId }
    };

    const created = await dbCreateUser(newUser);
    const { passwordHash: _, ...safeUser } = created;
    res.json({ user: safeUser, created: true });
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.status(401).json({ error: "Invalid token or Google authentication failed" });
  }
});

app.get("/odds", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.the-odds-api.com/v4/sports/basketball_nba/odds",
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: "us",
          markets: "h2h,spreads",
          oddsFormat: "american"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[/odds] Axios error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: error.config ? { url: error.config.url, method: error.config.method } : null
    });
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});
app.get("/odds/simple", async (req, res) => {
  try {
   const sportParam = req.query.sport || "nba";
const sport = SPORTS[sportParam];

if (!sport) {
  return res.status(400).json({ error: "Unsupported sport" });
}

console.log("SPORT REQUESTED:", sportParam, "→", sport.key);

    if (!process.env.ODDS_API_KEY) {
      return res.json(generateTestOdds(sportParam, sport.label));
    }

    // Request markets for all sports
    const params = {
      apiKey: process.env.ODDS_API_KEY,
      regions: "us",
      markets: "h2h,spreads,totals",
      oddsFormat: "american"
    };

    const response = await axios.get(
      `https://api.the-odds-api.com/v4/sports/${sport.key}/odds`,
      { params }
    );

    // Ensure response.data is an array
    const gamesArray = Array.isArray(response.data) ? response.data : [];
    const now = new Date();
    const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcomingToday = gamesArray.filter((game) => {
      if (!game.commence_time) return false;
      const start = new Date(game.commence_time);
      return start > now && start <= cutoff;
    });
    
    // Debug: log available markets
    if (gamesArray.length > 0) {
      const markets = gamesArray[0].bookmakers?.[0]?.markets?.map(m => m.key) || [];
      console.log(`[${sportParam.toUpperCase()}] Available markets:`, markets);
    }
    
    const simplified = simplifyOdds(upcomingToday, sport.label);
    res.json(simplified);
  } catch (error) {
    console.error('[/odds/simple] Axios error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: error.config ? { url: error.config.url, method: error.config.method } : null
    });
    // Return empty array to avoid showing stale test games when live odds are enabled
    res.json([]);
  }
});


// Return all users
app.get("/users", requireAdmin, (req, res) => {
  const all = dbGetAllUsers().map((u) => {
    const { passwordHash: _passwordHash, ...safeUser } = u;
    return safeUser;
  });
  res.json(all);
});

// Return single user and grant daily tokens when fetched
app.get("/users/:username", async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  grantDailyTokens(user);
  await dbUpdateUser(user);
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// Update user profile
app.put("/users/:username", express.json(), async (req, res) => {
  const username = req.params.username;
  const { favoriteSports = null, avatar = null, intent = null } = req.body;

  const user = dbGetUser(username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Update only provided fields
  if (favoriteSports !== null) {
    user.favoriteSports = Array.isArray(favoriteSports) ? favoriteSports : [favoriteSports];
  }
  if (avatar !== null) {
    user.avatar = avatar; // Store avatar choice (team name or emoji)
  }
  if (intent !== null && ['competitive', 'casual'].includes(intent)) {
    user.intent = intent;
  }

  await dbUpdateUser(user);
  const { passwordHash: _, ...safeUser } = user;
  res.json({ message: "Profile updated", user: safeUser });
});

// Create a bet (user stakes tokens)
app.post("/bets", express.json(), async (req, res) => {
  const { username, sport, eventId = null, market = null, selection, line = null, stake = 1, odds = null } = req.body;

  if (!username || !sport || !selection) {
    return res.status(400).json({ error: "username, sport and selection required" });
  }

  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!Number.isInteger(stake) || stake <= 0) {
    return res.status(400).json({ error: "Stake must be a positive integer" });
  }

  if ((user.tokens || 0) < stake) {
    return res.status(400).json({ error: "Insufficient tokens" });
  }

  // Enforce casual pathway limits
  const intent = (user.intent || "competitive").toLowerCase();
  if (user.lockedUntil) {
    const until = new Date(user.lockedUntil);
    if (until > new Date()) {
      return res.status(403).json({ error: "User is currently locked from betting", lockedUntil: user.lockedUntil });
    }
  }

  // allow custom limits to override pathway
  const custom = user.customLimits || {};

  if (intent === "casual") {
    const cfg = PATHWAYS.casual;

    // Play time restriction
    const now = new Date();
    const hour = now.getHours();
    if (hour < cfg.allowedStartHour || hour >= cfg.allowedEndHour) {
      const msg = `${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]} Play hours: ${cfg.allowedStartHour}:00-${cfg.allowedEndHour}:00.`;
      return res.status(403).json({ error: "Play-time restricted for casual pathway", message: msg });
    }

    // Max per-bet stake (allow custom override)
    const maxPerBet = custom.maxStakePerBet != null ? custom.maxStakePerBet : cfg.maxStakePerBet;
    if (stake > maxPerBet) {
      const msg = `Casual limit: max ${maxPerBet} token(s) per bet. ${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]}`;
      return res.status(403).json({ error: "Stake exceeds casual limit", message: msg });
    }

    // Daily spend limit (allow custom override)
    const daily = sumDailyStake(username);
    const dailyLimit = custom.dailySpendLimit != null ? custom.dailySpendLimit : cfg.dailySpendLimit;
    if ((daily + stake) > dailyLimit) {
      const remaining = Math.max(0, dailyLimit - daily);
      const msg = `Daily casual limit reached or exceeded. Remaining today: ${remaining} token(s). ${cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)]}`;
      return res.status(403).json({ error: "Daily spend limit exceeded for casual pathway", message: msg });
    }
  }

  // Deduct tokens and persist
  user.tokens = Math.max(0, (user.tokens || 0) - stake);
  await dbUpdateUser(user);

  const betId = `${username}-${Date.now()}`;
  lowdb.data.bets.push({
    id: betId,
    username,
    sport,
    eventId: eventId || null,
    market: market || null,
    selection,
    line: line != null ? Number(line) : null,
    stake,
    odds: odds != null ? odds : null,
    outcome: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null
  });
  await lowdb.write();

  const bet = lowdb.data.bets.find((b) => b.id === betId);
  // Friendly nudge for casual users when bet is accepted
  let note = null;
  if ((user.intent || "competitive").toLowerCase() === "casual") {
    const cfg = PATHWAYS.casual;
    note = cfg.encouragements[Math.floor(Math.random() * cfg.encouragements.length)];
  }

  res.json({ bet, note });
});

// Get bets for a user
app.get("/bets/:username", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Get active (pending) bets for a user
app.get("/bets/:username/active", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome === "pending").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Get all active (pending) bets
app.get("/bets/active", (req, res) => {
  const rows = (lowdb.data.bets || []).filter((b) => b.outcome === "pending").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Simple stats: win percentage for a user
app.get("/users/:username/stats", (req, res) => {
  const username = req.params.username;
  const rows = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome && b.outcome !== "pending");
  const total = rows.length;
  const wins = rows.filter((r) => r.outcome === "win").length;
  const pct = total === 0 ? 0 : (wins / total) * 100;
  res.json({ username, totalResolved: total, wins, winPercentage: pct });
});

function americanToDecimal(odds) {
  if (odds === 0 || odds == null) return 1;
  const o = Number(odds);
  if (o > 0) return (o / 100) + 1;
  return (100 / Math.abs(o)) + 1;
}

function americanToImpliedProb(odds) {
  const dec = americanToDecimal(odds);
  return 1 / dec;
}

// Resolve pending bets automatically using odds API when possible.
// Extracted into a callable function so it can be used by the HTTP endpoint and a scheduler.
async function resolvePendingBets() {
  const now = new Date();
  const pending = (lowdb.data.bets || []).filter((b) => b.outcome === "pending");
  const resolved = [];

  // Fetch completed events from the Odds API scores endpoint and resolve deterministically.
  // If no ODDS_API_KEY is configured, fall back to admin-submitted `lowdb.data.results`.
  const hasOddsApi = Boolean(process.env.ODDS_API_KEY);

  // Group pending bets by sport to minimize API calls
  const bySport = {};
  for (const b of pending) {
    if (!b.eventId) continue; // only resolve bets that reference an eventId
    const s = (b.sport || '').toLowerCase();
    bySport[s] = bySport[s] || [];
    bySport[s].push(b);
  }

  for (const sportKeyRaw of Object.keys(bySport)) {
    try {
      const sportKey = (SPORTS[sportKeyRaw] && SPORTS[sportKeyRaw].key) || sportKeyRaw;
      let events = [];
      if (hasOddsApi) {
        try {
          const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`, {
            params: {
              apiKey: process.env.ODDS_API_KEY,
              daysFrom: 7,
              regions: 'us'
            },
            timeout: 15000
          });
          events = response.data || [];
        } catch (axiosErr) {
          console.error(`[resolvePendingBets] Axios error for sport ${sportKey}:`, {
            message: axiosErr.message,
            status: axiosErr.response?.status,
            statusText: axiosErr.response?.statusText,
            data: axiosErr.response?.data,
            config: axiosErr.config ? { url: axiosErr.config.url, method: axiosErr.config.method } : null
          });
          // Fall back to admin results instead of throwing
          console.log(`[resolvePendingBets] Falling back to admin-submitted results for ${sportKeyRaw}`);
          events = (lowdb.data.results || []).filter((r) => (r.sport || '').toLowerCase() === sportKeyRaw.toLowerCase());
        }
      } else {
        // fallback to admin-submitted results stored in lowdb
        events = (lowdb.data.results || []).filter((r) => (r.sport || '').toLowerCase() === sportKeyRaw.toLowerCase());
      }
      // Build map by event id (support multiple id field names)
      const eventMap = new Map();
      for (const e of events) {
        const id = e.id || e.key || e.event_id || e.event_key;
        if (!id) continue;
        eventMap.set(String(id), e);
      }

      for (const bet of bySport[sportKeyRaw]) {
        try {
          const eid = bet.eventId && String(bet.eventId);
          const ev = eventMap.get(eid);
          if (!ev) continue; // no official event found

          // check event status - only resolve if completed/closed
          // Admin-submitted results have homeScore/awayScore and should be treated as complete
          const hasAdminScore = typeof ev.homeScore === 'number' && typeof ev.awayScore === 'number';
          const status = ev.status || ev.completed || ev.is_complete || ev.state;
          const isCompleted = hasAdminScore || status === 'closed' || status === 'completed' || status === true || ev.completed === true || ev.is_complete === true;
          if (!isCompleted) continue;

          // extract final scores robustly
          let homeScore = null;
          let awayScore = null;
          if (typeof ev.home_score === 'number' && typeof ev.away_score === 'number') {
            homeScore = Number(ev.home_score);
            awayScore = Number(ev.away_score);
          } else if (typeof ev.homeScore === 'number' && typeof ev.awayScore === 'number') {
            homeScore = Number(ev.homeScore);
            awayScore = Number(ev.awayScore);
          } else if (ev.scores && Array.isArray(ev.scores)) {
            // try to find by side
            const homeObj = ev.scores.find((x) => (x.name || '').toLowerCase().includes((ev.home_team || ev.homeTeam || '').toLowerCase())) || ev.scores[0];
            const awayObj = ev.scores.find((x) => (x.name || '').toLowerCase().includes((ev.away_team || ev.awayTeam || '').toLowerCase())) || ev.scores[1] || ev.scores[0];
            homeScore = homeObj ? Number(homeObj.score || homeObj.points || 0) : 0;
            awayScore = awayObj ? Number(awayObj.score || awayObj.points || 0) : 0;
          } else if (ev.away_scores || ev.home_scores) {
            homeScore = Number(ev.home_scores || ev.homeScore || 0);
            awayScore = Number(ev.away_scores || ev.awayScore || 0);
          } else {
            // as a last resort, try common keys
            homeScore = Number(ev.home || ev.homeTeamScore || 0);
            awayScore = Number(ev.away || ev.awayTeamScore || 0);
          }

          if (homeScore == null || awayScore == null) continue;

          // Determine outcome based on market
          let outcome = 'loss';
          let payout = 0;

          const market = (bet.market || 'h2h').toLowerCase();
          const selection = (bet.selection || '').toLowerCase();

          if (market === 'total' || market === 'totals') {
            const total = Number(homeScore) + Number(awayScore);
            const line = Number(bet.line || 0);
            // determine over/under from selection text
            if (selection.includes('over')) {
              if (total > line) outcome = 'win';
              else if (total === line) outcome = 'push';
              else outcome = 'loss';
            } else if (selection.includes('under')) {
              if (total < line) outcome = 'win';
              else if (total === line) outcome = 'push';
              else outcome = 'loss';
            } else {
              // fallback - compare to home/away inclusion
              const winner = homeScore > awayScore ? ev.home_team || ev.homeTeam || '' : ev.away_team || ev.awayTeam || '';
              outcome = selection.includes((winner || '').toLowerCase()) ? 'win' : 'loss';
            }
          } else if (market === 'spread') {
            const line = Number(bet.line || 0);
            const homeAdj = Number(homeScore) + (selection.includes((ev.home_team || ev.homeTeam || '').toLowerCase()) ? line : 0);
            const awayAdj = Number(awayScore) + (selection.includes((ev.away_team || ev.awayTeam || '').toLowerCase()) ? line : 0);
            // If selection is a team name, check its adjusted margin
            if (homeAdj > awayAdj && selection.includes((ev.home_team || ev.homeTeam || '').toLowerCase())) outcome = 'win';
            else if (awayAdj > homeAdj && selection.includes((ev.away_team || ev.awayTeam || '').toLowerCase())) outcome = 'win';
            else if (homeAdj === awayAdj) outcome = 'push';
            else outcome = 'loss';
          } else {
            // default: head-to-head winner
            if (homeScore === awayScore) {
              outcome = 'push';
            } else {
              const winner = homeScore > awayScore ? (ev.home_team || ev.homeTeam || '') : (ev.away_team || ev.awayTeam || '');
              outcome = selection.includes((winner || '').toLowerCase()) ? 'win' : 'loss';
            }
          }

          if (outcome === 'win') {
            const multiplier = bet.odds ? americanToDecimal(bet.odds) : 2;
            payout = Math.max(1, Math.floor((bet.stake || 0) * multiplier));
          } else if (outcome === 'push') {
            payout = bet.stake || 0;
          }

          // apply resolution
          bet.outcome = outcome;
          bet.resolvedAt = new Date().toISOString();
          bet.payout = payout;

          const user = dbGetUser(bet.username);
          if (user) {
            if (outcome === 'win') {
              user.tokens = (user.tokens || 0) + payout;
              const lastWin = user.lastWinDate ? new Date(user.lastWinDate) : null;
              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(today.getDate() - 1);

              const lastWinDay = lastWin ? lastWin.toDateString() : null;
              if (lastWinDay === yesterday.toDateString()) {
                user.currentStreak = (user.currentStreak || 0) + 1;
              } else if (lastWinDay === today.toDateString()) {
                user.currentStreak = user.currentStreak || 1;
              } else {
                user.currentStreak = 1;
              }
              if ((user.currentStreak || 0) > (user.bestStreak || 0)) user.bestStreak = user.currentStreak;
              user.lastWinDate = today.toISOString();
            } else if (outcome === 'push') {
              user.tokens = (user.tokens || 0) + payout;
            } else {
              user.currentStreak = 0;
            }
            await dbUpdateUser(user);
          }

          resolved.push({ id: bet.id, username: bet.username, outcome: bet.outcome, payout: bet.payout });
        } catch (innerErr) {
          console.error('Error resolving bet', bet.id, innerErr.message);
        }
      }
    } catch (err) {
      console.warn('Failed fetching scores for sport', sportKeyRaw, err.message);
    }
  }

  // persist bets updates
  await lowdb.write();

  return { resolvedCount: resolved.length, resolved };
}

// HTTP endpoint wraps the resolver
app.post("/resolve-bets", async (req, res) => {
  try {
    const result = await resolvePendingBets();
    res.json(result);
  } catch (err) {
    console.error("Resolver failed", err.message);
    res.status(500).json({ error: "Resolver failed" });
  }
});

// Onboarding endpoints
app.get("/onboarding/:username", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ username, onboarding: user.onboarding || { completed: false, step: 0 } });
});

app.put("/onboarding/:username", express.json(), async (req, res) => {
  const username = req.params.username;
  const { step, completed } = req.body;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.onboarding = user.onboarding || { completed: false, step: 0 };
  if (step !== undefined) user.onboarding.step = step;
  if (completed !== undefined) user.onboarding.completed = completed;
  await dbUpdateUser(user);
  res.json({ username, onboarding: user.onboarding });
});

// Simple social auth endpoints (demo-friendly):
// POST /auth/:provider/login  { externalId, username, favoriteSport?, intent? }
// This is a lightweight demo flow: it links an external id to a local user record.
async function handleSocialLogin(provider, payload) {
  const { externalId, username, favoriteSport, intent } = payload;

  if (!externalId) {
    return { status: 400, body: { error: 'externalId required' } };
  }

  // find user by social profile
  const users = lowdb.data.users || [];
  let user = users.find((u) => u.socialProfiles && u.socialProfiles[provider] === externalId);

  if (!user) {
    // if username provided and exists, attach profile; otherwise create new user
    if (username) user = dbGetUser(username);
    if (!user) {
      const newUser = {
        id: username || `${provider}-${externalId}`,
        username: username || `${provider}-${externalId}`,
        favoriteSports: favoriteSport ? [favoriteSport] : [],
        intent: intent || 'competitive',
        tier: 'free',
        tokens: 1,
        lastTokenGrant: new Date(),
        socialProfiles: { [provider]: externalId }
      };

      user = await dbCreateUser(newUser);
      return { status: 200, body: { user, created: true } };
    }

    // attach social profile to existing user
    user.socialProfiles = user.socialProfiles || {};
    user.socialProfiles[provider] = externalId;
    await dbUpdateUser(user);
    return { status: 200, body: { user, created: false, linked: true } };
  }

  // existing linked user
  return { status: 200, body: { user, created: false, linked: true } };
}

app.post('/auth/:provider/login', express.json(), async (req, res) => {
  const provider = req.params.provider;
  const result = await handleSocialLogin(provider, req.body);
  res.status(result.status).json(result.body);
});

// Convenience endpoint to accept a generic social payload
app.post('/auth/social', express.json(), async (req, res) => {
  const { provider, externalId, username, favoriteSport, intent } = req.body;
  if (!provider || !externalId) return res.status(400).json({ error: 'provider and externalId required' });
  const result = await handleSocialLogin(provider, { externalId, username, favoriteSport, intent });
  return res.status(result.status).json(result.body);
});

// Results API: store final game results as source-of-truth for resolving bets
// Admin-protected: POST /admin/results { id, sport, homeTeam, awayTeam, homeScore, awayScore }
app.post('/admin/results', requireAdmin, express.json(), async (req, res) => {
  const { id, sport, homeTeam, awayTeam, homeScore, awayScore, occurredAt } = req.body;
  if (!id || !sport || !homeTeam || !awayTeam || homeScore == null || awayScore == null) {
    return res.status(400).json({ error: 'id, sport, homeTeam, awayTeam, homeScore, awayScore required' });
  }

  const existing = (lowdb.data.results || []).find((r) => r.id === id);
  if (existing) return res.status(400).json({ error: 'Result with id already exists' });

  const row = {
    id,
    sport,
    homeTeam,
    awayTeam,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  lowdb.data.results = lowdb.data.results || [];
  lowdb.data.results.push(row);
  await lowdb.write();

  res.json({ result: row });
});

// Public read endpoints for results
app.get('/results', (req, res) => {
  const sport = req.query.sport;
  let rows = lowdb.data.results || [];
  if (sport) rows = rows.filter((r) => (r.sport || '').toLowerCase() === (sport || '').toLowerCase());
  res.json(rows.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/results/:id', (req, res) => {
  const id = req.params.id;
  const r = (lowdb.data.results || []).find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: 'Result not found' });
  res.json(r);
});

// Streak endpoint
app.get("/users/:username/streak", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ username, currentStreak: user.currentStreak || 0, bestStreak: user.bestStreak || 0, lastWinDate: user.lastWinDate || null });
});

// Leaderboard endpoint
app.get("/leaderboard", (req, res) => {
  const metric = req.query.metric || "wins"; // wins, tokens, streak
  const limit = parseInt(req.query.limit || "10", 10);

  const users = dbGetAllUsers();

  // compute wins from bets
  const winsByUser = {};
  for (const b of (lowdb.data.bets || [])) {
    if (b.outcome === "win") winsByUser[b.username] = (winsByUser[b.username] || 0) + 1;
  }

  let sorted = users.map((u) => ({
    username: u.username,
    tokens: u.tokens || 0,
    wins: winsByUser[u.username] || 0,
    streak: u.currentStreak || 0
  }));

  if (metric === "tokens") sorted.sort((a, b) => b.tokens - a.tokens);
  else if (metric === "streak") sorted.sort((a, b) => b.streak - a.streak);
  else sorted.sort((a, b) => b.wins - a.wins);

  res.json(sorted.slice(0, limit));
});

// Social share: returns a short shareable summary for a user
app.get("/share/:username", (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  // compute wins
  const wins = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome === "win").length;
  const totalResolved = (lowdb.data.bets || []).filter((b) => b.username === username && b.outcome && b.outcome !== "pending").length;

  const summary = `${username} — ${wins}/${totalResolved} wins. Current streak: ${user.currentStreak || 0}. Tokens: ${user.tokens || 0}`;
  // simple encoded link (client can expand into nicer UI)
  const shareUrl = `https://example.com/share?u=${encodeURIComponent(username)}&s=${encodeURIComponent(summary)}`;

  res.json({ summary, shareUrl });
});

// Pathways config
app.get("/pathways", (req, res) => {
  res.json(PATHWAYS);
});

// Scheduler: resolve pending bets periodically
const RESOLVE_INTERVAL_MS = process.env.RESOLVE_INTERVAL_MS ? Number(process.env.RESOLVE_INTERVAL_MS) : 5 * 60 * 1000;
setInterval(() => {
  resolvePendingBets().catch((err) => console.error("Scheduled resolver error:", err.message));
}, RESOLVE_INTERVAL_MS);

// Run once on startup (non-blocking)
resolvePendingBets().catch(() => {});

// Admin endpoints (protected)
app.use('/admin', requireAdmin);

app.get("/admin/bets/pending", (req, res) => {
  const rows = (lowdb.data.bets || []).filter((b) => b.outcome === "pending");
  res.json(rows);
});

app.post("/admin/bets/:id/resolve", express.json(), async (req, res) => {
  const id = req.params.id;
  const { outcome, payout = null } = req.body;
  const bet = (lowdb.data.bets || []).find((b) => b.id === id);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  if (!["win", "loss"].includes(outcome)) return res.status(400).json({ error: "Invalid outcome" });

  bet.outcome = outcome;
  bet.resolvedAt = new Date().toISOString();
  if (outcome === "win") {
    if (payout != null) {
      bet.payout = payout;
    } else {
      // calculate payout using stored odds when available (decimal multiplier includes stake)
      const multiplier = bet.odds ? americanToDecimal(bet.odds) : 2;
      bet.payout = Math.max(1, Math.floor((bet.stake || 0) * multiplier));
    }
  } else {
    bet.payout = 0;
  }

  // update user tokens
  const user = dbGetUser(bet.username);
  if (user && bet.outcome === "win") {
    user.tokens = Math.max(0, (user.tokens || 0) + bet.payout);
    await dbUpdateUser(user);
  }

  await lowdb.write();
  res.json({ bet });
});

app.post("/admin/users/:username/lock", express.json(), async (req, res) => {
  const username = req.params.username;
  const { until } = req.body; // ISO timestamp or minutes from now
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  let lockUntil = null;
  if (!until) {
    return res.status(400).json({ error: "Provide 'until' as ISO timestamp or minutes" });
  }
  // if numeric, treat as minutes
  if (!isNaN(Number(until))) {
    lockUntil = new Date(Date.now() + Number(until) * 60 * 1000).toISOString();
  } else {
    lockUntil = new Date(until).toISOString();
  }

  user.lockedUntil = lockUntil;
  await dbUpdateUser(user);
  res.json({ username, lockedUntil: lockUntil });
});

app.post("/admin/users/:username/unlock", express.json(), async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.lockedUntil = null;
  await dbUpdateUser(user);
  res.json({ username, unlocked: true });
});

// User settings endpoint
app.put("/users/:username/settings", express.json(), async (req, res) => {
  const username = req.params.username;
  const { intent, customLimits, lockedUntil, supportContact } = req.body;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (intent) user.intent = intent;
  if (customLimits) user.customLimits = customLimits;
  if (supportContact) user.supportContact = supportContact;
  if (lockedUntil !== undefined) user.lockedUntil = lockedUntil;

  await dbUpdateUser(user);
  res.json({ username, settings: { intent: user.intent, customLimits: user.customLimits, lockedUntil: user.lockedUntil, supportContact: user.supportContact } });
});

// Create Stripe checkout session for premium upgrade
app.post("/users/:username/premium-checkout", express.json(), async (req, res) => {
  const username = req.params.username;
  const user = dbGetUser(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Check if already premium
  if (user.premium) {
    return res.status(400).json({ error: "User is already premium" });
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email || undefined,
      client_reference_id: username,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Whistle Premium - 1000 Tokens',
              description: '1000 tokens for premium betting access'
            },
            unit_amount: 999 // $9.99 in cents
          },
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/app.html?upgrade-success=true`,
      cancel_url: `${baseUrl}/app.html?upgrade-canceled=true`
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
});

// Webhook endpoint for Stripe payment events
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const username = session.client_reference_id;
    
    if (username) {
      const user = dbGetUser(username);
      if (user) {
        // Upgrade user to premium
        user.premium = true;
        user.premiumSince = new Date().toISOString();
        user.tokens = (user.tokens || 0) + 1000;
        user.stripeCustomerId = session.customer;
        await dbUpdateUser(user);
        console.log(`[Stripe] Upgraded ${username} to premium after payment`);
      }
    }
  }

  res.json({ received: true });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', {
    message: err.message,
    status: err.status,
    stack: err.stack
  });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/**
 * Initialize ESPN scraper to run in background
 * Runs immediately on startup, then every 30 minutes
 */
function initializeScraperSchedule() {
  console.log('[SCRAPER] Initializing ESPN score scraper...');
  
  // Run immediately on startup
  runScraper()
    .catch(err => console.error('[SCRAPER] Initial run failed:', err.message));
  
  // Run periodically every 30 minutes
  const SCRAPER_INTERVAL = 30 * 60 * 1000; // 30 minutes
  setInterval(() => {
    console.log('[SCRAPER] Running scheduled scraper...');
    runScraper()
      .catch(err => console.error('[SCRAPER] Scheduled run failed:', err.message));
  }, SCRAPER_INTERVAL);
  
  console.log('[SCRAPER] Scraper will run every 30 minutes');
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  
  // Start scraper after server is ready
  initializeScraperSchedule();
});
>>>>>>> e0d7437dc54a8b50015be92234f24ed93d260c28
