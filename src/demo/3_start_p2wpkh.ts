

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
import ethUtil from 'ethereumjs-util';


const network = networks.testnet

initEccLib(tinysecp as any);
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
// 简单的一个check_sig
// export const validator = (
//   pubkey: Buffer,
//   msghash: Buffer,
//   signature: Buffer,
// ): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export async function startP2WPKH(keyPair: ECPairInterface) {
  const { address } = payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network
  });
  console.log("p2wpkh address = ", address);
  const utxos = await waitUntilUTXO(address)
  const utx = utxos.filter(item => item.value > 2000)[0];
  console.log(`Using UTXO ${utx.txid}:${utx.vout}`);
  const psbt = new Psbt({ network });
  // 添加输入 
  // for segwit inputs, you only need the output script and value as an object.
  // 因为构建的是 segwit 交易，所以不需要scriptSig, 而是witness
  const utxData = await getTxData(utx.txid);
  const witnessUtxo = getWitnessUtxo(utxData.vout[utx.vout]);
  // 解锁上一笔输出，使用witnessUtxo
  psbt.addInput({
    hash: utx.txid,
    index: utx.vout,
    witnessUtxo
  });
  // 添加输出 - 往这个地址转账
  psbt.addOutputs([{
    address: "tb1qz6a5p7fj3syx3zprg9y2rh04nu9cx85f0rk3tg",
    value: 1000 // 转1000聪
  }, {
    address: address, // 找零地址
    value: utx.value - 1500 // 就是付500的gas
  }]);
  console.log(`psbtHex=`, psbt.toHex());

  // 签名pbst的第0个input
  psbt.signInput(0, keyPair);
  console.log(`signed psbtHex=`, psbt.toHex());

  // 验证签名是否正确
  // psbt.validateSignaturesOfInput(0, validator);

  // 定稿
  psbt.finalizeAllInputs();
  console.log(`finalize psbtHex=`, psbt.toHex());

  // 抽取交易
  const txHex = psbt.extractTransaction().toHex();
  console.log(`txHex=`, txHex);

  let txid = await broadcast(txHex);
  console.log(`Success! Txid is ${txid}`);
}


function getWitnessUtxo(out: any): any {
  const script = Buffer.from(out.scriptpubkey, 'hex');
  return {
    value: out.value,
    script, // output里的锁定脚本-scriptpubkey
  };
}