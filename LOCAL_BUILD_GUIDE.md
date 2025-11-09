# 🏗️ Local Android APK Build Guide

Since the Android build process requires tools not available in Replit (Android SDK, Java JDK), you'll need to build the APK on your **local computer**.

---

## ✅ Prerequisites Checklist

Before starting, make sure you have:

- [ ] **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- [ ] **Java JDK** (v11 or higher) - [Download](https://adoptium.net/)
- [ ] **Android SDK** (via Android Studio or standalone) - [Download](https://developer.android.com/studio)

---

## 📦 Step 1: Install Bubblewrap CLI

Open your terminal and install Bubblewrap globally:

```bash
npm install -g @bubblewrap/cli
```

**Verify installation:**
```bash
bubblewrap --version
```

---

## 🚀 Step 2: Initialize Your TWA Project

Run Bubblewrap init with your live manifest URL:

```bash
bubblewrap init --manifest=https://getfreesol.xyz/manifest.json
```

**What happens:**
- Bubblewrap downloads your manifest.json
- Creates a new Android project directory
- Configures the Trusted Web Activity (TWA) wrapper

**Follow the prompts:**
1. Domain: `getfreesol.xyz` (auto-filled from manifest)
2. Package name: `xyz.getfreesol.twa` (recommended)
3. App name: "Get Your SOL Back!" (auto-filled)
4. Theme color: `#7c3aed` (auto-filled)
5. Background color: `#581c87` (auto-filled)

---

## 🔨 Step 3: Build the APK

Navigate to the project directory and build:

```bash
cd getfreesol-xyz
bubblewrap build
```

**Build process:**
- Downloads Android build dependencies (first time only, ~5-10 minutes)
- Compiles the Android project
- Generates unsigned APK

**Output location:**
```
app/build/outputs/apk/release/app-release-unsigned.apk
```

---

## 🔑 Step 4: Generate Signing Key

**CRITICAL:** This keystore file is used for ALL future app updates. **Save it securely!**

Generate your release keystore:

```bash
keytool -genkey -v -keystore getfreesol-release.keystore \
  -alias getfreesol \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**You'll be prompted for:**
- Keystore password (choose a strong one, **SAVE IT**)
- Your name and organization (can be anything)
- Confirm the information

**Result:**
- File: `getfreesol-release.keystore` (backup this file!)

---

## ✍️ Step 5: Sign the APK

Sign your APK with the keystore:

```bash
jarsigner -verbose \
  -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore getfreesol-release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  getfreesol
```

**You'll be prompted for:**
- Keystore password (from Step 4)

**After signing:**
```bash
# Rename the signed APK
mv app/build/outputs/apk/release/app-release-unsigned.apk \
   app/build/outputs/apk/release/getfreesol-signed.apk
```

---

## 🔍 Step 6: Get SHA-256 Fingerprint

Extract the SHA-256 certificate fingerprint:

```bash
keytool -list -v \
  -keystore getfreesol-release.keystore \
  -alias getfreesol
```

**Look for this section in the output:**
```
Certificate fingerprints:
  SHA1: XX:XX:XX:...
  SHA256: AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90
```

**Copy the SHA-256 value** (the long string with colons)

---

## 🌐 Step 7: Update Digital Asset Links

1. Edit `public/.well-known/assetlinks.json` in your Replit project

2. Replace `YOUR_SIGNING_KEY_SHA256_FINGERPRINT_HERE` with your actual SHA-256 fingerprint:

```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "xyz.getfreesol.twa",
    "sha256_cert_fingerprints": [
      "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90"
    ]
  }
}
```

3. **Save and deploy** the updated file to your website

4. **Verify it's accessible:**
   ```bash
   curl https://getfreesol.xyz/.well-known/assetlinks.json
   ```

---

## ✅ Step 8: Test the APK (Optional but Recommended)

Before submitting, test your APK:

1. **Install on Android device:**
   ```bash
   adb install app/build/outputs/apk/release/getfreesol-signed.apk
   ```

2. **Test the app:**
   - Opens in fullscreen (no browser UI)
   - Connects to your live website
   - Wallet connection works
   - Scan functionality works

---

## 📤 Step 9: Install Solana Mobile CLI

Now you're ready for the Solana dApp Store submission:

```bash
npm install -g @solana-mobile/dapp-store-cli
```

**Verify:**
```bash
dapp-store --version
```

---

## 📝 Step 10: Create config.yaml

Create a `config.yaml` file for your app metadata:

```yaml
solana_mobile_dapp_publisher_portal:
  app:
    name: "Get Your SOL Back!"
    package_name: "xyz.getfreesol.twa"
    category: CATEGORY_FINANCE
    license_url: "https://getfreesol.xyz/terms-of-service"
    privacy_policy_url: "https://getfreesol.xyz/privacy-policy"
    
  publisher:
    name: "GetFreeSol Team"
    email: "your-email@example.com"
    website: "https://getfreesol.xyz"
    
  release:
    version_name: "1.0.0"
    version_code: 1
    min_sdk: 23
    apk_path: "app/build/outputs/apk/release/getfreesol-signed.apk"
    
  media:
    icon: "https://getfreesol.xyz/icon-512.png"
    banner: "https://getfreesol.xyz/banner-1200x600.png"
    screenshots:
      - "https://getfreesol.xyz/screenshots/screenshot-1.png"
      - "https://getfreesol.xyz/screenshots/screenshot-2.png"
      - "https://getfreesol.xyz/screenshots/screenshot-3.png"
      - "https://getfreesol.xyz/screenshots/screenshot-4.png"
