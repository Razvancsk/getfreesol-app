# Quick Deploy Instructions

## 1. Create New Replit
- Template: "Solana Anchor" or "Rust"
- This installs Anchor CLI + Solana CLI automatically

## 2. Copy These Files
Copy entire `programs/auto-claim/` folder to the new Replit

## 3. Deploy to Devnet
```bash
cd programs/auto-claim
anchor build
anchor deploy --provider.cluster devnet
```

## 4. Copy Program ID
The deploy command outputs: `Program Id: <PROGRAM_ID>`
Copy this ID

## 5. Update This App
Replace `TEMP1111111111111111111111111111111111111111` in:
- `programs/auto-claim/src/lib.rs` (line 11)
- `Anchor.toml` (lines 7 and 10)

## 6. Initialize Config (Once)
```bash
anchor run initialize-config
```

Done! The program is live on devnet.
