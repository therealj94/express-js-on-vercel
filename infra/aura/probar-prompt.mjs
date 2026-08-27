/* Lo que el prompt de AU-RA no puede dejar de decir.
 *
 * AU-RA le va a hablar a cientos de personas sobre su dinero. Si alguien edita
 * el prompt y se lleva por delante una de estas reglas, no se rompe nada: AU-RA
 * sigue contestando, con la misma voz agradable, y empieza a prometer
 * ganancias o a pedir frases de respaldo. Un fallo silencioso.
 *
 * Estas comprobaciones son el único sitio donde ese silencio hace ruido.
 *
 * Los textos se buscan tolerando el salto de línea —\s+ en vez de un espacio—
 * porque el prompt está formateado para leerse, y una regla puede quedar
 * partida en dos renglones. La primera versión de esta prueba dio un falso
 * negativo justo por eso.
 */
import { promptSistema, fichasPara } from './motor.js'

let fallos = 0
const ok = (que, cond) => { console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}`); if (!cond) fallos++ }
const hay = (p, txt) => new RegExp(txt.split(' ').join('\\s+'), 'i').test(p)

const p = await promptSistema()

console.log('\nLa regla que está por encima de todas\n')
ok('prohíbe pedir la contraseña', hay(p, 'no pedís|nunca.{0,40}contraseña') || hay(p, 'le pedís a nadie su contraseña'))
ok('prohíbe pedir la frase de respaldo', hay(p, 'frase de respaldo'))
ok('prohíbe pedir las doce palabras', hay(p, 'doce palabras'))
ok('prohíbe pedir la llave privada', hay(p, 'llave privada'))
ok('dice qué hacer si alguien se las escribe igual', hay(p, 'no las repetís'))
ok('enseña a reconocer la estafa', hay(p, 'es una estafa'))

console.log('\nNo promete, no aconseja invertir\n')
ok('prohíbe precios futuros', hay(p, 'precio futuro') || hay(p, 'ningún precio futuro'))
ok('prohíbe hablar de ganancia', hay(p, 'ninguna ganancia'))
ok('prohíbe decir «garantizado»', hay(p, 'garantizado'))
ok('prohíbe aconsejar invertir', hay(p, 'no aconsejás invertir'))
ok('prohíbe hablar de impuestos y leyes', hay(p, 'impuestos'))
ok('separa el orgullo de la promesa', hay(p, 'Contás lo que se construyó'))

console.log('\nNo inventa\n')
ok('dice que las fichas son su única fuente', hay(p, 'única fuente'))
ok('le da la salida honesta cuando no sabe', hay(p, 'Eso no lo tengo'))
ok('ofrece el camino humano', /info@ordenglobal\.org/.test(p))
ok('prohíbe rellenar huecos', hay(p, 'Nunca completes un hueco'))
ok('las fichas ganan si alguien la contradice', hay(p, 'las fichas mandan'))

console.log('\nNo toca el dinero\n')
ok('dice que no puede enviar ni firmar', hay(p, 'No podés enviar'))
ok('explica que firma la persona con su contraseña', hay(p, 'lo firma la persona'))

console.log('\nCómo habla\n')
ok('pide respuestas cortas', hay(p, 'Claro y corto'))
ok('contesta en el idioma de la persona', hay(p, 'idioma de la persona'))
ok('sin emoji', hay(p, 'Sin emoji'))

console.log('\nEl saber de verdad llega, y es el de la casa\n')
const una = await fichasPara('que es ORIGEN')
ok('una pregunta concreta trae su ficha', /ORIGEN/.test(una) && una.split('\n').length <= 3)
ok('y trae el contenido, no solo el título', una.length > 120)
const general = await fichasPara('hola')
ok('una pregunta general trae TODAS las fichas, no ninguna', general.split('\n').length >= 10)
ok('el saber nombra la cadena 5550', /5550/.test(general))
ok('el saber nombra el Genesis ID', /Genesis ID/.test(general))

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
