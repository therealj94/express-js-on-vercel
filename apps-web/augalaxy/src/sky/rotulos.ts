/* ══ LOS NOMBRES, FUERA DE LA ESCENA ═════════════════════════════════════════
 *
 * Los nombres eran letreros 3D: una textura colgada debajo de cada esfera. En
 * el teléfono eso fallaba de cuatro maneras a la vez, y una captura del 27-sep
 * las enseñaba todas juntas:
 *
 *   · la letra se veía borrosa y apagada: una textura escalada, con el bloom
 *     del sol encima, nunca da un borde nítido a 11 px;
 *   · un planeta de delante se comía el nombre de otro («A WALLET», «AUC…»),
 *     y el botón de acercar tapaba el resto;
 *   · para no amontonarse, la regla APAGABA a los de atrás: cuatro o cinco
 *     casas quedaban con su ícono y sin decir qué eran;
 *   · «AU-RA» se escribía dentro del resplandor del sol, crema sobre blanco.
 *
 * Ahora cada mundo solo dice DÓNDE cae en pantalla, y una capa HTML encima del
 * lienzo (`hud/Rotulos.tsx`) reparte los nombres: debajo de su esfera si cabe,
 * si no a un lado o arriba, sin pisar otro nombre, ni un mundo de delante, ni
 * el sol, ni un botón. Letra de verdad, del tamaño que se lee, sobre una
 * pastilla oscura que la separa del cielo.
 *
 * Dentro del visor no hay HTML: ahí siguen mandando los letreros 3D (`xr`).
 */

export type Rotulo = {
  x: number       // centro del planeta, px del lienzo
  y: number
  r: number       // radio del disco en pantalla, px
  d: number       // distancia a la cámara: los de delante eligen primero
  nombre: string
  vis: number     // 0..1: puerta, película, tiniebla — lo que el cielo permite
  sel: boolean    // la casa elegida
  frente: boolean // delante de la cámara
}

export const rotulos = new Map<string, Rotulo>()

/* El sol lleva su nombre aparte: es el centro, se coloca primero, y su disco
   en pantalla es el resplandor, no la esfera. */
export const sol = { x: 0, y: 0, r: 0, vis: 0, frente: false }

/* ¿Hay capa HTML? En el visor no: la pantalla está partida en dos ojos. */
export const capa = { xr: false }
