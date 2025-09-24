import { publicKey } from "@metaplex-foundation/umi";
import { burnV1, fetchAsset } from "@metaplex-foundation/mpl-core";

import { publicKey } from "@metaplex-foundation/umi";
import {
  burn,
  fetchAsset,
  collectionAddress,
  fetchCollection,
} from "@metaplex-foundation/mpl-core";

const assetId = publicKey("11111111111111111111111111111111");
const asset = await fetchAsset(umi, assetId);

const collectionId = collectionAddress(asset);

let collection = undefined;

if (collectionId) {
  collection = await fetchCollection(umi, collection);
}

await burn(umi, {
  asset: asset,
  collection: collection,
}).sendAndConfirm(umi);
