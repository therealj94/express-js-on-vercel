/**
 * generate-treasury-wallet.js
 *
 * Run this ONCE to create the VetaWallet treasury wallets.
 * Outputs the addresses and private keys you need to add to .env
 *
 * Usage:
 *   node scripts/generate-treasury-wallet.js
 *
 * ⚠️  SAVE THE OUTPUT SOMEWHERE SAFE — private keys are shown only once.
 * ⚠️  The BSC wallet needs to be funded with USDT before the fund flow works.
 */

const { ethers } = require("ethers");

function generateWallet(label) {
  const wallet = ethers.Wallet.createRandom();
  console.log(`\n── ${label} ──────────────────────────────────`);
  console.log(`  Address:     ${wallet.address}`);
  console.log(`  Private key: ${wallet.privateKey}`);
  console.log(`  Mnemonic:    ${wallet.mnemonic.phrase}`);
  return wallet;
}

console.log("=================================================");
console.log(" VetaWallet Treasury Wallet Generator");
console.log("=================================================");

const ogTreasury = generateWallet("OG Treasury (receives OG tokens from users)");
const bscTreasury = generateWallet("BSC Treasury (sends USDT to CryptoMate)");

console.log("\n=================================================");
console.log(" Add these to your .env file:");
console.log("=================================================");
console.log(`TREASURY_OG_ADDRESS=${ogTreasury.address}`);
console.log(`TREASURY_BSC_PRIVATE_KEY=${bscTreasury.privateKey}`);
console.log("\n=================================================");
console.log(" Next steps:");
console.log("=================================================");
console.log(`1. Copy the lines above into VetaWallet-back/.env`);
console.log(`2. Also add them as Heroku config vars:`);
console.log(`   heroku config:set TREASURY_OG_ADDRESS=${ogTreasury.address} --app wallet-ok-backend`);
console.log(`   heroku config:set TREASURY_BSC_PRIVATE_KEY=${bscTreasury.privateKey} --app wallet-ok-backend`);
console.log(`3. Fund the BSC Treasury with USDT (BEP-20):`);
console.log(`   Send USDT to: ${bscTreasury.address} on BSC network`);
console.log(`   Min suggested: $50 USDT to start testing`);
console.log(`4. The OG Treasury address ${ogTreasury.address}`);
console.log(`   will automatically receive OG tokens when users fund their cards.`);
console.log("=================================================\n");
