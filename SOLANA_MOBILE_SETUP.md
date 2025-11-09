# Solana Mobile dApp Store Publishing Guide

## Overview
This guide walks you through publishing **Get Your SOL Back!** to the Solana Mobile dApp Store.

## ✅ Completed Steps

### 1. Legal Documents (Required)
- ✅ Privacy Policy: `https://getfreesol.xyz/privacy-policy`
- ✅ Terms of Service (EULA): `https://getfreesol.xyz/terms-of-service`
- ✅ Copyright Notice: Included in EULA

### 2. PWA Configuration (Required)
- ✅ Web Manifest: `public/manifest.json`
- ✅ Digital Asset Links: `public/.well-known/assetlinks.json`

---

## 📋 Remaining Steps

### Step 1: Create Visual Assets

You need to create the following images:

**Required Assets:**
1. **App Icon**: 512×512 px PNG
   - Follow [Google Play icon design spec](https://developer.android.com/google-play/resources/icon-design-specifications)
   - Should be your purple gradient logo with transparent background
   - Save as: `public/icon-512.png`

2. **App Icon (Small)**: 192×192 px PNG
   - Same design as 512×512, just smaller
   - Save as: `public/icon-192.png`

3. **Banner Graphic**: 1200×600 px PNG
   - For store listing header
   - Use your brand colors (purple gradient)
   - Include app name and tagline
   - Save as: `public/banner-1200x600.png`

4. **Screenshots**: At least 4 screenshots at 1920×1080 px
   - Screenshot 1: Main landing page with wallet connect
   - Screenshot 2: Scan results showing empty accounts
   - Screenshot 3: Transaction confirmation/success
   - Screenshot 4: Stats dashboard
   - Save in: `public/screenshots/`

**Optional (Recommended):**
5. **Feature Graphic**: 1200×1200 px PNG
   - For Editor's Choice carousel
   - Save as: `public/feature-1200x1200.png`

---

### Step 2: Install Solana Mobile CLI

```bash
# Install Node.js dependencies
npm install --save-dev @solana-mobile/dapp-store-cli

# Initialize dApp Store CLI
npx dapp-store init
```

This creates a `config.yaml` file with three sections:
- **Publisher**: Your developer/company info
- **App**: App metadata and assets
- **Release**: Version-specific info

---

### Step 3: Configure config.yaml

Edit the generated `config.yaml`:

```yaml
solana:
  cluster: mainnet-beta

publisher:
  name: Get Your SOL Back
  website: https://getfreesol.xyz
  email: contact@getfreesol.xyz  # Use your actual email
  address: ""  # Leave blank - will be auto-populated

app:
  name: Get Your SOL Back!
  android_package: xyz.getfreesol.twa
  urls:
    license_url: https://getfreesol.xyz/terms-of-service
    privacy_policy_url: https://getfreesol.xyz/privacy-policy
    copyright_url: https://getfreesol.xyz/terms-of-service
  address: ""  # Leave blank - will be auto-populated
  i18n:
    en_US:
      name: Get Your SOL Back!
      short_description: Reclaim SOL from empty token accounts
      description: |
        Get Your SOL Back! helps Solana users reclaim SOL locked in empty token accounts.
        
        Features:
        • Scan your wallet for empty accounts
        • Reclaim rent deposits (0.00203928 SOL per account)
        • Swap tokens using Jupiter aggregator
        • Burn unwanted tokens and NFTs
        • Auto-claim for hands-free SOL recovery
        • Developer API for integration
        
        Platform fees: 15% of recovered SOL (you keep 85%)
        Swap fees: 0.50% referral fee
        
        Your keys stay in your wallet - we never ask for private keys or seed phrases.
      new_in_version: |
        • Initial release on Solana Mobile dApp Store
        • Full wallet integration with 8+ wallet types
        • Jupiter Ultra Swap integration
        • Auto-claim feature for automated recovery
      media:
        icon: /path/to/icon-512.png
        banner: /path/to/banner-1200x600.png
        feature_graphic: /path/to/feature-1200x1200.png  # Optional
        screenshots:
          - /path/to/screenshots/screenshot-1.png
          - /path/to/screenshots/screenshot-2.png
          - /path/to/screenshots/screenshot-3.png
          - /path/to/screenshots/screenshot-4.png

release:
  version_name: "1.0.0"
  version_code: 1
  min_sdk_version: 28
  apk: /path/to/getfreesol.apk
  address: ""  # Leave blank - will be auto-populated
```

---

### Step 4: Build Android APK with Bubblewrap

Since this is a PWA, use **Bubblewrap** to convert it to an Android app:

```bash
# Install Bubblewrap globally
npm install -g @bubblewrap/cli

# Initialize Bubblewrap (run in project root)
bubblewrap init --manifest=https://getfreesol.xyz/manifest.json

# This creates a TWA (Trusted Web Activity) project
# Follow the prompts:
# - Package name: xyz.getfreesol.twa
# - App name: Get Your SOL Back!
# - Start URL: https://getfreesol.xyz
# - Icon: Use your 512×512 icon
```

**Build the APK:**
```bash
# Build release APK
bubblewrap build

# This creates:
# - A release APK at: app/build/outputs/apk/release/app-release-unsigned.apk
```

**Sign the APK:**
```bash
# Generate a new signing key (IMPORTANT: Save this securely!)
keytool -genkey -v -keystore getfreesol-release.keystore \
  -alias getfreesol -keyalg RSA -keysize 2048 -validity 10000

# Sign the APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore getfreesol-release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk getfreesol

# Zipalign (optimize)
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk \
  getfreesol-v1.0.0.apk
```

**Get signing key fingerprint for assetlinks.json:**
```bash
keytool -list -v -keystore getfreesol-release.keystore -alias getfreesol

# Copy the SHA256 fingerprint and update:
# public/.well-known/assetlinks.json
```

---

### Step 5: Update assetlinks.json

After generating your signing key, update `public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "xyz.getfreesol.twa",
      "sha256_cert_fingerprints": [
        "YOUR_ACTUAL_SHA256_FINGERPRINT_FROM_KEYTOOL"
      ]
    }
  }
]
```

Then deploy this file to: `https://getfreesol.xyz/.well-known/assetlinks.json`

---

### Step 6: Validate Configuration

```bash
# Validate your config.yaml and APK
npx dapp-store validate -k ~/.config/solana/id.json -u https://api.mainnet-beta.solana.com

# Provide path to Android SDK Build Tools when prompted
# (Find in Android Studio > Tools > SDK Manager)
```

---

### Step 7: Mint NFTs (On-Chain Publishing)

**Prerequisites:**
- Solana wallet with some SOL for transaction fees (~0.05 SOL recommended)
- Your wallet keypair file (e.g., `~/.config/solana/id.json`)

**Mint Publisher NFT (one-time only):**
```bash
npx dapp-store create publisher -k ~/.config/solana/id.json \
  -u https://api.mainnet-beta.solana.com
```

This creates a Publisher NFT and updates `config.yaml` with the publisher address.

**Mint App NFT (one-time only):**
```bash
npx dapp-store create app -k ~/.config/solana/id.json \
  -u https://api.mainnet-beta.solana.com
```

This creates an App NFT and updates `config.yaml` with the app address.

**Mint Release NFT (for each new version):**
```bash
npx dapp-store create release -k ~/.config/solana/id.json \
  -u https://api.mainnet-beta.solana.com
```

This creates a Release NFT for version 1.0.0.

---

### Step 8: Submit for Review

```bash
npx dapp-store publish submit -k ~/.config/solana/id.json \
  -u https://api.mainnet-beta.solana.com \
  --requestor-is-authorized \
  --complies-with-solana-dapp-store-policies
```

**Review Timeline:**
- New apps: 2-3 days
- Updates: ~1 day

You'll be contacted via the email in your publisher config if there are issues.

---

### Step 9: Publishing Updates

When you release a new version:

1. Update `config.yaml` with new version info
2. Build and sign new APK
3. Create new Release NFT:
   ```bash
   npx dapp-store create release -k ~/.config/solana/id.json \
     -u https://api.mainnet-beta.solana.com
   ```
4. Submit update:
   ```bash
   npx dapp-store publish update -k ~/.config/solana/id.json \
     -u https://api.mainnet-beta.solana.com \
     --requestor-is-authorized \
     --complies-with-solana-dapp-store-policies
   ```

---

## 📝 Important Notes

### Signing Key Security
- **NEVER lose your signing key!** Without it, you cannot update your app
- Store the `.keystore` file in a secure location (password manager, encrypted backup)
- Consider using a hardware security module (HSM) for production

### Policy Compliance
- Read the [Solana dApp Store Policy](https://docs.solanamobile.com/dapp-publishing/policy)
- Read the [Developer Agreement](https://docs.solanamobile.com/dapp-publishing/agreement)
- Your app already complies with crypto-friendly policies

### Localization (Optional)
If you want to support multiple languages, add them to `config.yaml`:

```yaml
app:
  i18n:
    en_US:
      # English content
    es_ES:
      # Spanish content
    fr_FR:
      # French content
```

Also update `public/manifest.json` and the APK's `build.gradle`.

---

## 🎯 Quick Checklist

- [ ] Create app icon (512×512 px)
- [ ] Create app icon (192×192 px)
- [ ] Create banner (1200×600 px)
- [ ] Capture 4+ screenshots (1920×1080 px)
- [ ] Install Solana Mobile CLI
- [ ] Initialize `config.yaml`
- [ ] Build APK with Bubblewrap
- [ ] Generate signing key
- [ ] Sign APK
- [ ] Update `assetlinks.json` with SHA256 fingerprint
- [ ] Deploy assetlinks.json to website
- [ ] Validate configuration
- [ ] Mint Publisher NFT
- [ ] Mint App NFT
- [ ] Mint Release NFT
- [ ] Submit for review
- [ ] Wait 2-3 days for approval
- [ ] Celebrate! 🎉

---

## 🆘 Support

If you need help:
- **Discord**: #dapp-store channel in Solana Mobile Discord
- **Email**: Support via publisher email
- **Docs**: https://docs.solanamobile.com/dapp-publishing/intro

---

## 💡 Tips

1. **Test your TWA locally** before submitting
2. **Keep your APK under 100MB** if possible
3. **Use high-quality screenshots** - they're your first impression
4. **Proofread your description** - it shows professionalism
5. **Monitor reviews** after launch and respond promptly

---

Good luck with your Solana Mobile launch! 🚀
