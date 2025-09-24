import type { Umi } from '@metaplex-foundation/umi';

/**
 * Single NFT Burn - Basic burn example
 * Burns a single Core NFT asset without collection handling
 */
export async function burnSingleAsset(umi: Umi, assetId: string) {
  try {
    console.log('Starting single asset burn for:', assetId);
    
    // Dynamic imports to avoid browser compatibility issues
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { burn, fetchAsset } = await import('@metaplex-foundation/mpl-core');
    
    const assetPublicKey = publicKey(assetId);
    const asset = await fetchAsset(umi, assetPublicKey);
    
    const result = await burn(umi, {
      asset: asset,
    }).sendAndConfirm(umi);
    
    console.log('Single asset burn successful:', result);
    return {
      success: true,
      signature: result.signature,
      type: 'single',
      assetId
    };
  } catch (error: any) {
    console.error('Single asset burn failed:', error);
    throw new Error(`Failed to burn single asset: ${error?.message || error}`);
  }
}

/**
 * Collection NFT Burn - Complete burn example with collection handling
 * Burns a Core NFT asset with proper collection handling
 */
export async function burnAssetWithCollection(umi: Umi, assetId: string) {
  try {
    console.log('Starting collection asset burn for:', assetId);
    
    // Dynamic imports to avoid browser compatibility issues
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { burn, fetchAsset, collectionAddress, fetchCollection } = await import('@metaplex-foundation/mpl-core');
    
    const assetPublicKey = publicKey(assetId);
    const asset = await fetchAsset(umi, assetPublicKey);
    
    const collectionId = collectionAddress(asset);
    
    let collection = undefined;
    
    if (collectionId) {
      console.log('Fetching collection:', collectionId);
      collection = await fetchCollection(umi, collectionId);
    }
    
    const result = await burn(umi, {
      asset: asset,
      collection: collection,
    }).sendAndConfirm(umi);
    
    console.log('Collection asset burn successful:', result);
    return {
      success: true,
      signature: result.signature,
      type: 'collection',
      assetId,
      collectionId: collectionId?.toString()
    };
  } catch (error: any) {
    console.error('Collection asset burn failed:', error);
    throw new Error(`Failed to burn asset with collection: ${error?.message || error}`);
  }
}

/**
 * Batch burn multiple NFTs using the appropriate method based on collection
 */
export async function burnMultipleAssets(umi: Umi, assetIds: string[], useCollectionMethod: boolean = true) {
  console.log(`Starting batch burn of ${assetIds.length} assets`);
  
  const results = [];
  const errors = [];
  
  for (const assetId of assetIds) {
    try {
      const result = useCollectionMethod 
        ? await burnAssetWithCollection(umi, assetId)
        : await burnSingleAsset(umi, assetId);
      
      results.push(result);
    } catch (error) {
      console.error(`Failed to burn asset ${assetId}:`, error);
      errors.push({ assetId, error: (error as any)?.message || error });
    }
  }
  
  return {
    successful: results,
    failed: errors,
    totalProcessed: assetIds.length,
    successCount: results.length,
    failCount: errors.length
  };
}