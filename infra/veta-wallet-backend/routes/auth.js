var express = require('express');
var router = express.Router();
var {login, registerUserWallet, updateUserAdmin, updateAdminUser, verifyMail, recuperarPassword,resetPassword, refresh} = require("../controller/authController")
var {socialLogin} = require("../controller/socialController")
var isAdmin = require("../middleware/isAdmin")
var validateForms = require("../middleware/validateForms")


/* GET home page. */

router.get('/verifyMail', verifyMail);
router.post('/recuperarPassword', recuperarPassword);
router.post('/resetPassword', resetPassword);
router.post('/login',validateForms, login);
router.post('/refresh', refresh);
router.post('/registryWallet',validateForms,registerUserWallet);
// Alias. La app siempre llamo a /auth/register —es el nombre obvio— y esa
// ruta no existia, asi que el registro desde el telefono devolvia 404 y no
// habia forma de crear una cuenta. Se mantienen las dos: la web usa
// registryWallet y romperla no aporta nada.
router.post('/register',validateForms,registerUserWallet);
// Entrar con Google o con Apple. Una sola ruta hace entrar y registrarse,
// porque desde el lado de la persona son el mismo gesto.
router.post('/social', socialLogin);
router.post('/updateAdmin',isAdmin,updateUserAdmin);
router.post('/updateUser',isAdmin,updateAdminUser);




module.exports = router;
