import jwt from "jsonwebtoken";
import Users from "../models/Users";
import CryptoJS from "crypto-js";
require("dotenv").config();

const verifyTokenUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ message: "missing token" });
    }

    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const idUser = decodedToken.userId;
    const user = await Users.findOne({ _id: idUser });

    if (decodedToken.address !== user.address) {
      return res.status(401).json({ message: "invalid user" });
    }

    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ message: "invalid token" });
  }
};

module.exports = verifyTokenUser;
