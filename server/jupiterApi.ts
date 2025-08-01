import fetch from 'node-fetch';

export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | any;
  priceImpactPct: string;
  routePlan: any[];
}

// Get all Jupiter tokens
export async function getJupiterTokens(): Promise<JupiterToken[]> {
  try {
    const response = await fetch('https://token.jup.ag/all');
    if (!response.ok) {
      throw new Error(`Jupiter tokens API error: ${response.statusText}`);
    }
    const tokens = await response.json() as JupiterToken[];
    return tokens;
  } catch (error) {
    console.error('Error fetching Jupiter tokens:', error);
    throw error;
  }
}

// Search Jupiter tokens by query
export async function searchJupiterTokens(query: string): Promise<JupiterToken[]> {
  try {
    const allTokens = await getJupiterTokens();
    const searchTerm = query.toLowerCase();
    
    return allTokens.filter(token => 
      token.symbol.toLowerCase().includes(searchTerm) ||
      token.name.toLowerCase().includes(searchTerm) ||
      token.address.toLowerCase().includes(searchTerm)
    ).slice(0, 50); // Limit to 50 results
  } catch (error) {
    console.error('Error searching Jupiter tokens:', error);
    throw error;
  }
}

// Get Jupiter quote for swap
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 100
): Promise<JupiterQuote> {
  try {
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Jupiter quote API error: ${response.statusText}`);
    }
    
    const quote = await response.json() as JupiterQuote;
    return quote;
  } catch (error) {
    console.error('Error getting Jupiter quote:', error);
    throw error;
  }
}

// Get token info by mint address
export async function getTokenInfo(mintAddress: string): Promise<JupiterToken | null> {
  try {
    const allTokens = await getJupiterTokens();
    return allTokens.find(token => token.address === mintAddress) || null;
  } catch (error) {
    console.error('Error getting token info:', error);
    return null;
  }
}