/* Lo que la carta de entrega de tokens NO puede hacer nunca.
 *
 * Esta carta se le manda a alguien justo antes de entregarle algo de valor, y
 * ese es exactamente el momento en que aparecen los estafadores. Si algún día
 * alguien la edita y le pide a la persona su frase de respaldo «para verificar
 * la cuenta», la carta va a seguir leyéndose preciosa y va a ser el instrumento
 * de un robo. Estas comprobaciones existen para que eso no pueda pasar en
 * silencio.
 */
import { cartaInvitacion } from '../lib/cartaInvitacion.js'

let fallos = 0
const ok = (que, cond) => { console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}`); if (!cond) fallos++ }
const plano = (s) => s.replace(/\s+/g, ' ')

const c = cartaInvitacion({ nombre: 'Alberto Morales', correo: 'amorales@centriumx.com',
                            cantidad: '20.000', token: 'ONDK' })
const todo = plano(c.html + ' ' + c.texto)

console.log('\nLo que se pide, y lo que jamás se pediría\n')
ok('pide la DIRECCIÓN', /direcci[oó]n/i.test(todo))
ok('explica que la dirección empieza con 0x y son 42 caracteres',
  /0x/.test(todo) && /42 caracteres/.test(todo))
ok('dice EXPLÍCITAMENTE que la frase de respaldo no se manda ni a nosotros',
  /no se la mand[aá]s a nadie|NO se lo mandás a nadie/i.test(todo))
ok('avisa de que quien la pida es un impostor', /impostor/i.test(todo))

/* La comprobación que de verdad importa: que en ninguna parte se le pida a la
   persona que ENVÍE su frase o su contraseña. Se buscan verbos de envío cerca
   de las palabras peligrosas, que es como se vería un texto malicioso. */
const pideSecreto =
  /(mand[aá]|envi[aá]|peg[aá]|escrib[ií]|comparti[ír]|respond[eé] con)[^.]{0,40}(frase de respaldo|doce palabras|contrase[ñn]a|seed)/i
    .test(todo)
ok('NUNCA pide que mande la frase ni la contraseña', !pideSecreto)
ok('tampoco pide la llave privada', !/llave privada/i.test(todo))

console.log('\nLos pasos nombran botones que existen de verdad\n')
for (const rotulo of ['Crear mi cuenta', 'Recibir', 'Copiar dirección']) {
  ok(`nombra «${rotulo}»`, todo.includes(rotulo))
}
ok('avisa de que la dirección de ORIGEN sirve para el token que se entrega',
  /misma cadena/i.test(todo))
ok('lleva el enlace a la billetera', /app\.vetawallet\.com/.test(todo))
ok('el botón lleva a la pantalla de identidad', /app\.vetawallet\.com\/#verificar/.test(todo))

console.log('\nLa frase de respaldo se explica bien\n')
ok('dice que son doce palabras', /doce palabras/i.test(todo))
ok('dice que las anote en papel', /papel/i.test(todo))
ok('avisa de que nosotros no podemos recuperarlas',
  /no podemos recuperarlas/i.test(todo))

console.log('\nONDK es un valor negociable, y eso obliga\n')
ok('dice que es un valor negociable', /valor negociable/i.test(todo))
ok('dice que no es una oferta', /no es una oferta/i.test(todo))
ok('dice que no promete rentabilidad', /promesa de rentabilidad/i.test(todo))
ok('NO menciona ningún precio', !/\$\s?\d|USD|d[oó]lar/i.test(todo))
ok('NO insinúa ganancia', !/vas a ganar|se va a valorizar|rendimiento|multiplic|revaloriza/i.test(todo))

console.log('\nEl Genesis ID se explica, no se impone a secas\n')
ok('nombra el Genesis ID', /Genesis ID/.test(todo))
ok('dice POR QUÉ hace falta', /la casa tiene que saber qui[eé]n lo tiene/i.test(todo))
ok('dice que decide una persona', /decide una persona/i.test(todo))

console.log('\nLas dos formas, y el saludo\n')
ok('hay versión HTML', c.html.length > 3000)
ok('hay versión de texto plano', c.texto.length > 1500)
ok('el asunto lleva el nombre de pila', /Alberto/.test(c.asunto))
ok('el asunto lleva la cantidad', /20\.000/.test(c.asunto))
ok('el asunto no lleva emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c.asunto))
ok('saluda por el nombre de pila', /Hola, Alberto\./.test(c.texto))
ok('cabe entero en Gmail sin que lo recorte', c.html.length < 102000)

console.log('\nNi una imagen remota\n')
ok('ninguna etiqueta <img>', !/<img/i.test(c.html))
ok('ningún url() apuntando afuera', !/url\(\s*['"]?https?:/i.test(c.html))

console.log('\nSirve para otra persona y otro token\n')
const otra = cartaInvitacion({ nombre: 'Ana Ruiz', correo: 'a@b.com', cantidad: '500', token: 'AUKA' })
ok('cambia el nombre', /Hola, Ana\./.test(otra.texto) && !/Alberto/.test(otra.texto))
ok('cambia el token', /AUKA/.test(otra.asunto) && !/ONDK/.test(otra.asunto))

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
