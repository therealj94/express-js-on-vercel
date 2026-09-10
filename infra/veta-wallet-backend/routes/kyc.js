var express = require("express");
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken");
var { startKyc, getKycStatus, kycWebhook, saveProfile, getProfile } = require("../controller/kycController");

// El webhook de Veriff necesita el body crudo (Buffer) para verificar la firma HMAC
// Se aplica antes del parser JSON global sólo en esta ruta
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Si el body ya fue parseado por express.json() global, es un objeto
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      try {
        req.body = JSON.parse(req.body.toString());
      } catch {
        return res.status(400).json({ message: "Invalid JSON" });
      }
    } else if (!Buffer.isBuffer(req.rawBody)) {
      /* Ya está parseado y no hay bytes guardados. Se rehace el texto para no
         quedarse sin nada, pero conviene saber que ESTA FIRMA NO VA A CUADRAR:
         JSON.stringify no devuelve los mismos bytes que llegaron —otro orden,
         otros espacios, otros escapes— y el HMAC se calcula sobre los bytes.
         Por eso se prefiere `req.rawBody`, que ahora guarda el parser de
         app.js con la opción `verify` y sí son los bytes de verdad. */
      req.rawBody = Buffer.from(JSON.stringify(req.body));
    }
    next();
  },
  kycWebhook
);

// Rutas protegidas (requieren JWT)
router.post("/start", verifyTokenUser, startKyc);
router.get("/status", verifyTokenUser, getKycStatus);
router.post("/save-profile", verifyTokenUser, saveProfile);   // guarda datos antes del KYC
router.get("/profile", verifyTokenUser, getProfile);          // pre-rellena formularios

module.exports = router;
