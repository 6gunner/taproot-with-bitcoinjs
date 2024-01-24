import * as bitcoin from 'bitcoinjs-lib';
import {
  crypto,
  address,
  script,
  opcodes,
  networks,
  payments,
  Psbt
} from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import { broadcast, waitUntilUTXO } from "../blockstream_utils";
import { witnessStackToScriptWitness } from '../witness_stack_to_script_witness';

const network = networks.testnet
// 指定一个接收地址
const recipientAddr = address.fromBech32("tb1pzmc2f2rt55husvfwx6z34harcpy8lg8nmng5a59rhj9x3c9tug8see05x9");
console.log("recipientAddr = ", recipientAddr);
// 如果带上签名的话，怎么弄？
export async function startP2wshWithSign(keypair: bitcoin.Signer) {
  const SECRET = "secret"; // 模拟一个密码
  const preimage = Buffer.from(SECRET);
  const hash = crypto.hash160(preimage); // 构建密码的hash
  const publicKey = keypair.publicKey;
  const recipAddr = crypto.hash160(publicKey); // 构建公钥的hahs

  /**
   * 这个脚本的解释：
   * 1.计算参数的160位hash，和hash进行比较，看是否相同
   * 2、复制栈顶的数据，这里被用来复制公钥
   * 3、将公钥计算160位的hash，和recipAddr进行比较，看是否相同；
   * 4、拿公钥验证签名，看是否能能通过
   * 为啥要复制？
   * 因为栈的操作原理，一旦一个元素被使用，它就会从栈中被弹出（移除）。如果我们不使用`OP_DUP`复制公钥，那么在`OP_HASH160`运算之后，公钥* 就会被从栈中弹出，
   * 当执行到`OP_CHECKSIG`时，栈中将没有公钥可用来验证签名。
   * 因此，通过`OP_DUP`来复制公钥，我们就可以分别在`OP_HASH160`和`OP_CHECKSIG`这两个操作中使用公钥，而不会因为栈操作的限制而无法完成
   *
   */
  const locking_script = script.compile([
    opcodes.OP_HASH160,
    hash,
    opcodes.OP_EQUALVERIFY,

    opcodes.OP_DUP,
    opcodes.OP_HASH160,
    recipAddr,
    opcodes.OP_EQUALVERIFY,

    opcodes.OP_CHECKSIG,
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

  // 最后一笔我转了100000
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
  psbt.addOutput({
    address: "tb1pzmc2f2rt55husvfwx6z34harcpy8lg8nmng5a59rhj9x3c9tug8see05x9",
    // 留了一些给gas
    value: 99000, // 99 * 10^3 Satoshi
  });

  // 如果想花钱，需要先创建一个签名，用来解锁上一笔的输出
  psbt.signInput(0, keypair);

  psbt.finalizeInput(0, (_inputIndex: number, input: any) => {
    const redeemPayment = payments.p2wsh({
      redeem: {
        // 解锁签名，因为栈的特性，得反过来传参数
        input: script.compile([
          input.partialSig[0].signature, // 先传签名
          publicKey, // 再传公钥
          preimage  // 最后传秘钥
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
  // 参考https://mempool.space/testnet/tx/38aafb325c81abe71fee5bc0f6c6cf7fc8dc73b691886288c0dc423f6381f804


}