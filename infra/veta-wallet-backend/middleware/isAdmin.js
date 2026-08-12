import jwt from "jsonwebtoken"
import Users from "../models/Users";
import CryptoJS from 'crypto-js';
require('dotenv').config();


const isAdmin = async (req, res, next) => {
    try {  
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ message: "missing token" });
      }

    const decodedToken = jwt.verify(token.split(' ')[1], process.env.PASS_TOKEN, { algorithm: 'HS256' });
    const idUser = decodedToken.userId;
    const user = await Users.findOne({_id: idUser});
    const tokenFromRequest = token.split(' ')[1];
    const decryptedToken = CryptoJS.AES.decrypt(user.token, process.env.PASS_TOKEN).toString(CryptoJS.enc.Utf8);

    if (tokenFromRequest !== decryptedToken) {
      return res.status(401).json({ message: "invalid token db" });
    }

    if (decodedToken.address !== user.address) {
      return res.status(401).json({ message: "invalid user" });
    }

    if (user.role !== "admin") {
        return res.status(401).json({ message: "invalid role" });
      }

    next();
  } catch (error) {
    console.log(error)
    res.status(401).json({ message: "invalid token" });
  }
};

module.exports = isAdmin;