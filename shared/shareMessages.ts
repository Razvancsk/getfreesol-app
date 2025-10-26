/**
 * Shared utilities for social sharing messages
 * Used by both client-side ShareModal and server-side OG tag generation
 */

export const SHARE_MESSAGE_TEMPLATES = [
  (sol: string) => `Found a sneaky ${sol} $SOL chilling in my wallet 👀 Snagged it instantly with @getfreesol_xyz 💜`,
  (sol: string) => `Didn't expect to see ${sol} $SOL appear out of nowhere 👀 Claimed it right away with @getfreesol_xyz 💜`,
  (sol: string) => `Tiny surprise in my wallet today — ${sol} $SOL 💜 Quick claim through @getfreesol_xyz`,
  (sol: string) => `Found some free $SOL I didn't even know I had 😎 @getfreesol_xyz made the claim instant 💜`,
  (sol: string) => `🎯 Just spotted ${sol} $SOL waiting for me — claimed it instantly with @getfreesol_xyz 💜 Try your luck ⚡`,
  (sol: string) => `Found ${sol} $SOL sitting unclaimed — grabbed it in seconds with @getfreesol_xyz ⚡ You might have some too 💜`,
  (sol: string) => `Surprised to see ${sol} $SOL ready to claim — used @getfreesol_xyz and it was instant ⚡`,
  (sol: string) => `🎯 Just claimed ${sol} $SOL through @getfreesol_xyz 💜 Quick, clean, and smooth ⚡`,
  (sol: string) => `🚀 Surprised to see ${sol} $SOL waiting — claimed it easily with @getfreesol_xyz`,
  (sol: string) => `🔥 Just noticed ${sol} $SOL hiding — claimed it with @getfreesol_xyz. Worth a look 💜`,
  (sol: string) => `Found ${sol} $SOL unclaimed — used @getfreesol_xyz to collect it. See what you've got!`,
  (sol: string) => `🎯 ${sol} $SOL popped up — claimed it through @getfreesol_xyz. Try your chance!`
];

/**
 * Convert lamports to SOL with 6 decimal precision
 */
export function lamportsToSol(lamports: number | string): string {
  const lamportsNum = typeof lamports === 'string' ? parseInt(lamports, 10) : lamports;
  return (lamportsNum / 1e9).toFixed(6);
}

/**
 * Get a deterministic message based on lamports amount
 * Same amount will always return the same message
 */
export function getShareMessage(lamports: number | string): string {
  const lamportsNum = typeof lamports === 'string' ? parseInt(lamports, 10) : lamports;
  const sol = lamportsToSol(lamportsNum);
  const messageIndex = lamportsNum % SHARE_MESSAGE_TEMPLATES.length;
  return SHARE_MESSAGE_TEMPLATES[messageIndex](sol);
}

/**
 * Get a random message (non-deterministic)
 * Used for client-side random selection
 */
export function getRandomShareMessage(lamports: number | string): string {
  const sol = lamportsToSol(lamports);
  const randomIndex = Math.floor(Math.random() * SHARE_MESSAGE_TEMPLATES.length);
  return SHARE_MESSAGE_TEMPLATES[randomIndex](sol);
}

/**
 * Generate share title for social media
 */
export function getShareTitle(lamports: number | string): string {
  const sol = lamportsToSol(lamports);
  return `Just claimed ${sol} $SOL I didn't even know I had! @getfreesol_xyz makes it super easy. Give it a shot!`;
}
