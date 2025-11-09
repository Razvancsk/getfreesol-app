# ☁️ Cloud Build Guide - NO Android SDK Required!

## 🎉 Build Your Android APK Online Using PWABuilder

You can build your Android APK **completely in the cloud** without installing ANY developer tools on your computer!

---

## ✅ Option 1: PWABuilder (Microsoft - RECOMMENDED)

**Website:** https://www.pwabuilder.com

### Why PWABuilder?
- ✅ **Completely FREE**
- ✅ **No installation required** - works in your browser
- ✅ **Official Microsoft tool**
- ✅ **Generates both APK (testing) and AAB (Play Store)**
- ✅ **Handles signing automatically**
- ✅ **TWA technology** - fullscreen app experience
- ✅ **Most trusted and actively maintained**

### Step-by-Step Instructions:

#### 1. Go to PWABuilder
Visit: https://www.pwabuilder.com

#### 2. Enter Your PWA URL
In the search box, enter:
```
https://getfreesol.xyz
```

Click **"Start"** or **"Get Started"**

#### 3. Review Your PWA Score
PWABuilder will analyze your manifest and give you a score.  
Your app should score well since all assets are ready!

#### 4. Click "Package For Stores"
Look for the **"Package For Stores"** or **"Publish"** button

#### 5. Select Android
Choose **"Android"** as your target platform

#### 6. Configure App Details
PWABuilder will auto-fill most fields from your manifest:

**Auto-filled (verify these):**
- App name: "Get Your SOL Back!"
- Short name: "GetFreeSol"
- Package ID: Suggest `xyz.getfreesol.twa`
- Theme color: #7c3aed
- Background color: #581c87
- Icons: Automatically pulled from your manifest

**You need to provide:**
- **Package ID:** `xyz.getfreesol.twa` (or your preference)
- **App version:** `1` (version code)
- **App version name:** `1.0.0`

#### 7. Configure Signing Options

**Choose one:**

**Option A: Let PWABuilder Sign (Easiest)**
- Select "Generate new signing key"
- PWABuilder will create a keystore for you
- **IMPORTANT:** Download and save the signing key file!

**Option B: Upload Your Own Key (if you have one)**
- Upload your `.keystore` file
- Enter keystore password
- Enter key alias
- Enter key password

**For first-time users, choose Option A!**

#### 8. Generate Package
Click **"Generate Package"** or **"Download"**

#### 9. Download Your Files
PWABuilder will generate and let you download:
- ✅ **`app-release-signed.apk`** - For testing/Solana Mobile
- ✅ **`app-release-bundle.aab`** - For Google Play Store
- ✅ **Signing key** (`.keystore` file) - **SAVE THIS!**
- ✅ **Digital Asset Links file** - Update on your site

#### 10. Update Digital Asset Links
- PWABuilder provides the correct `assetlinks.json` file
- Copy the SHA-256 fingerprint
- Update your `/public/.well-known/assetlinks.json` file in Replit
- Deploy the updated file

---

## ✅ Option 2: PWA2APK (Appmaker.xyz)

**Website:** https://pwa2apk.com

### Quick Steps:

1. Go to https://pwa2apk.com
2. Enter your URL: `https://getfreesol.xyz`
3. Set app name and icon (auto-detected)
4. Download verification JSON file
5. Upload JSON to your site (if required)
6. Click **"Generate APK"**
7. Download:
   - APK file
   - Signing certificate
   - Source code

**Note:** Free version has limitations on package name customization.

---

## ✅ Option 3: AppsGeyser (100% Free, Simple)

**Website:** https://appsgeyser.com

### Quick Steps:

1. Go to https://appsgeyser.com
2. Click **"Create App"**
3. Choose **"Website"** template
4. Enter: `https://getfreesol.xyz`
5. Set app name: "Get Your SOL Back!"
6. Upload icon (optional - uses your favicon)
7. Click **"Create App"**
8. Download APK file

**Note:** This is the simplest option but provides less customization.

---

## 📦 What You'll Get

