import { Schema, model } from "mongoose";

const Card = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    cryptomateCardId: {
      type: String,
      required: true,
      unique: true,
    },
    cryptomateClientId: {
      type: String,
      required: false,  // enterprise_cards no usa cliente CryptoMate previo
    },
    cardHolderName: {
      type: String,
      required: true,
    },
    last4: {
      type: String,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "FROZEN", "BLOCKED", "DELETED"],
      default: "ACTIVE",
    },
    approvalMethod: {
      type: String,
    },
    dailyLimit: {
      type: Number,
    },
    weeklyLimit: {
      type: Number,
    },
    monthlyLimit: {
      type: Number,
    },
    // Wallet de depósito individual (TOP_UP model) — dirección Polygon donde el usuario deposita USDT/USDC
    // Se obtiene de GET /cards/virtual-cards/:id/top-up y se cachea aquí
    topUpAddress: {
      type: String,
    },
    topUpBlockchain: {
      type: String,
      default: "POLYGON",
    },
    topUpTokens: {
      type: [String],
      default: ["USDT", "USDC"],
    },
    // Balance virtual acumulado en USD (solo para tarjetas approval_method NONE)
    // CryptoMate no tiene GET /virtual-balance, lo rastreamos nosotros
    virtualBalanceUsd: {
      type: Number,
      default: 0,
    },
    // Estrategia de 3D Secure configurada en el emisor. CryptoMate no expone
    // un GET para consultarla, asi que se guarda aca lo ultimo que pedimos:
    // sin esto la app no puede decirle al usuario si ya la tiene activada.
    threeDsType: {
      type: String,
      enum: ["SMS", "WEBHOOK"],
    },
    threeDsSetAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default model("Card", Card);
