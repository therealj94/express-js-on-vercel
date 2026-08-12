import dotenv from "dotenv";
import mongoose from "mongoose";
import Users from "../models/Users.js";

dotenv.config();

const email = process.argv[2] || "dromero.code@gmail.com";

await mongoose.connect(`mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`);

const u = await Users.findOneAndUpdate(
  { email },
  { $set: { kycStatus: "none", kycSessionId: null, kycSessionUrl: null, kycApprovedAt: null } },
  { new: true }
);

console.log(u ? `✅  Reset OK: ${u.email} → ${u.kycStatus}` : `❌  User not found: ${email}`);
await mongoose.disconnect();
