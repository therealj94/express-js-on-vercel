/**
 * cleanup-test-card.js
 * Elimina la tarjeta de prueba de MongoDB (la creada durante el testing inicial).
 *
 * Uso: npx babel-node scripts/cleanup-test-card.js
 * O con los ids que quieras limpiar pasados como argumentos:
 *   npx babel-node scripts/cleanup-test-card.js zQ27Lh8Ku6Cmja8HJASkUZKEbpogi0wJ
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import Card from "../models/Card.js";

dotenv.config();

// IDs de tarjetas de prueba a eliminar (cryptomateCardId)
const TEST_CARD_IDS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["zQ27Lh8Ku6Cmja8HJASkUZKEbpogi0wJ"];  // tarjeta de prueba de Diego Romero

async function main() {
  if (!process.env.MONGO_PASSWORD) {
    console.error("❌  MONGO_PASSWORD no está en .env");
    process.exit(1);
  }

  const uri = `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`;
  await mongoose.connect(uri);
  console.log("✅  Conectado a MongoDB");

  for (const cardId of TEST_CARD_IDS) {
    const card = await Card.findOne({ cryptomateCardId: cardId });
    if (!card) {
      console.log(`⚠️   No encontrada en DB: ${cardId}`);
      continue;
    }
    console.log(`🗑️   Eliminando: ${cardId} (userId: ${card.userId}, holder: ${card.cardHolderName})`);
    await Card.deleteOne({ cryptomateCardId: cardId });
    console.log(`✅  Eliminada`);
  }

  await mongoose.disconnect();
  console.log("\n🔒  Desconectado. Listo.\n");
}

main().catch(err => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
