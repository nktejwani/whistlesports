# Google OAuth Setup Guide

## Quick Start (Testing)

For testing purposes, you can use the following demo credentials:

```env
GOOGLE_CLIENT_ID=881652178922-5gn3jf4qj0pd0j8a4i1e7n8h5m1k0p9l.apps.googleusercontent.com
```

Add this to your `.env` file and the Google Sign-In buttons will appear on the login/register screens.

## Google Production Setup

To set up Google OAuth for production:

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the "Google+ API"

### 2. Create OAuth 2.0 Credentials

1. Go to **Credentials** in the left sidebar
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Choose **Web application**
4. Add authorized JavaScript origins:
   - `http://localhost:3000` (for local development)
   - `https://yourdomain.com` (for production)
5. Add authorized redirect URIs (for server-side flows):
   - `http://localhost:3000/auth/google/callback`
   - `https://yourdomain.com/auth/google/callback`
6. Copy the **Client ID** (looks like: `xxxx-xxxxx.apps.googleusercontent.com`)

### 3. Configure Environment Variables

Add to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

---

## Facebook OAuth Setup Guide

### Quick Start (Testing)

Facebook requires creating an app first. Here's the setup:

### 1. Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Choose **Consumer** as the app type
4. Fill in:
   - **App Name**: Your app name (e.g., "Whistle")
   - **App Contact Email**: Your email
   - **App Purpose**: Select appropriate category
5. Click **Create App**

### 2. Add Facebook Login Product

1. In the app dashboard, click **Add Product**
2. Find **Facebook Login** and click **Set Up**
3. Choose **Web** as your platform
4. In Facebook Login → Settings:
   - **Valid OAuth Redirect URIs**: Add:
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
5. In Basic Settings (upper left):
   - Copy your **App ID** and **App Secret**

### 3. Configure Environment Variables

Add to your `.env` file:

```env
FACEBOOK_APP_ID=your-app-id-here
FACEBOOK_APP_SECRET=your-app-secret-here
```

### 4. Get Your App ID

The **App ID** appears in:
- Basic Settings (under App Name)
- Format: typically a long number (e.g., `123456789012345`)

### Testing Facebook Login Locally

Facebook requires HTTPS for production, but for local testing:

1. Start your server: `npm start` or `node index.js`
2. Open http://localhost:3000/app.html
3. Click "Log in with Facebook" button
4. Use a test Facebook account

> **Note**: You may need to add test users or allow your account in the Facebook app's Roles section

---

## How It Works

### Registration/Login with Google

1. User clicks "Sign in with Google" on register/login screen
2. Google Sign-In popup appears
3. User authenticates with Google
4. Frontend receives ID token (JWT)
5. ID token is sent to `/auth/google` POST endpoint
6. Backend verifies the token using Google's public keys
7. New user account is created with:
   - Username auto-generated from email
   - Email stored from Google profile
   - Google ID stored in socialProfiles
   - 1 token granted

### Registration/Login with Facebook

1. User clicks "Log in with Facebook" on register/login screen
2. Facebook login dialog appears
3. User authenticates with Facebook
4. Frontend receives access token
5. Access token is sent to `/auth/facebook` POST endpoint
6. Backend validates token with Facebook API
7. New user account is created with:
   - Username auto-generated from email
   - Email stored from Facebook profile
   - Facebook ID stored in socialProfiles
   - 1 token granted

### Account Linking

- If a user has both a password account and a social account with the same email, they are automatically linked
- Both login methods work for the same account
- Social profiles are stored in `user.socialProfiles`

## Frontend Configuration

The frontend automatically fetches the `GOOGLE_CLIENT_ID` and `FACEBOOK_APP_ID` from the `/config` endpoint:

```javascript
const configRes = await fetch('/config');
const config = await configRes.json();
// config.googleClientId
// config.facebookAppId
```

This means you only need to update your `.env` file—no need to change the frontend code.

## Testing

After setup:

1. Start the server: `npm start` or `node index.js`
2. Open http://localhost:3000/app.html
3. Try both Google and Facebook sign-in
4. Verify new accounts are created
5. Log out and try logging back in

## Troubleshooting

### Google

**"Google authentication not configured"**
→ Add `GOOGLE_CLIENT_ID` to your `.env` file

**"Invalid token or Google authentication failed"**
→ Check that the token was recently issued and hasn't expired

### Facebook

**"Facebook login cancelled"** or **"Facebook not loaded"**
→ Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to your `.env` file

**"Invalid Facebook token"**
→ Check that the access token is valid and hasn't expired (lasts ~2 hours)

**CORS errors in browser console**
→ Add your domain to **Valid OAuth Redirect URIs** in Facebook app settings

**"This app hasn't been reviewed by Facebook"**
→ In development, use test accounts or add yourself as a test user in the app's Roles section

## Next Steps

- Add Instagram OAuth (via Facebook)
- Email verification after social signup
- Password reset flow
- User profile editing
- Notifications on bet resolution
