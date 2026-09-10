#!/usr/bin/env node
/* Genera la semilla de las direcciones de deposito de Ordenex.
 *
 *   node pruebas/generar-semilla.mjs
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ESTO SE CORRE EN TU MAQUINA, NO EN UN SERVIDOR NI EN UNA SESION DE CHAT.
 *
 * La frase que sale de aqui controla TODAS las direcciones de deposito de
 * TODOS los clientes, hoy y siempre. Y no se puede rotar: si se filtra, no hay
 * forma de "cambiarla" — las direcciones SON la semilla, y quien guardo la suya
 * en su exchange sigue mandando ahi para siempre. Ver lib/derivacion.js.
 *
 * Por eso este archivo existe en vez de que alguien te pase una frase hecha:
 * la unica copia tiene que nacer donde vos la controlas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUE HACER CON LO QUE IMPRIME
 *
 * 1. LAS 24 PALABRAS. Se escriben a mano, en papel, dos copias, en dos sitios
 *    distintos. No en una foto, no en un chat, no en un gestor de contraseñas
 *    en la nube, no en un correo a vos mismo. Despues se ponen como
 *    ORDENEX_SEMILLA_DEPOSITOS SOLO en el proceso que barre — nunca en el que
 *    atiende la web.
 *
 * 2. LA XPUB. ES OPCIONAL — con la frase sola el sistema funciona, porque la
 *    xpub se calcula de ella. Sirve para dos cosas, las dos para mas adelante:
 *    es lo unico que puede llevar el proceso web para calcular direcciones SIN
 *    poder firmarlas, y puesta junto a la frase avisa al arrancar si la frase
 *    es la equivocada. No permite firmar nada, asi que se puede compartir.
 *
 * 3. LAS TRES DIRECCIONES DE MUESTRA. Guardalas. El dia que haya que comprobar
 *    que un servidor lleva la semilla correcta, se compara su /admin/estado
 *    contra estas: si la huella coincide, es la misma semilla.
 *
 * 4. CERRA LA TERMINAL cuando termines, para que la frase no quede en el
 *    historial de la ventana.
 */

import { HDNodeWallet, Mnemonic, randomBytes } from 'ethers';

const RUTA = "m/44'/60'/0'/0";

// 32 bytes de entropia = 24 palabras. Se usan 24 y no 12 porque esta frase no
// la escribe un humano cada dia: se escribe una vez y se guarda para siempre,
// asi que el trabajo extra de copiar doce palabras mas es gratis y el margen
// que da no lo es.
const frase = Mnemonic.fromEntropy(randomBytes(32)).phrase;
const base = HDNodeWallet.fromPhrase(frase, '', RUTA);
const xpub = base.neuter().extendedKey;

const raya = (t) => console.log('\n' + '─'.repeat(72) + (t ? `\n${t}\n` : ''));

raya('1 · LAS 24 PALABRAS — a papel, dos copias, dos sitios. Nada digital.');
console.log(frase.split(' ').map((p, i) => `${String(i + 1).padStart(2)}. ${p}`)
  .reduce((filas, x, i) => {
    const f = Math.floor(i / 4);
    filas[f] = (filas[f] || []).concat(x.padEnd(16));
    return filas;
  }, []).map((f) => '   ' + f.join('')).join('\n'));

raya('2 · LA XPUB — va en ORDENEX_SEMILLA_XPUB, en los dos procesos.');
console.log('   ' + xpub);

raya('3 · COMPROBACION — guardalas para reconocer esta semilla despues.');
console.log(`   huella   ${base.neuter().fingerprint}`);
for (let i = 1; i <= 3; i++) console.log(`   indice ${i}  ${base.deriveChild(i).address}`);

raya('4 · DONDE VA CADA COSA');
console.log(`   AHORA, y alcanza:
     ORDENEX_SEMILLA_DEPOSITOS   las 24 palabras

   MAS ADELANTE, cuando el que barre sea un proceso aparte:
     proceso que barre   ORDENEX_SEMILLA_DEPOSITOS  +  ORDENEX_SEMILLA_XPUB
     proceso web         ORDENEX_SEMILLA_XPUB          y NADA mas

   El proceso web no puede firmar aunque quiera: con la xpub sola, el objeto
   que calcula direcciones NO TIENE llave privada. No es una promesa, es
   aritmetica — y por eso una intrusion en la web no se lleva la semilla.
`);
raya('   Cuando termines: cerra esta terminal.');
console.log();
