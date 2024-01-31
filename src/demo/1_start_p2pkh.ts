

import { ECPairInterface, ECPairFactory, ECPairAPI } from 'ecpair';
import { broadcast, getTxHex, waitUntilUTXO } from "../blockstream_utils";
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

export async function startP2PKH(keyPair: ECPairInterface) {

  // 生成p2pkh payments
  const { address } = payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: networks.testnet
  });
  console.log("p2pkh address = ", address);
  const utxos = await waitUntilUTXO(address)
  const utx = utxos[utxos.length - 1];
  console.log(`Using UTXO ${utx.txid}:${utx.vout}`);
  const psbt = new Psbt({ network });
  // 添加输入 
  // for non segwit inputs, you must pass the full transaction buffer
  // 如果不是隔离见证类型的utxo，那么需要传txHex
  const utxHex = await getTxHex(utx.txid);
  const nonWitnessUtxo = Buffer.from(utxHex, 'hex');
  psbt.addInput({
    hash: utxos[utxos.length - 1].txid,
    index: utxos[utxos.length - 1].vout,
    nonWitnessUtxo
  });
  // 添加输出 - 往这个地址转账
  psbt.addOutputs([{
    address: "mvwzqrwQiV2euuaMMq4XGsdeKtX6Q7FEe9",
    value: 1000,
  },
  {
    address,
    value: utxos[utxos.length - 1].value - 1500 // 就是付500的gas
  }]);
  console.log(`psbt.toBase64=`, psbt.toBase64());

  psbt.signInput(0, keyPair);
  // 验证签名是否正确
  // psbt.validateSignaturesOfInput(0, validator);
  psbt.finalizeAllInputs();
  console.log(`psbt.finalizeAllInputs.toBase64=`, psbt.toBase64());

  // 构造最终交易并转化为十六进制表示
  const txHex = psbt.extractTransaction().toHex();
  console.log(txHex);

  // let txid = await broadcast(txHex);
  // console.log(`Success! Txid is ${txid}`);
}



function getWitnessUtxo(out: any): any {
  delete out.address;
  out.script = Buffer.from(out.script, 'hex');
  return out;
}