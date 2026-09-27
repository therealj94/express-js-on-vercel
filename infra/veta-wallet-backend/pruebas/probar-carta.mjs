/* Lo que esta carta NO puede hacer nunca.
 *
 * Se manda a cientos de personas de una sola vez y no se puede recoger. Cada
 * comprobación de aquí es una regla de la casa que, si se rompe, se rompe
 * cuatrocientas veces antes de que nadie se entere.
 */
import { cartaNovedades, ASUNTO, enlaceBaja } from '../lib/cartaNovedades.js'
import { firmaValida } from '../lib/firmaBaja.js'

process.env.PASS_TOKEN = process.env.PASS_TOKEN || 'llave-de-prueba'

let fallos = 0
const ok = (que, cond) => { console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}`); if (!cond) fallos++ }
const plano = (s) => s.replace(/\s+/g, ' ')

/* LA CARTA CAMBIA CON LA FECHA: el bloque del sorteo de 1 AUKA se retira solo
   después del 9-sep-2026 (sorteoVivo). Antes esta prueba exigía el sorteo sin
   mirar el reloj, así que desde el 10-sep fallaba con la carta haciendo
   justo lo correcto. Ahora se miran los dos momentos: con el reloj puesto
   antes del cierre, el sorteo tiene que ir completo y con la regla de cobre;
   con el de hoy (pasado el cierre), no puede aparecer. */
const ahoraDeVerdad = Date.now
const cartaEl = (fecha) => {
  Date.now = () => fecha
  try { return cartaNovedades({ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org' }) }
  finally { Date.now = ahoraDeVerdad }
}
const conSorteo = cartaEl(Date.UTC(2026, 8, 1, 12))
const antes = plano(conSorteo.html + ' ' + conSorteo.texto)
const c = cartaNovedades({ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org' })
const todo = plano(c.html + ' ' + c.texto)

console.log('\nLa regla de cobre (Decisión 4 de la Junta)\n')
ok('nunca dice «respaldado»', !/respaldad/i.test(todo) && !/respaldad/i.test(antes))
ok('nunca dice «es una onza»', !/es una onza/i.test(todo) && !/es una onza/i.test(antes))
ok('donde nombra AUKA, dice que SIGUE el precio', /sigue el precio de una onza de oro/i.test(antes))
ok('y avisa de que no entrega metal', /no te entrega metal/i.test(antes))

console.log('\nEl sorteo se invita completo o no se invita\n')
ok('con el sorteo abierto lleva el +18', /18 años/.test(antes))
ok('lleva el enlace a las bases', /sorteo-orden-global/.test(antes))
ok('dice cuándo cierra', /9 de septiembre/.test(antes))
ok('dice que no hay que comprar nada', /no hay que comprar nada/i.test(antes))
ok('cerrado el sorteo, la carta ya no invita', !/sorteo/i.test(todo))

console.log('\nNo se vende lo que no está abierto\n')
ok('avisa de que comprar y cambiar siguen en obra', /todavía no están abiertos/.test(todo))
ok('avisa de que la tarjeta no entra a Google Pay ni Apple Pay',
  /no se agrega a Google Pay ni a Apple Pay/.test(todo))
ok('no promete cambiar activos como si funcionara', !/cambiá tus|comprá ORIGEN|invertí/i.test(todo))

console.log('\nEl correo no enseña a caer en una suplantación\n')
ok('lleva el aviso de que nunca se pide la contraseña', /nunca te vamos a pedir/i.test(todo))
ok('no pide responder con ningún dato', !/respondé con|enviános tu contraseña/i.test(todo))
ok('ni una sola imagen remota', (c.html.match(/<img|url\(http/g) || []).length === 0)

console.log('\nLa baja: obligatoria, y que no la pueda usar cualquiera\n')
ok('el pie lleva el enlace de baja', /dale de baja acá/.test(c.html))
ok('la versión de texto también lo lleva', /\/baja\?c=/.test(c.texto))
const url = new URL(enlaceBaja('jose@ordenglobal.org'))
ok('el enlace va firmado', firmaValida('jose@ordenglobal.org', url.searchParams.get('f')))
ok('la firma NO sirve para otra dirección',
  !firmaValida('otro@ordenglobal.org', url.searchParams.get('f')))
ok('la baja apunta al backend, no al sitio estático', !/app\.vetawallet\.com\/baja/.test(c.texto))

console.log('\nLas dos formas, y el saludo\n')
ok('hay versión de texto plano con cuerpo', c.texto.length > 800)
ok('hay versión HTML con cuerpo', c.html.length > 2000)
ok('sin nombre saluda igual', cartaNovedades({ correo: 'x@y.com' }).texto.startsWith('Hola.'))
ok('el asunto no trae emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ASUNTO))
ok('no le dice «registrate» a quien ya tiene cuenta', !/registrate|registrá|creá tu cuenta/i.test(todo))

console.log(fallos ? `\n${fallos} en rojo\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
