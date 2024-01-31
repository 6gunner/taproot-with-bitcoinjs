import {
  script,
  opcodes,
  networks,
  payments,
  Psbt
} from "bitcoinjs-lib";
import { broadcast, getTxHex, waitUntilUTXO } from "../blockstream_utils";
import { ECPairInterface, ECPairFactory, ECPairAPI } from 'ecpair';

const network = networks.testnet

/**
 * 最简单版本的p2sh
 * @returns 
 * 
 */
export async function startP2sh(keyPair: ECPairInterface) {

  // 构建一个script: 要求两个数加起来等于5；
  const locking_script = script.compile([
    opcodes.OP_ADD,
    script.number.encode(5),
    opcodes.OP_EQUAL
  ]);

  // 构建一个p2sh的地址，
  const p2shPayment = payments.p2sh({ redeem: { output: locking_script }, network });
  console.log("p2sh address = " + p2shPayment.address);

  // await 手动操作：向这个地址发一些bitcoin
  // 现在这些bitcoin就被锁定在p2sh地址上了，想要花这些bitcoin，就得拿redeem script来签名解锁；

  // 等待链上能查到utxo
  const utxos = await waitUntilUTXO(p2shPayment.address);
  const utx = utxos.filter(item => item.value >= 2000)[0];
  console.log(`Using UTXO ${utx.txid}:${utx.vout}`);
  const txHex = await getTxHex(utx.txid);

  // 构建一个psbt来去花p2sh地址上的btc
  const psbt = new Psbt({ network });
  const unlockingData = [
    script.number.encode(2),
    script.number.encode(3)
  ];
  // 花费这个地址上的utxo需要构建一个pbst
  psbt.addInput({
    hash: utx.txid,
    index: utx.vout,
    redeemScript: p2shPayment.redeem.output,
    nonWitnessUtxo: Buffer.from(txHex, 'hex'),
    finalScriptSig: script.compile([
      ...unlockingData,
      p2shPayment.redeem.output,
    ]),
  });
  // 添加输出
  psbt.addOutput({
    address: "2MvwqzfEHjA7UEzZz14WQkGCwbJJchHUjBb", // coda测试，账户1
    // 留了一些给gas
    value: utx.value - 500, // 500给矿工
  });
  console.log(`psbt.toBase64=`, psbt.toBase64());
  // psbt.finalizeAllInputs();
  // console.log(`psbt.finalizeInput.toBase64=`, psbt.toBase64());
  // 生成交易
  const tx = psbt.extractTransaction();
  console.log(`tx hex=`, tx.toHex());
  // 最后我们将交易广播出去
  const txid = await broadcast(tx.toHex());
  console.log(`Success! Txid is ${txid}`);


}