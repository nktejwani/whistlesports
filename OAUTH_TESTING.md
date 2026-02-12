# OAuth Testing Quick Reference

## Current Status ✅

### Google OAuth
- **Status:** ✅ READY TO TEST
- **Client ID:** Configured in .env
- **Frontend:** Google Sign-In button rendered
- **Backend:** `/auth/google` endpoint active

### Facebook OAuth  
- **Status:** ⚠️ NEEDS CONFIGURATION
- **App ID:** Not configured in .env
- **Frontend:** Facebook Sign-In button exists but won't work
- **Backend:** `/auth/facebook` endpoint exists but will return 500

---

## How to Test Google OAuth (Ready Now)

### Step 1: Open the App
The browser should already be open to `http://localhost:3000`

### Step 2: Click "Sign Up" or "Login"
You'll see the login/register screen with:
- Traditional username/password form
- **"Sign in with Google"** button
- "Sign in with Facebook" button (won't work without config)

### Step 3: Click "Sign in with Google"
- Google OAuth popup will appear
- Choose your Google account
- Approve the permissions

### Step 4: Verify Success
After OAuth completes:
- ✅ You should be logged into the app
- ✅ Your username will be generated from your email (e.g., "john" from john@gmail.com)
- ✅ You'll have 1 starting token
- ✅ Check `data/db.json` to see your new user account with `socialProfiles.google` set

### Step 5: Test Return Login
- Log out
- Click "Sign in with Google" again
- Should log you into the **same account** (no duplicate created)

---

## What the Backend Does

### On First Google Login:
```javascript
{
  "id": "john",
  "username": "john",
  "email": "john@gmail.com",
  "tokens": 1,
  "socialProfiles": {
    "google": "107472583920583920583" // Google's unique user ID
  },
  "favoriteSports": [],
  "intent": "competitive",
  "tier": "free",
  "currentStreak": 0,
  "bestStreak": 0,
  "createdAt": "2026-02-10T..."
}
```

### On Return Login:
- Finds user by `socialProfiles.google`
- Grants daily tokens (if eligible)
- Returns existing user (no duplicate)

### Account Linking:
If you later create a password account with the same email, Google profile will automatically link to it.

---

## Testing Facebook OAuth (Optional)

### Prerequisites:
1. Get a Facebook App ID and Secret from https://developers.facebook.com
2. Add to `.env`:
   ```
   FACEBOOK_APP_ID=your_app_id_here
   FACEBOOK_APP_SECRET=your_app_secret_here
   ```
3. Restart server: `npm start`

### Test Flow:
Same as Google OAuth above, but click "Facebook" button instead.

---

## Common Issues

### Google OAuth Popup Blocked
- **Cause:** Browser popup blocker
- **Fix:** Allow popups for localhost:3000

### "Google authentication not configured" Error
- **Cause:** GOOGLE_CLIENT_ID missing from .env
- **Fix:** Should already be configured (881652178922-...)

### "Facebook authentication not configured" Error
- **Cause:** FACEBOOK_APP_ID/SECRET missing from .env
- **Fix:** Expected - configure Facebook app if you want to test it

### User Created but Can't See App
- **Cause:** Frontend localStorage not set
- **Fix:** Refresh page - should auto-login if localStorage has username

---

## Database Verification

After OAuth login, check `data/db.json`:

```bash
# PowerShell
Get-Content data\db.json | Select-String -Pattern "socialProfiles" -Context 5
```

Look for:
- New user entry
- `socialProfiles.google` with your Google ID
- Email matches your Google account
- Username generated from email

---

## Next Steps After Testing

✅ If Google OAuth works:
- Users can sign up with Google in one click
- No password needed
- Automatic account creation

⚠️ If Facebook OAuth needed:
- Follow "Testing Facebook OAuth" section above
- Get Facebook App credentials
- Configure .env

🎯 Production Deployment:
- Google Client ID works in production (already configured)
- Add authorized domains to Google Cloud Console
- Facebook requires app review for public use
