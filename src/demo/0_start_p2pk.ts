

import { ECPairInterface, ECPairFactory, ECPairAPI } from 'ecpair';
import { broadcast, getTxData, getTxHex, waitUntilUTXO } from "../blockstream_utils";
import {
  address,
  initEccLib,
  networks,
  payments,
  Psbt
} from "bitcoinjs-lib";
import * as tinysecp from 'tiny-secp256k1';

const network = networks.testnet

initEccLib(tinysecp as any);
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export async function startP2PK(keyPair: ECPairInterface) {

  const psbt = new Psbt({ network });
  const address = "2MvwqzfEHjA7UEzZz14WQkGCwbJJchHUjBb";
  const utxos = await waitUntilUTXO(address)
  const utx = utxos.filter(item => item.value >= 2000)[0];
  console.log(`utx = `, utx);
  const utxData = await getTxData(utx.txid);

  // 因为我这个address的类型是p2sh,内嵌了p2wpkh，所以需要以下数据
  const p2sh = payments.p2sh({
    redeem: payments.p2wpkh({ pubkey: keyPair.publicKey, network }),
    network
  })
  console.log(`xxx =`, p2sh.address);

  psbt.addInput({
    hash: utx.txid,
    index: utx.vout,
    witnessUtxo: {
      script: Buffer.from(utxData.vout[utx.vout].scriptpubkey, 'hex'),
      value: utx.value
    },
    redeemScript: p2sh.redeem.output  // 这是一个p2sh的output
  });
  const p2pkPayment = payments.p2pk({ pubkey: keyPair.publicKey, network });
  // 添加输出 - 往这个地址转账
  psbt.addOutputs([{
    script: p2pkPayment.output,
    value: 1000,
  },
  {
    address,
    value: utx.value - 1500 // 就是付500的gas
  }
  ]);
  console.log(`psbt.toBase64=`, psbt.toBase64());
  psbt.signInput(0, keyPair);

  // 验证签名是否正确
  // psbt.validateSignaturesOfInput(0, validator);
  psbt.finalizeAllInputs();
  console.log(`psbt.finalizeAllInputs.toBase64=`, psbt.toBase64());

  // 构造最终交易并转化为十六进制表示
  const txHex = psbt.extractTransaction().toHex();
  console.log(txHex);

  let txid = await broadcast(txHex);
  console.log(`Success! Txid is ${txid}`);
}