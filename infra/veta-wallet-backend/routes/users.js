var express = require('express');
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken")

var {getUserPublic,changePassword, decryptedPrivateKey, decryptedSeed, updateUser, noPrivate, yesPrivate , getUserBloqued, addUserBloqued , removeUserBloqued, getDateUser, deleteAccount, adminDeleteAccount, adminSaldoCuenta} = require("../controller/userController")
var isAdmin = require("../middleware/isAdmin")

router.get("/isPublic",verifyTokenUser, getUserPublic)
router.get("/userDate",verifyTokenUser, getDateUser )
router.post("/changePassword",verifyTokenUser, changePassword);
router.post("/decriptPrivate",verifyTokenUser, decryptedPrivateKey);
router.post("/decriptSeed",verifyTokenUser, decryptedSeed);
router.post("/updateUser",verifyTokenUser, updateUser);
router.post("/noPrivate",verifyTokenUser, noPrivate);
router.post("/private",verifyTokenUser, yesPrivate);
router.get("/allUserBloqued",verifyTokenUser, getUserBloqued);
router.post("/addUserBloqued",verifyTokenUser, addUserBloqued);
router.delete("/removeUserBloqued",verifyTokenUser, removeUserBloqued);

// Eliminar la cuenta. Obligatorio para publicar en App Store y Play Store.
// Pide contrasena y confirmacion escrita: no se borra por un toque mal dado.
router.delete("/me", verifyTokenUser, deleteAccount);

// Borrado por un administrador. Se niega si la cuenta tiene CUALQUIER cosa en
// la cadena --ORIGEN nativo o alguno de los catorce tokens-- y tambien se
// niega si no pudo preguntarselo al nodo: un nodo caido no es una cuenta
// vacia. Antes de decidir se puede mirar con /admin/saldo.
router.get("/admin/saldo", isAdmin, adminSaldoCuenta);
router.delete("/admin/cuenta", isAdmin, adminDeleteAccount);



module.exports = router;
