# Publishing GetFreeSol to Solana Mobile dApp Store

This guide walks you through publishing your PWA to the Solana Mobile dApp Store.

## Prerequisites

Your app is already configured as a PWA with:
- ✅ Web manifest (`client/public/site.webmanifest`)
- ✅ Service worker (`client/public/sw.js`)
- ✅ Digital Asset Links template (`client/public/.well-known/assetlinks.json`)
- ✅ GitHub Actions workflow (`.github/workflows/build-twa.yml`)

## Step 1: Push to GitHub

1. Create a new GitHub repository
2. Push this code to the repository

```bash
git remote add github https://github.com/YOUR_USERNAME/getfreesol.git
git push github main
```

## Step 2: Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `PWA_MANIFEST_URL` | `https://your-published-domain.replit.app/site.webmanifest` |
| `KEYSTORE_PASSWORD` | A strong password (save this - you'll need it for updates!) |

## Step 3: Run the Build

1. Go to **Actions** tab in your GitHub repository
2. Click on **"Build TWA APK for Solana dApp Store"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait for the build to complete (~5 minutes)

## Step 4: Download Build Artifacts

After the build completes:
1. Click on the completed workflow run
2. Download these artifacts:
   - `getfreesol-signed-apk` - Your signed APK file
   - `assetlinks-json` - Your Digital Asset Links file
   - `sha256-fingerprint` - Your app's signing certificate fingerprint

## Step 5: Update assetlinks.json

1. Open the downloaded `assetlinks.json`
2. Copy its contents
3. Replace the content in `client/public/.well-known/assetlinks.json` with the new content
4. Commit and redeploy your app

This allows your PWA to display in full-screen mode without browser UI.

## Step 6: Submit to Solana dApp Store

1. Go to [Solana dApp Store Publisher Portal](https://publisher.solanamobile.com)
2. Connect your wallet and create a publisher account
3. Click **"Submit App"**
4. Choose upload provider:
   - **ArDrive** (recommended) - Decentralized, pay with Turbo credits
   - **AWS S3** - Use your own S3 bucket
5. Upload your APK (`app-release-signed.apk`)
6. Fill in app details:
   - **Name**: GetFreeSol
   - **Category**: Finance / DeFi
   - **Description**: Reclaim SOL rent from empty token accounts on Solana
7. Submit for review

## Updating Your App

When you update the PWA:
1. Make changes to your code
2. Push to GitHub
3. The workflow will automatically rebuild the APK
4. Download the new APK and resubmit to the dApp Store

## Important Notes

- **Keep your keystore password safe** - You need the same password for all future updates
- **Same signing key** - All updates must be signed with the same key
- **Version bumps** - The workflow automatically bumps the version number

## Troubleshooting

### Browser UI showing in app
Your `assetlinks.json` isn't configured correctly. Make sure:
1. The SHA256 fingerprint matches your signing key
2. The file is accessible at `https://your-domain/.well-known/assetlinks.json`

### Build fails
Check the GitHub Actions logs for specific errors. Common issues:
- Missing secrets (PWA_MANIFEST_URL, KEYSTORE_PASSWORD)
- Invalid manifest URL
