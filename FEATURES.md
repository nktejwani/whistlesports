# Whistle Features

## Authentication

### Password-Based Registration & Login
- **Endpoint**: `POST /users` (register), `POST /auth/login` (login)
- **Features**:
  - Minimum 4-character password requirement
  - Secure bcrypt password hashing
  - Unique username enforcement
  - Auto-grant 1 token on registration
  - Daily token grant on login

### Social OAuth Logins
- **Google Sign-In**
  - Auto-generate username from email
  - Link to existing accounts with same email
  - Requires `GOOGLE_CLIENT_ID` in `.env`
  
- **Facebook Login**
  - Auto-generate username from email
  - Link to existing accounts with same email
  - Requires `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in `.env`
  - Supports email and public profile scopes

### Password Reset Flow
- **Forgot Password**
  - `POST /auth/forgot-password` - Generate reset token
  - Tokens expire after 15 minutes
  - Returns reset link with token (for testing; in production, send via email)
  - Console logs the reset link for development

- **Reset Password**
  - `POST /auth/reset-password/:token` - Validate token and reset password
  - Validates new password (minimum 4 characters)
  - Consumes token after use (can only reset once per token)
  - Returns success message on completion

### User Profile & Settings
- **View Profile**
  - Username, avatar, betting style, favorite sport
  - Total bets placed
  - Current and best win streaks

- **Edit Profile**
  - `PUT /users/:username` - Update user profile
  - Change favorite sport
  - Change betting style (competitive ↔ casual)
  - Select team avatar
  - Avatar options vary by selected sport

## Betting Features

### Sport Selection
Supported sports:
- 🏀 NBA, College Basketball
- 🏈 NFL, College Football
- ⚾ MLB, College Baseball
- 🏒 NHL
- ⚽ Soccer (EPL)
- 🎾 Tennis
- ⛳ Golf

### Market Types
- **Moneyline (H2H)**: Direct team win
- **Spreads**: Team victory with point adjustment
- **Totals**: Over/Under combined points

### Bet Placement
- Bet slip modal with game details
- Custom stake selection (in tokens)
- Odds display in American format
- Automatic token deduction
- Casual pathway limits enforcement

### Bet Resolution
- Automatic resolution based on Odds API scores
- Fallback to admin-submitted results
- Payout calculation using American odds
- Win streak tracking
- Push handling (tie bets)

## User Safety

### Casual/Support Pathway
- Daily betting limits (5 tokens)
- Maximum stake per bet (1 token)
- Restricted play hours (10 AM - 8 PM)
- Encouraging messages during betting
- Customizable limits via admin endpoint

### Account Locking
- Admin-locked accounts prevent betting
- Temporary or permanent locks
- Lock status returned on bet attempts

## Admin Features

- Submit official game results: `POST /admin/results`
- Resolve pending bets manually: `POST /admin/bets/:id/resolve`
- Lock/unlock user accounts: `POST /admin/users/:username/lock`
- View pending bets: `GET /admin/bets/pending`
- Requires `ADMIN_TOKEN` env var (default: `dev-admin-token`)

## API Endpoints

### Auth
- `POST /auth/login` - Login with username/password
- `POST /auth/forgot-password` - Generate password reset token
- `POST /auth/reset-password/:token` - Reset password with valid token
- `POST /auth/google` - Login/register with Google ID token
- `POST /auth/facebook` - Login/register with Facebook access token

### Users
- `GET /users` - List all users
- `GET /users/:username` - Get user profile (grants daily tokens)
- `POST /users` - Create new user with password
- `PUT /users/:username` - Update user profile
- `GET /users/:username/stats` - Win/loss statistics
- `GET /users/:username/streak` - Current and best streaks

### Bets
- `POST /bets` - Place a new bet
- `GET /bets/:username` - Get all user bets
- `GET /bets/:username/active` - Get pending bets only
- `GET /admin/bets/pending` - Get all pending bets
- `POST /admin/bets/:id/resolve` - Manually resolve a bet

### Odds & Games
- `GET /odds/simple?sport=nba` - Get current odds for a sport
- `GET /results` - Get settled game results
- `GET /results/:id` - Get specific result

### Config & Social
- `GET /config` - Get frontend configuration
- `GET /pathways` - Get casual pathway settings
- `GET /share/:username` - Get shareable user summary
- `GET /leaderboard` - Get top users by wins/tokens/streak

## Environment Variables

```env
# Odds API
ODDS_API_KEY=your-api-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Facebook OAuth
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret

