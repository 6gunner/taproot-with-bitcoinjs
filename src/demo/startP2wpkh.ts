

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
export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

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
  // 1：for non segwit inputs, you must pass the full transaction buffer
  // 如果不是隔离见证类型的utxo，那么需要传txHex
  // const utxHex = await getTxHex(utx.txid);
  // const nonWitnessUtxo = Buffer.from(utxHex, 'hex');

  // 2：for segwit inputs, you only need the output script and value as an object.
  // 如果是utxo, 只需要script就好了
  const utxData = await getTxData(utx.txid);
  const witnessUtxo = getWitnessUtxo(utxData.vout[utx.vout]);
  psbt.addInput({
    hash: utx.txid,
    index: utx.vout,
    witnessUtxo
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
    address: "tb1qq9es9cv4p0rjqhqalxngxegn758re7tm2pgurx",
    value: 1000 // 转1000
  }, {
    address: "tb1qcvmrt2qzm7xz3u7gepm3wkyp6rpdura52av44y", // 找零地址
    value: utx.value - 2000 // 就是付1000的gas
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
  const script = Buffer.from(out.scriptpubkey, 'hex');
  return {
    value: out.value,
    script,
  };
}