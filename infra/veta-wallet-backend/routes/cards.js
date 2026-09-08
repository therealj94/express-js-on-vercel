var express = require("express");
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken");
var {
  requestCard,
  getMyCard,
  getCardPan,
  getCardPin,
  setCardPin,
  getAccumulatedSpending,
  getTransactionDetail,
  updateOtpPhone,
  reissueCard,
  unblockCard,
  set3dsConfig,
  getTopUpWallets,
  getCardTransactions,
  getCardStatement,
  disputeTransaction,
  updateCardLimits,
  setFrozen,
  cancelCard,
  getCardNotifications,
  markNotificationsRead,
  getOrigenPrice,
  getEmision,
  cardWebhook,
  syncCards,
  recargaDeLaTarjeta,
} = require("../controller/cardController");
var { fundCard, fundStatus } = require("../controller/swapController");

// Webhook de CryptoMate — sin autenticación JWT
router.post("/webhook", cardWebhook);

// Rutas protegidas
router.post("/request", verifyTokenUser, requestCard);       // Solicitar tarjeta (requiere KYC aprobado)
router.get("/my-card", verifyTokenUser, getMyCard);          // Datos de la tarjeta
router.get("/origen-price", verifyTokenUser, getOrigenPrice); // Precio actual de ORIGEN en USD
router.get("/emision", verifyTokenUser, getEmision);         // Cuánto cuesta la tarjeta y si se emite
router.post("/pan", verifyTokenUser, getCardPan);            // URL segura para ver PAN — requiere password
router.post("/pin", verifyTokenUser, getCardPin);            // PIN de la tarjeta — requiere password
router.put("/pin",  verifyTokenUser, setCardPin);            // Crear/cambiar PIN — requiere password
router.get("/top-up-wallets", verifyTokenUser, getTopUpWallets); // Wallets para fondear
router.patch("/limits", verifyTokenUser, updateCardLimits);  // Actualizar límites de gasto
router.post("/freeze", verifyTokenUser, setFrozen);          // Congelar/descongelar tarjeta
router.post("/fund", verifyTokenUser, fundCard);
router.get("/fund/status", verifyTokenUser, fundStatus);  // retoma una recarga en curso
router.get("/transactions", verifyTokenUser, getCardTransactions); // Historial de transacciones
router.get("/transactions/:txId", verifyTokenUser, getTransactionDetail); // Detalle de un movimiento
router.get("/accumulated-spending", verifyTokenUser, getAccumulatedSpending); // Gastado contra los límites
router.put("/otp-phone", verifyTokenUser, updateOtpPhone);   // Teléfono para los códigos de compras online
router.put("/reissue",   verifyTokenUser, reissueCard);      // Reemitir con PAN nuevo — requiere password
router.patch("/unblock", verifyTokenUser, unblockCard);      // Quitar bloqueo del emisor (≠ descongelar)
router.post("/3ds",      verifyTokenUser, set3dsConfig);     // Estrategia de autenticación 3D Secure
router.get("/statement",   verifyTokenUser, getCardStatement);    // Estado de cuenta CSV
router.post("/dispute",    verifyTokenUser, disputeTransaction);  // Disputar una transacción
router.post("/cancel", verifyTokenUser, cancelCard);             // Cancelar tarjeta (requiere password)
router.get("/notifications",      verifyTokenUser, getCardNotifications);  // Notificaciones no leídas
router.post("/notifications/read",verifyTokenUser, markNotificationsRead); // Marcar como leídas

// Admin — sin JWT, protegido por x-admin-key header
router.post("/admin/sync", syncCards); // Sincronizar tarjetas CryptoMate → MongoDB

/* Entre casas: Ordenex pregunta dónde se recarga la tarjeta de una dirección
   custodiada. No lleva sesión de usuario porque no habla un usuario: habla
   otra casa, con su propia clave. */
router.get("/interno/recarga", recargaDeLaTarjeta);

module.exports = router;
