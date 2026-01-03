import { PublicKey } from "@solana/web3.js";
import { storage } from "../storage";
import { deriveProjectPDA } from "../pdaService";
import { nanoid } from "nanoid";

// Platform wallet address
const PLATFORM_WALLET = "GETjtmGryhn2NvQovweRVU4RZHZDURoQWcioTZGcbRQS";

export async function initializePlatform() {
  console.log("🚀 Initializing platform project account...");
  
  // Check if already initialized
  const existing = await storage.getProjectAccount();
  if (existing) {
    console.log("✅ Platform already initialized");
    console.log("   Project PDA:", existing.projectPda);
    console.log("   Name:", existing.projectName);
    return existing;
  }
  
  // Derive the PDA
  const platformKey = new PublicKey(PLATFORM_WALLET);
  const [projectPDA, bump] = deriveProjectPDA(platformKey);
  
  console.log("   Platform Wallet:", PLATFORM_WALLET);
  console.log("   Project PDA:", projectPDA.toBase58());
  console.log("   Bump:", bump);
  
  // Create the project account
  const project = await storage.createProjectAccount({
    projectName: "Get Your SOL Back",
    baseKey: PLATFORM_WALLET,
    projectPda: projectPDA.toBase58(),
    adminWallet: PLATFORM_WALLET,
    bump
  });
  
  console.log("✅ Platform initialized successfully!");
  console.log("   Project ID:", project.id);
  console.log("   Project PDA:", project.projectPda);
  
  return project;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializePlatform()
    .then(() => {
      console.log("\n✅ Initialization complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Initialization failed:", error);
      process.exit(1);
    });
}