# Admin
ADMIN_TOKEN=your-admin-token

# DB Resolution
RESOLVE_INTERVAL_MS=300000  # 5 minutes
```

## Database Schema

### Users
```json
{
  "id": "username",
  "username": "unique-username",
  "email": "user@example.com",
  "passwordHash": "bcrypt-hash",
  "avatar": "team-code",
  "favoriteSports": ["nba"],
  "intent": "casual|competitive",
  "tier": "free",
  "tokens": 10,
  "lastTokenGrant": "2026-02-07T00:00:00Z",
  "socialProfiles": {
    "google": "google-id",
    "facebook": "facebook-id"
  },
  "currentStreak": 5,
  "bestStreak": 12,
  "lastWinDate": "2026-02-06T00:00:00Z",
  "customLimits": null,
  "lockedUntil": null,
  "supportContact": null,
  "onboarding": {
    "completed": true,
    "step": 5
  },
  "createdAt": "2026-02-01T00:00:00Z"
}
```

### Bets
```json
{
  "id": "username-timestamp",
  "username": "bettor-username",
  "sport": "NBA",
  "eventId": "api-event-id",
  "market": "moneyline|spread|total",
  "selection": "team-name",
  "line": -110,
  "stake": 5,
  "odds": 170,
  "outcome": "pending|win|loss|push",
  "payout": 10,
  "createdAt": "2026-02-07T00:00:00Z",
  "resolvedAt": null
}
```

### Reset Tokens
```json
{
  "token": "random-token-string",
  "username": "username",
  "createdAt": "2026-02-07T00:00:00Z",
  "expiresAt": "2026-02-07T00:15:00Z"
}
```

## Frontend Features

### Screens
- **Register**: Create account with email/password or OAuth
- **Login**: Sign in with credentials or OAuth
- **Home**: Select sport, view games, place bets via modal
- **Results**: View active and resolved bets
- **Stats**: Win percentage, streaks, underdogs
- **Profile**: View account info, edit profile, logout

### Modals
- **Bet Slip**: Place bets with custom stakes
- **Password Reset**: Reset forgotten passwords
- **Profile Editor**: Change sports, style, avatar

### Responsive Design
- Mobile-first layout
- Bottom navigation for easy thumb access
- Fixed header with token balance
- Smooth animations and transitions

## Testing

### Manual Testing Checklist
- [ ] Register new account with password
- [ ] Register duplicate username (should fail)
- [ ] Register with Google (requires valid client ID)
- [ ] Register with Facebook (requires valid app ID)
- [ ] Login with password
- [ ] Forgot password flow
- [ ] Reset password with token
- [ ] Edit profile and select team avatar
- [ ] Place bet (should show in Results)
- [ ] Logout and login again (tokens should persist)
- [ ] Casual pathway limits (if intent=casual)
- [ ] Daily token grant on login

### Automated Tests
- Run: `npm test`
- Creates user, places bet, submits result, resolves deterministically
- Tests reset tokens and token expiration

## Deployment Checklist

Before deploying to production:

1. **OAuth Setup**
   - [ ] Create Google OAuth credentials
   - [ ] Create Facebook App
   - [ ] Add authorized origins/URIs
   - [ ] Update `.env` with real credentials

2. **Email Service**
   - [ ] Implement real email sending for password reset
   - [ ] Update `/auth/forgot-password` to send email instead of returning link
   - [ ] Test email delivery

3. **Security**
   - [ ] Enable HTTPS
   - [ ] Update OAuth redirect URIs to https
   - [ ] Set strong ADMIN_TOKEN
   - [ ] Review casual pathway limits
   - [ ] Enable CORS for approved domains only

4. **Database**
   - [ ] Migrate from JSON to production database (MongoDB, PostgreSQL, etc.)
   - [ ] Set up automated backups
   - [ ] Review data retention policies

5. **Monitoring**
   - [ ] Set up error logging
   - [ ] Monitor failed login attempts
   - [ ] Track abandoned bets
   - [ ] Alert on unusual token grants

6. **Compliance**
   - [ ] Add Terms of Service
   - [ ] Add Privacy Policy
   - [ ] Implement age verification (18+)
   - [ ] Add responsible gambling disclaimers
   - [ ] Comply with local gambling regulations
