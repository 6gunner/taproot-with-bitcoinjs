import {
  script,
  opcodes,
  networks,
  payments,
  Psbt
} from "bitcoinjs-lib";
import { broadcast, waitUntilUTXO } from "../blockstream_utils";
import { witnessStackToScriptWitness } from '../utils';

const network = networks.testnet

/**
 * 最简单版本的p2sh
 * @returns 
 * 
 */
export async function startP2sh() {

  // 构建一个script: 要求两个数加起来等于5；
  const locking_script = script.compile([
    opcodes.OP_ADD,
    script.number.encode(5),
    opcodes.OP_EQUAL
  ]);

  // 构建一个p2sh的地址，
  const p2sh = payments.p2sh({ redeem: { output: locking_script }, network });
  console.log("p2sh address = " + p2sh.address);

  // await 手动操作：向这个地址发一些bitcoin
  // 等待链上确认到账
  const utxos = await waitUntilUTXO(p2sh.address)
  const utx = utxos.filter(item => item.value > 2000)[0];
  console.log(`Using UTXO ${utx.txid}:${utx.vout}`);

  // 现在这些bitcoin就被锁定在p2sh地址上了，想要花这些bitcoin，就得拿redeem script来签名解锁；

  // 构建一个psbt来去花p2sh地址上的btc
  const psbt = new Psbt({ network });
  // 拿上一笔的utxo作为输入，然后指定
  psbt.addInput({
    hash: utx.txid,
    index: utx.vout,
    value: utx.value,
    // 不用隔离见证字段
  });
  // 添加输出
  psbt.addOutput({
    address: "2MvwqzfEHjA7UEzZz14WQkGCwbJJchHUjBb",
    // 留了一些给gas
    value: utx.value - 500, // 500给矿工
  });

  psbt.signInput(0,);

  // 对输入0进行签名验证，因为验证需要脚本，所以我再提供一个witness的脚本
  psbt.finalizeInput(0, (_inputIndex: number, input: any) => {
    const redeemPayment = payments.p2wsh({
      redeem: {
        input: script.compile([
          script.number.encode(1),
          script.number.encode(4)
        ]),
        output: input.witnessScript
      }
    });

    const finalScriptWitness = witnessStackToScriptWitness(
      redeemPayment.witness ?? []
    );

    return {
      finalScriptSig: Buffer.from(""), // 因为我们lock script不需要任何签名，所以这里就传空
      finalScriptWitness
    }
  });

  // 生成交易
  const tx = psbt.extractTransaction();
  console.log(tx.toHex());

  // 最后我们将交易广播出去
  const txid = await broadcast(tx.toHex());
  console.log(`Success! Txid is ${txid}`);


}