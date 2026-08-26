/* Lo que la carta del Genesis ID NO puede hacer nunca.
 *
 * Se manda a cientos de personas de una sola vez y no se puede recoger. Cada
 * comprobación de aquí es una regla que, si se rompe, se rompe cuatrocientas
 * veces antes de que nadie se entere.
 *
 * Hay dos que son de ESTA carta y no de las otras:
 *
 *   · El botón tiene que llevar a #verificar. Si algún día alguien lo cambia
 *     por la portada, la carta sigue leyéndose preciosa y deja de funcionar:
 *     la gente toca, cae en el inicio, y no encuentra lo que se le pidió.
 *   · No puede ofrecer el intercambio. La identidad aprobada abre DOS puertas
 *     en el código —la tarjeta y el intercambio— pero el intercambio sigue en
 *     obra. Ofrecer una puerta cerrada consigue que la persona entre, no la
 *     encuentre, y no vuelva.
 */
import { cartaGenesis, ASUNTO } from '../lib/cartaGenesis.js'
import { enlaceBaja } from '../lib/cartaNovedades.js'
import { firmaValida } from '../lib/firmaBaja.js'

process.env.PASS_TOKEN = process.env.PASS_TOKEN || 'llave-de-prueba'

let fallos = 0
const ok = (que, cond) => { console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}`); if (!cond) fallos++ }
const plano = (s) => s.replace(/\s+/g, ' ')

const c = cartaGenesis({ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org' })
const todo = plano(c.html + ' ' + c.texto)

console.log('\nEl botón, que es lo único que la carta viene a conseguir\n')
ok('lleva a la pantalla de identidad, no a la portada',
  c.html.includes('app.vetawallet.com/#verificar'))
ok('la versión de texto lleva el mismo enlace',
  c.texto.includes('app.vetawallet.com/#verificar'))
ok('no manda a la raíz del sitio como si fuera lo mismo',
  !/href="https:\/\/app\.vetawallet\.com\/?"/.test(c.html))

console.log('\nCada puerta se cuenta como es: abierta, o por abrir\n')
ok('la tarjeta se ofrece como PEDIRLA, no como tenerla',
  /podés solicitarla|Pedir tu tarjeta/i.test(todo))
ok('no dice que la tarjeta ya la tenés', !/tu tarjeta ya está|ya tenés tu tarjeta/i.test(todo))
ok('Ordenex aparece', /Ordenex/.test(todo))
ok('y NUNCA sin decir que todavía no está',
  /Ordenex[\s\S]{0,220}(muy pronto|todavía no está)/i.test(todo))
ok('no invita a comprar en Ordenex como si se pudiera hoy',
  !/comprá ahora|ya podés comprar y vender|entrá a comprar/i.test(todo))
ok('PULSE2CHAT aparece', /PULSE2CHAT/.test(todo))

/* El chat NO exige identidad verificada: en el relevo el gid es un dato
   público que la persona declara. Si algún día alguien escribe que el Genesis
   ID «abre» o «desbloquea» el chat, esta comprobación se pone roja — porque
   sería mentira, y la persona lo descubre en treinta segundos. */
ok('no dice que el Genesis ID desbloquee el chat',
  !/(desbloque|abr[ie])[a-zé]*\s+(el\s+)?(chat|PULSE2CHAT)/i.test(todo))
ok('avisa de que el cambio de activos sigue en obra', /todavía están en obra/.test(todo))
ok('avisa de que la tarjeta no entra a Google Pay ni Apple Pay',
  /no entra a Google Pay ni a Apple Pay/.test(todo))

console.log('\nLa regla de cobre (Decisión 4 de la Junta)\n')
ok('nunca dice «respaldado»', !/respaldad[oa]/i.test(todo.replace(/frase de respaldo/gi, '')))
ok('nunca dice «es una onza»', !/es una onza/i.test(todo))

console.log('\nEl sorteo se invita completo o no se invita\n')
const invita = /sorteo/i.test(todo)
ok('si se invita, lleva el +18', !invita || /18 años/.test(todo))
ok('si se invita, lleva el enlace a las bases', !invita || /sorteo-orden-global/.test(todo))
ok('si se invita, dice que AUKA SIGUE el precio',
  !invita || /sigue el precio de una onza de oro/i.test(todo))
ok('si se invita, avisa de que no entrega metal', !invita || /no te entrega metal/i.test(todo))

console.log('\nEl correo no enseña a caer en una suplantación\n')
ok('lleva el aviso de que nunca se pide la contraseña', /nunca te vamos a pedir/i.test(todo))
ok('no pide responder con ningún dato', !/respondé con|enviános tu contraseña/i.test(todo))

console.log('\nNi una imagen remota: la galaxia se dibuja, no se descarga\n')
ok('ninguna etiqueta <img>', !/<img/i.test(c.html))
ok('ningún url() apuntando afuera', !/url\(\s*['"]?https?:/i.test(c.html))
ok('pero la galaxia está de verdad', /radial-gradient/.test(c.html))
ok('y tiene un color de fondo sólido debajo, para donde no se pinte',
  /background-color:#030C12/.test(c.html))

console.log('\nLa baja: obligatoria, y que no la pueda usar cualquiera\n')
ok('el pie lleva el enlace de baja', /dale de baja acá/.test(c.html))
ok('la versión de texto también lo lleva', /\/baja\?c=/.test(c.texto))
const url = new URL(enlaceBaja('jose@ordenglobal.org'))
ok('el enlace va firmado', firmaValida(url.searchParams.get('c'), url.searchParams.get('f')))
ok('y la firma de una dirección no sirve para otra',
  !firmaValida('otra@persona.com', url.searchParams.get('f')))

console.log('\nLas dos formas, y que ninguna llegue vacía\n')
ok('hay versión HTML', c.html.length > 2000)
ok('hay versión de texto plano', c.texto.length > 800)
ok('el asunto no va vacío', ASUNTO.length > 10)
ok('el asunto no lleva emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ASUNTO))
ok('cabe entero en Gmail sin que lo recorte', c.html.length < 102000)

console.log('\nSin nombre también se saluda\n')
const sinNombre = cartaGenesis({ correo: 'alguien@ejemplo.com' })
ok('saluda igual', /^Hola\./m.test(sinNombre.texto))
ok('no deja un hueco donde iba el nombre', !/Hola, \./.test(sinNombre.texto + sinNombre.html))

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
