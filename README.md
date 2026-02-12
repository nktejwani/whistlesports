# Whistle (local)

Lightweight backend for the Whistle free-play sportsbook prototype.

Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

API examples

Create a user:

```bash
curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{"username":"tej","favoriteSports":["nba","nfl"],"intent":"casual"}'
```

Get all users:

```bash
curl http://localhost:3000/users
```

Place a bet (stakes tokens):

```bash
curl -X POST http://localhost:3000/bets -H "Content-Type: application/json" -d '{"username":"tej","sport":"nba","selection":"Lakers","stake":1}'
```

Get user bets:

```bash
curl http://localhost:3000/bets/tej
```

Get user stats:

```bash
curl http://localhost:3000/users/tej/stats
```

Admin

- Protect admin routes by setting `ADMIN_TOKEN` in your environment.

Example (PowerShell):

```powershell
$env:ADMIN_TOKEN = 'my-secret-token'
npm start
```

Then call admin routes with header `Authorization: Bearer my-secret-token`.

Frontend demo

Open `http://localhost:3000` in your browser to try the tiny onboarding and share UI at `/onboarding.html` and `/share.html`.
