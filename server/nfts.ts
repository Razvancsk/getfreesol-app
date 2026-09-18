import { PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createNoopSigner, publicKey as umiPk, unwrapOption, type Umi } from "@metaplex-foundation/umi";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import {
  burnV1,
  fetchDigitalAssetWithAssociatedToken,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { burn as burnCoreAsset, fetchAsset, fetchCollection, mplCore } from "@metaplex-foundation/mpl-core";
import { heliusRpc, RPC_URL } from "./config";
import { packTransactions, type IxGroup } from "./pack";

let umiInstance: Umi | null = null;
function umi() {
  if (!umiInstance) umiInstance = createUmi(RPC_URL).use(mplTokenMetadata()).use(mplCore());
  return umiInstance;
}

export interface NftInfo {
  id: string;
  name: string;
  image: string | null;
  collection: string | null;
  kind: "nft" | "pnft" | "core";
  /** Why this NFT is risky to burn, or null when nothing looks off */
  warning: string | null;
}

// Names that usually belong to something holding real funds rather than a collectible
const RISKY_NAME = /position|liquidity|receipt|staked|vault|do\s*not\s*burn/i;

export async function scanNfts(owner: PublicKey): Promise<NftInfo[]> {
  const nfts: NftInfo[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await heliusRpc<any>("getAssetsByOwner", {
      ownerAddress: owner.toBase58(),
      page,
      limit: 1000,
      displayOptions: { showFungible: false, showCollectionMetadata: true },
    });
    const items: any[] = result?.items || [];
    for (const a of items) {
      if (a.burnt || a.compression?.compressed) continue;
      const name: string = a.content?.metadata?.name || "Unnamed NFT";
      let kind: NftInfo["kind"];
      if (a.interface === "MplCoreAsset") kind = "core";
      else if (a.interface === "ProgrammableNFT") kind = "pnft";
      else if (a.interface === "V1_NFT" || a.interface === "Legacy") kind = "nft";
      else continue;
      // Nothing is hidden, but anything that looks staked, listed or fund-holding is flagged
      let warning: string | null = null;
      if (RISKY_NAME.test(name)) warning = "May hold funds - looks like an LP or staking position";
      else if (a.ownership?.frozen) warning = "Frozen - usually staked or listed for sale";
      else if (a.ownership?.delegated) warning = "Control given to another program - may be staked or listed";
      const group = a.grouping?.find((g: any) => g.group_key === "collection");
      nfts.push({
        id: a.id,
        name,
        image: a.content?.links?.image || a.content?.files?.[0]?.cdn_uri || a.content?.files?.[0]?.uri || null,
        collection: group?.collection_metadata?.name || null,
        kind,
        warning,
      });
    }
    if (items.length < 1000) break;
  }
  return nfts;
}

async function burnGroup(owner: PublicKey, id: string): Promise<IxGroup | null> {
  const u = umi();
  const signer = createNoopSigner(umiPk(owner.toBase58()));
  const account = await u.rpc.getAccount(umiPk(id));
  if (!account.exists) return null;

  let builder;
  if (account.owner.toString() === "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d") {
    const asset = await fetchAsset(u, umiPk(id));
    if (asset.owner.toString() !== owner.toBase58()) return null;
    const collection =
      asset.updateAuthority.type === "Collection" && asset.updateAuthority.address
        ? await fetchCollection(u, asset.updateAuthority.address)
        : undefined;
    builder = burnCoreAsset(u, { asset, collection, authority: signer, payer: signer });
  } else {
    const da = await fetchDigitalAssetWithAssociatedToken(u, umiPk(id), signer.publicKey);
    if (da.token.amount !== 1n) return null;
    if (da.edition && !da.edition.isOriginal) {
      console.warn(`[nfts] ${id} is a print edition, skipped`);
      return null;
    }
    const collection = unwrapOption(da.metadata.collection);
    builder = burnV1(u, {
      mint: da.mint.publicKey,
      authority: signer,
      tokenOwner: signer.publicKey,
      token: da.token.publicKey,
      tokenStandard: unwrapOption(da.metadata.tokenStandard) ?? TokenStandard.NonFungible,
      collectionMetadata: collection?.verified ? findMetadataPda(u, { mint: collection.key }) : undefined,
    });
  }

  return {
    id,
    instructions: builder.getInstructions().map(toWeb3JsInstruction),
    reclaimLamports: null, // measured by simulation
    computeUnits: 150_000,
  };
}

export async function buildNftBurnTransactions(owner: PublicKey, ids: string[]) {
  const groups: IxGroup[] = [];
  for (const id of ids) {
    try {
      const g = await burnGroup(owner, id);
      if (g) groups.push(g);
    } catch (e) {
      console.warn(`[nfts] cannot burn ${id}:`, (e as Error).message);
    }
  }
  // One NFT per transaction so a single locked/failing NFT never blocks the others
  return packTransactions(owner, groups, 1);
}
