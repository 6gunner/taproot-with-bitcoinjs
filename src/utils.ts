import {
  initEccLib,
  crypto,
} from "bitcoinjs-lib";
import { ECPairFactory } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import type { Signer } from "bitcoinjs-lib";
import type { ECPairAPI, TinySecp256k1Interface } from 'ecpair';

initEccLib(tinysecp as any);
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

export function tweakSigner(signer: Signer, opts: any = {}): Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = tinysecp.privateNegate(privateKey);
  }

  const tweakedPrivateKey = tinysecp.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash),
  );
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey]),
  );
}

export function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33)
}

export const MAXIMUM_SCRIPT_ELEMENT_SIZE = 520

export function opPush(data: string | Buffer) {
  const buff = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")
  if (buff.byteLength > MAXIMUM_SCRIPT_ELEMENT_SIZE)
    throw new Error("Data is too large to push. Use chunkContent to split data into smaller chunks")
  return Buffer.concat([buff])
}