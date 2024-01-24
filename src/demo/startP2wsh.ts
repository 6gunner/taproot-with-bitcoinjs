import {
  script,
  opcodes,
  networks,
  payments,
  Psbt
} from "bitcoinjs-lib";
import { broadcast, waitUntilUTXO } from "../blockstream_utils";
import { witnessStackToScriptWitness } from '../witness_stack_to_script_witness';

const network = networks.testnet

// 不需要私钥就能花钱
export async function startP2wsh() {

  // 构建一个script OP_ADD 5 OP_EQUAL
  const locking_script = script.compile([
    opcodes.OP_ADD,
    script.number.encode(5),
    opcodes.OP_EQUAL
  ]);
  // 构建一个p2wsh的地址，
  const p2wsh = payments.p2wsh({ redeem: { output: locking_script, network }, network });
  console.log("p2wsh address = " + p2wsh.address);
  console.log("p2wsh output == locking_script?", p2wsh.output == locking_script);
  if (!p2wsh.address) {
    console.error("地址为空....");
    return;
  }
  // ....我们向这个地址发一些bitcoin, （我没通过程序，在外面手动转的哈!!）....
  // 等待链上确认到账
  const utxos = await waitUntilUTXO(p2wsh.address)
  console.log(`Using UTXO ${utxos[utxos.length - 1].txid}:${utxos[utxos.length - 1].vout}`);
  // 现在这些bitcoin就被锁定在某一个地址上了，想要花这些bitcoin，就得拿redeem script来签名解锁；
  // 你可以理解 locking_script是一个公钥，得拿私钥来，私钥就是redeem script

  // 构建一个psbt的签名交易
  const psbt = new Psbt({ network });

  // 拿上一笔的utxo作为输入，然后指定
  psbt.addInput({
    hash: utxos[utxos.length - 1].txid,
    index: utxos[utxos.length - 1].vout,
    // 见证utxo 
    witnessUtxo: {
      script: p2wsh.output!,
      value: 100_000 // 10^4 Satoshi
    },
    witnessScript: locking_script
  });
  // 添加输出
  psbt.addOutput({
    address: "tb1pzmc2f2rt55husvfwx6z34harcpy8lg8nmng5a59rhj9x3c9tug8see05x9",
    // 留了一些给gas
    value: 90000, // 9 * 10^3 Satoshi
  });
  // 如果想花钱，需要传任意两个数字，要求加起来等于5
  psbt.finalizeAllInputs();


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