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

const c = cartaNovedades({ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org' })
const todo = plano(c.html + ' ' + c.texto)

console.log('\nLa regla de cobre (Decisión 4 de la Junta)\n')
ok('nunca dice «respaldado»', !/respaldad/i.test(todo))
ok('nunca dice «es una onza»', !/es una onza/i.test(todo))
ok('sí dice que AUKA SIGUE el precio', /sigue el precio de una onza de oro/i.test(todo))
ok('avisa de que no entrega metal', /no te entrega metal/i.test(todo))

console.log('\nEl sorteo se invita completo o no se invita\n')
ok('lleva el +18', /18 años/.test(todo))
ok('lleva el enlace a las bases', /sorteo-orden-global/.test(todo))
ok('dice cuándo cierra', /9 de septiembre/.test(todo))
ok('dice que no hay que comprar nada', /no hay que comprar nada/i.test(todo))

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
