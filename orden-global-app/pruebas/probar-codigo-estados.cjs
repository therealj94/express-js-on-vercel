/* EL CÓDIGO DE SEGURIDAD Y LOS ESTADOS — con el relevo de verdad.
 *
 *   node pruebas/probar-codigo-estados.cjs
 *
 * ══ QUÉ VIGILA ════════════════════════════════════════════════════════════
 *
 *   · el código de seguridad sale IGUAL en los dos teléfonos, aunque uno de
 *     los dos tenga dos aparatos (el fallo clásico era comparar «mi aparato»
 *     contra «todos los suyos» y discrepar siempre);
 *   · cambia si aparece una llave nueva de por medio —que es para lo que existe—;
 *   · no hay código con alguien que no publicó llaves, y se dice (null);
 *   · un estado sube con su foto EN CLARO (es público por definición), se ve
 *     desde el círculo, se marca visto, cuenta las vistas para su dueño, y se
 *     borra; quien no es del círculo no lo ve.
 */
const { cargarCliente, candadoNuevo, levantarRelevo, marcador } = require('./banco.cjs');

const ANA = 'ana@ordenglobal.org';
const BETO = 'beto@ordenglobal.org';
const CARLA = 'carla@ordenglobal.org';
const DANI = 'dani@ordenglobal.org';

(async () => {
  const { comprobar, fin } = marcador();
  const relevo = await levantarRelevo({ 'jwt-ana': ANA, 'jwt-beto': BETO, 'jwt-carla': CARLA, 'jwt-dani': DANI });

  try {
    const ana = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    const beto = cargarCliente(relevo.base, 'jwt-beto', {}, await candadoNuevo());
    const carla = cargarCliente(relevo.base, 'jwt-carla', {}, await candadoNuevo());
    await ana.alta({ email: ANA, name: 'Ana' });
    await beto.alta({ email: BETO, name: 'Beto' });
    await carla.alta({ email: CARLA, name: 'Carla' });
    await ana.pedirAmistad(BETO); await beto.responderAmistad(ANA, true);
    await ana.pedirAmistad(CARLA); await carla.responderAmistad(ANA, true);

    console.log('\n── el código de seguridad ────────────────────────────────');
    const cA = await ana.codigoCon(BETO);
    const cB = await beto.codigoCon(ANA);
    comprobar(typeof cA === 'string' && /^(\d{5} ){4}\d{5}  (\d{5} ){4}\d{5}$/.test(cA),
      'tiene la forma de dos mitades de cinco grupos de cinco cifras', cA);
    comprobar(cA === cB, 'y es EL MISMO en los dos teléfonos', `${cA}\n           ${cB}`);
    // Ana entra desde un segundo aparato: el código cambia para los dos, igual
    const ana2 = cargarCliente(relevo.base, 'jwt-ana', {}, await candadoNuevo());
    await ana2.alta({ email: ANA, name: 'Ana' });
    /* El alta publica la llave sin esperar (para no frenar la pantalla); aquí
       se espera a que esté publicada de verdad, que es lo que se comprueba. */
    await ana2.publicarMiLlave();
    const cA2 = await ana2.codigoCon(BETO);
    const cB2 = await beto.codigoCon(ANA);
    comprobar(cA2 !== cA, 'una llave nueva de por medio cambia el código');
    comprobar(cA2 === cB2, 'y sigue coincidiendo en los dos lados con dos aparatos de un lado');
    const sinLlave = cargarCliente(relevo.base, 'jwt-dani', {}, null);
    await sinLlave.alta({ email: DANI, name: 'Dani' }).catch(() => {});
    await ana.pedirAmistad(DANI); await sinLlave.responderAmistad(ANA, true);
    comprobar((await ana.codigoCon(DANI)) === null, 'con quien no publicó llaves no hay código (null)');
    comprobar((await ana.codigoCon(CARLA)) !== cA, 'y con otra persona es otro número');

    console.log('\n── los estados ───────────────────────────────────────────');
    const foto = Buffer.from('89504e470d0a1a0a-no-es-un-png-de-verdad-pero-son-bytes', 'utf8').toString('base64');
    const sub = await ana.subirPublico('estado.png', 'imagen', 'image/png', foto);
    comprobar(!!sub.id, 'la foto del estado sube en claro (pública)');
    const bajada = await fetch(ana.urlArchivo(sub.id)).then((r) => r.arrayBuffer());
    comprobar(Buffer.from(bajada).toString('base64') === foto, 'y baja byte a byte igual: nadie la cifró');
    const e = await ana.subirEstado({ texto: 'hola círculo', archivo: sub.id, fondo: 2 });
    comprobar(!!e.id, 'el estado queda subido');
    const deBeto = await beto.estados();
    const fila = deBeto.find((g) => g.correo === ANA);
    comprobar(!!fila && fila.estados.length === 1 && fila.sinVer === 1,
      'Beto lo ve en su lista, sin ver', JSON.stringify(fila && { sinVer: fila.sinVer, n: fila.estados.length }));
    comprobar(fila.estados[0].archivo === sub.id && fila.estados[0].tipo === 'imagen' && fila.estados[0].texto === 'hola círculo',
      'con su foto, su tipo y su texto');
    comprobar(fila.estados[0].vistas === null, 'y sin la cuenta de vistas: eso es del dueño');
    await beto.estadoVisto(e.id);
    const otraVez = (await beto.estados()).find((g) => g.correo === ANA);
    comprobar(otraVez.sinVer === 0 && otraVez.estados[0].visto === true, 'al verlo, deja de contar como sin ver');
    const mios = (await ana.estados()).find((g) => g.correo === ANA);
    comprobar(mios && mios.estados[0].vistas === 1, 'Ana ve que UNA persona lo vio', JSON.stringify(mios && mios.estados[0].vistas));
    const dani = cargarCliente(relevo.base, 'jwt-dani', {}, await candadoNuevo());
    await dani.alta({ email: DANI, name: 'Dani' });
    await dani.pedirAmistad(BETO); await beto.responderAmistad(DANI, true);
    // Dani es amigo de Ana también (arriba), así que sí lo ve; Carla y Beto
    // no son amigos entre sí: Beto no ve nada de Carla.
    await carla.subirEstado({ texto: 'solo para mi círculo' });
    comprobar(!(await beto.estados()).some((g) => g.correo === CARLA), 'quien no es del círculo no ve el estado');
    await ana.borrarEstado(e.id);
    comprobar(!(await beto.estados()).some((g) => g.correo === ANA), 'borrado, desaparece para todos');

    const f = fin();
    console.log(f ? `\n${f} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(f ? 1 : 0);
  } finally {
    relevo.cerrar();
  }
})();
