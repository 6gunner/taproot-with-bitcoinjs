

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
import ethUtil from 'ethereumjs-util';

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
  // for segwit inputs, you only need the output script and value as an object.
  // 如果是utxo, 只需要script就好了
  // const witnessUtxo = getWitnessUtxo(utx.outs[unspent.vout]);
  psbt.addInput({
    hash: utxos[utxos.length - 1].txid,
    index: utxos[utxos.length - 1].vout,
    nonWitnessUtxo
  });
  const evmAddress = '0x24afc6350406d01652D9F1C5f48700b65fa53D38'
  let addressBuffer = ethUtil.toBuffer(evmAddress);
  console.log(addressBuffer)
  // 创建OP_RETURN的输出
  let nullData = payments.embed({ data: [addressBuffer] });
  // 将OP_RETURN的输出加入到交易中
  psbt.addOutput({ script: nullData.output, value: 0 });
  // 添加输出 - 往这个地址转账
  psbt.addOutputs([{
    address: "tb1q8xnm2arlmeu88ymemhm93dme4lw9fs225f8ay7",
    value: utxos[utxos.length - 1].value - 2000 // 就是付1000的gas
  }]);
  psbt.signInput(0, keyPair);
  // 验证签名是否正确
  psbt.validateSignaturesOfInput(0, validator);

  psbt.finalizeAllInputs();

  // 构造最终交易并转化为十六进制表示
  const txHex = psbt.extractTransaction().toHex();
  console.log(txHex);

  let txid = await broadcast(txHex);
  console.log(`Success! Txid is ${txid}`);
}



function getWitnessUtxo(out: any): any {
  delete out.address;
  out.script = Buffer.from(out.script, 'hex');
  return out;
}