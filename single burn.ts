import { publicKey } from "@metaplex-foundation/umi";
import {
  burn,
  fetchAsset,
  collectionAddress,
  fetchCollection,
} from "@metaplex-foundation/mpl-core";

const assetId = publicKey("11111111111111111111111111111111");
const asset = await fetchAsset(umi, assetId);

await burn(umi, {
  asset: asset,
}).sendAndConfirm(umi);
