import {
  initEccLib,
  payments,
} from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import networks from "./networks";

import { startP2PKH } from './demo/1_start_p2pkh';
import { startP2WPKH } from './demo/3_startP2wpkh';
import { startP2wsh } from './demo/startP2wsh';
import { startP2sh } from './demo/startP2sh';
// import { startP2wshWithSign } from './demo/startP2wshWithSign';
// import { startP2tr } from './demo/startP2tr';
// import { startTapTree } from './demo/startTapTree';
// import { startInscribeDeploy } from './demo/startInscribe_deploy';
// import { startInscribeTransfer } from './demo/startInscribe_transfer';
// import { startInscribeMint } from './demo/startInscribe_mint';
// import { startInscribeMintWithNoSdk } from './demo/startInscribe_mint_no_sdk';
import dotEnv from 'dotenv';
dotEnv.config();

initEccLib(tinysecp as any);
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = networks.testnet;

async function start() {
  // HD Wallet#1 Account 2
  const privateKey = process.env.secret;
  const keypair = ECPair.fromWIF(privateKey, network);
  console.log("secretK = " + keypair.privateKey?.toString('hex'));
  console.log("publicK = " + keypair.publicKey?.toString('hex'));
  console.log("\r\n");

  // await startP2PKH(keypair);
  // await startP2WPKH(keypair);
  await startP2sh(keypair);
  // await startP2wshWithSign(keypair);
  // await startP2tr(keypair);
  // await startTapTree(keypair);
  // await startInscribeDeploy(keypair)
  // await startInscribeMint(keypair)
  // await startInscribeMintWithNoSdk(keypair)
  // await startInscribeTransfer(keypair);
}

start().then(() => process.exit());