```

**Update:**
- `email`: Your actual contact email
- Other fields as needed

---

## 🎯 Step 11: Mint Publisher NFT

You need a Solana wallet with some SOL for transaction fees (~0.02 SOL).

```bash
dapp-store create publisher <publisher_wallet_address> \
  -k <path_to_keypair.json>
```

**What this does:**
- Mints a Publisher NFT on Solana mainnet
- Records your publisher information on-chain
- Costs: ~0.01 SOL

**Save the Publisher Mint Address** from the output!

---

## 📱 Step 12: Mint App NFT

```bash
dapp-store create app <publisher_mint_address> \
  -k <path_to_keypair.json>
```

**What this does:**
- Mints an App NFT linked to your Publisher NFT
- Registers your app on-chain
- Costs: ~0.01 SOL

**Save the App Mint Address** from the output!

---

## 🚀 Step 13: Submit Release

Final step - submit your app for review:

```bash
dapp-store publish submit <app_mint_address> android \
  -k <path_to_keypair.json>
```

**What this does:**
- Uploads your APK
- Uploads media assets (icons, screenshots)
- Submits for Solana Mobile team review
- Costs: ~0.01 SOL

---

## ⏱️ Step 14: Wait for Review

**Review Timeline:**
- **First-time apps:** 2-3 business days
- **Updates:** 1-2 business days

**You'll receive:**
- Email notification when approved
- Feedback if changes are needed

---

## 🎉 Step 15: Go Live!

Once approved:
- Your app appears in Solana Mobile dApp Store
- Users can install directly to their Saga phones
- You can submit updates anytime using the same process

---

## 🔐 Security Checklist

- [ ] **Keystore file** backed up securely (multiple locations)
- [ ] **Keystore password** saved in password manager
- [ ] **Never commit** keystore to Git/GitHub
- [ ] **Digital Asset Links** updated with correct fingerprint
- [ ] **APK tested** on real Android device

---

## 🆘 Troubleshooting

### "keytool: command not found"
**Solution:** Install Java JDK and add to PATH

### "Android SDK not found"
**Solution:** Install Android Studio or set ANDROID_HOME environment variable

### "Digital Asset Links verification failed"
**Solution:** 
1. Verify file is accessible at `https://getfreesol.xyz/.well-known/assetlinks.json`
2. Check SHA-256 fingerprint matches exactly
3. Ensure no extra spaces/characters in fingerprint

### "APK signing failed"
**Solution:** Verify Java JDK is installed and jarsigner is in PATH

---

## 📞 Support Resources

- **Solana Mobile Discord:** [#dapp-store channel](https://discord.gg/solanamobile)
- **Bubblewrap Docs:** [GitHub](https://github.com/GoogleChromeLabs/bubblewrap)
- **Solana Mobile Docs:** [Portal Guide](https://docs.solanamobile.com/dapp-publishing/intro)

---

## ⚡ Quick Command Reference

```bash
# Install tools
npm install -g @bubblewrap/cli
npm install -g @solana-mobile/dapp-store-cli

# Build APK
bubblewrap init --manifest=https://getfreesol.xyz/manifest.json
cd getfreesol-xyz
bubblewrap build

# Sign APK
keytool -genkey -v -keystore getfreesol-release.keystore -alias getfreesol -keyalg RSA -keysize 2048 -validity 10000
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore getfreesol-release.keystore app/build/outputs/apk/release/app-release-unsigned.apk getfreesol

# Get fingerprint
keytool -list -v -keystore getfreesol-release.keystore -alias getfreesol

# Publish to Solana Mobile
dapp-store create publisher <wallet> -k <keypair>
dapp-store create app <publisher_mint> -k <keypair>
dapp-store publish submit <app_mint> android -k <keypair>
```

---

**Estimated Total Time:** 1-2 hours (first time)

**You're ready to build!** 🚀
