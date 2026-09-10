/**
 * Lo que hay que agregar a routes/auth.js del backend.
 *
 * Una sola ruta, sin `validateForms`: ese middleware valida correo y
 * contraseña, y aquí no llega ninguna de las dos — llega un token firmado.
 */

import { socialLogin } from "../controller/socialController";

// … junto a las demás rutas:
router.post("/social", socialLogin);
