var express = require('express');
var router = express.Router();
var {login, registerUserWallet, updateUserAdmin, updateAdminUser, verifyMail, recuperarPassword,resetPassword, refresh, cerrarSesion} = require("../controller/authController")
var {socialLogin} = require("../controller/socialController")
var {retoLlave, entrarConLlave} = require("../controller/llaveController")
var {importarBilletera} = require("../controller/importarController")
var isAdmin = require("../middleware/isAdmin")
var verifyTokenUser = require("../middleware/verifyToken")
var validateForms = require("../middleware/validateForms")


/* GET home page. */

router.get('/verifyMail', verifyMail);
router.post('/recuperarPassword', recuperarPassword);
router.post('/resetPassword', resetPassword);
router.post('/login',validateForms, login);
router.post('/refresh', refresh);
/* Cerrar sesion. No existia ninguna ruta para esto —ni logout, ni salir, ni
   signout— asi que salir era borrar el token del telefono y el servidor seguia
   aceptandolo hasta que venciera. Sube la version de sesion, o sea que cierra
   en TODOS los dispositivos: ver el comentario en authController.cerrarSesion.
   Se anota tambien como /logout porque es el nombre que cualquiera va a
   buscar, y una ruta de seguridad que no se encuentra no se usa. */
router.post('/cerrar-sesion', verifyTokenUser, cerrarSesion);
router.post('/logout', verifyTokenUser, cerrarSesion);
router.post('/registryWallet',validateForms,registerUserWallet);
// Alias. La app siempre llamo a /auth/register —es el nombre obvio— y esa
// ruta no existia, asi que el registro desde el telefono devolvia 404 y no
// habia forma de crear una cuenta. Se mantienen las dos: la web usa
// registryWallet y romperla no aporta nada.
router.post('/register',validateForms,registerUserWallet);
// Entrar con Google o con Apple. Una sola ruta hace entrar y registrarse,
// porque desde el lado de la persona son el mismo gesto.
router.post('/social', socialLogin);

/* Entrar con la frase semilla o la llave privada. Son dos pasos y el secreto
   no viaja en ninguno: se pide un reto, se firma en el navegador, y aquí solo
   llega la firma. Ver controller/llaveController.js. */
router.post('/reto-llave', retoLlave);
router.post('/entrar-con-llave', entrarConLlave);

/* Traer una billetera creada en otra billetera. A diferencia de entrar, aqui
   la llave SI viaja — Veta Wallet firma en el servidor y sin la llave no
   podria mover nada. Ver controller/importarController.js. */
router.post('/importar', importarBilletera);
router.post('/updateAdmin',isAdmin,updateUserAdmin);
router.post('/updateUser',isAdmin,updateAdminUser);




module.exports = router;