After using any of these services, you'll have:

- ✅ **Signed APK file** (ready for Solana Mobile dApp Store)
- ✅ **Signing key/certificate** (for future updates)
- ✅ **Digital Asset Links data** (SHA-256 fingerprint)
- ✅ **(Optional) AAB file** (for Google Play Store)
- ✅ **(Optional) Source code** (Android project files)

---

## 🔄 After Building: Update Digital Asset Links

1. **Get the SHA-256 fingerprint** from the cloud service output

2. **Update your `assetlinks.json` file in Replit:**

Edit `public/.well-known/assetlinks.json`:
```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "xyz.getfreesol.twa",
    "sha256_cert_fingerprints": [
      "PASTE_YOUR_SHA256_HERE"
    ]
  }
}
```

3. **Verify it's accessible:**
```bash
curl https://getfreesol.xyz/.well-known/assetlinks.json
```

4. **Test your APK** on an Android device:
- Install the APK
- App should open in fullscreen (no browser UI)
- Verify wallet connection works

---

## 🚀 Submit to Solana Mobile dApp Store

Once you have your signed APK:

### 1. Install Solana Mobile CLI
```bash
npm install -g @solana-mobile/dapp-store-cli
```

### 2. Follow Submission Process
See `LOCAL_BUILD_GUIDE.md` steps 10-15 for detailed instructions:
- Create `config.yaml`
- Mint Publisher NFT
- Mint App NFT  
- Submit Release

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Build APK with PWABuilder | 5-10 minutes |
| Update Digital Asset Links | 2-3 minutes |
| Test APK on device | 5-10 minutes |
| Submit to Solana Mobile | 15-30 minutes |
| **Review & Approval** | **2-3 business days** |
| **TOTAL** | **~3-4 days** |

---

## 🎯 Comparison: Cloud vs Local Build

| Factor | Cloud Build (PWABuilder) | Local Build (Bubblewrap) |
|--------|-------------------------|-------------------------|
| **Setup time** | 0 minutes | 30-60 minutes |
| **Prerequisites** | Browser only | Node.js, JDK, Android SDK |
| **Difficulty** | Easy (web form) | Medium (command line) |
| **Signing** | Automatic | Manual |
| **Output** | APK + AAB | APK + AAB |
| **Cost** | FREE | FREE |
| **Best for** | Quick start, first-time | Advanced users, CI/CD |

---

## 🔐 Security Note

**CRITICAL:** Whichever service you use, **SAVE YOUR SIGNING KEY!**

The signing key is required for:
- ✅ Publishing updates to your app
- ✅ Maintaining the same app identity
- ✅ User trust and security

**If you lose the key, you cannot update your app - you'd have to create a NEW app!**

---

## ✅ Recommendation

**Use PWABuilder (Option 1)** because:
- Official Microsoft tool
- Most reliable and trusted
- Actively maintained
- Provides both APK and AAB
- Best documentation and support
- Used by thousands of developers

---

## 🆘 Troubleshooting

### "PWA validation failed"
**Fix:** Ensure your manifest.json is accessible at `https://getfreesol.xyz/manifest.json`

### "Icons not found"
**Fix:** Verify icons are accessible:
- https://getfreesol.xyz/icon-192.png
- https://getfreesol.xyz/icon-512.png

### "Service worker not detected"
**Fix:** PWAs require a service worker. If you don't have one, the cloud services will add basic functionality.

### "Digital Asset Links verification failed"
**Fix:**
1. Get SHA-256 from cloud service
2. Update `assetlinks.json` exactly as provided
3. Ensure file is at: `https://getfreesol.xyz/.well-known/assetlinks.json`

---

## 📞 Support

- **PWABuilder Discord:** https://aka.ms/pwabuilderdiscord
- **PWABuilder Docs:** https://docs.pwabuilder.com/
- **Solana Mobile Discord:** #dapp-store channel

---

**Start here:** https://www.pwabuilder.com

Enter `https://getfreesol.xyz` and let the cloud do the work! 🚀
