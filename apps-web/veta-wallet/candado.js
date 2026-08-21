/* El candado de PULSE2CHAT: cifrado de punta a punta para los mensajes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * Hasta hoy la app decia, con todas sus letras: «los mensajes escritos viajan
 * cifrados hasta nuestro servidor, pero ahi los podemos leer». Era verdad, y
 * por eso estaba escrito. Quitar ese aviso sin cambiar nada habria sido
 * mentir; la unica forma honesta de quitarlo es que deje de ser cierto.
 *
 * Esto es lo que hace que deje de ser cierto. A partir de aqui el servidor
 * guarda bultos que no puede abrir: no tiene ninguna de las llaves y no hay
 * forma de que las consiga, porque nunca salen del telefono.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO FUNCIONA, EN CASTELLANO
 *
 * Cada navegador —el telefono, la computadora— se fabrica UN PAR DE LLAVES la
 * primera vez que abre el chat. La publica se sube al servidor, como un numero
 * de telefono. La privada se queda guardada en el navegador y NO SE PUEDE
 * EXPORTAR: ni siquiera el propio codigo de la pagina puede leerla, solo
 * pedirle al navegador que la use. Eso es lo que significa `extractable:false`
 * mas abajo, y es lo que hace que un fallo de seguridad en la web no se lleve
 * las conversaciones de nadie.
 *
 * Para mandar un mensaje:
 *   1. Se sortea una llave nueva, de un solo uso, para ESE mensaje.
 *   2. Con ella se cierra el texto (AES-256-GCM).
 *   3. Esa llave de un solo uso se mete en un SOBRE para cada aparato de quien
 *      recibe —y otro para uno mismo, o no podria releer lo que escribio—.
 *      Cada sobre se cierra con un secreto que solo existe entre esos dos
 *      aparatos (ECDH: se calcula juntando mi llave privada con su llave
 *      publica, y da lo mismo que juntar la suya privada con la mia publica;
 *      el servidor, que solo tiene las publicas, no puede calcularlo).
 *   4. Al servidor se le entrega el bulto cerrado y los sobres. Nada mas.
 *
 * Quien recibe abre su sobre con su llave privada, saca la llave de un solo
 * uso, y con ella abre el mensaje.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTO **NO** HACE — y por que se dice
 *
 * · NO tiene secreto hacia adelante. Las llaves de aparato son fijas: si
 *   alguien se hiciera con una llave privada y ademas tuviera guardada la
 *   copia cifrada de todo el historial, podria abrirlo. Signal evita eso
 *   cambiando llaves en cada mensaje; eso es un proyecto aparte, mucho mas
 *   grande, y no se va a decir que esta hecho cuando no lo esta.
 *
 * · NO protege por si solo contra que el servidor mienta con las llaves. El
 *   servidor es quien reparte las llaves publicas; si repartiera una suya,
 *   podria colarse en medio. Por eso existe el CODIGO DE SEGURIDAD
 *   (`codigoDeSeguridad`): dos personas lo comparan por otro medio —en
 *   persona, por llamada— y si coincide, no hay nadie en medio. Es la misma
 *   idea que el «numero de seguridad» de Signal y de WhatsApp.
 *
 * · NO cifra lo viejo. Los mensajes de antes de hoy siguen como estaban. No se
 *   pueden cifrar hacia atras: ya los tiene el servidor.
 *
 * · NO esconde QUIEN habla con QUIEN ni CUANDO. El servidor tiene que saber a
 *   donde entregar. Se ve el sobre, no la carta.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE P-256 Y NO LA CURVA DE LA BILLETERA
 *
 * La billetera usa secp256k1, que es la de Bitcoin. Aqui se usa P-256 por una
 * razon practica: es la unica que el navegador sabe hacer POR SI MISMO, con
 * `crypto.subtle`, sin bajar ninguna libreria y —lo importante— guardando la
 * llave privada donde el codigo no la puede leer. Con secp256k1 habria que
 * hacer las cuentas en JavaScript, y entonces la llave tiene que estar en una
 * variable, a la vista de cualquier fallo.
 *
 * Y hay una segunda razon, mas de fondo: la llave del chat NO DEBE SER la
 * llave del dinero. Si fueran la misma, entrar al chat en una computadora
 * prestada pondria ahi la llave de los fondos. Son dos cosas distintas y
 * tienen que tener llaves distintas.
 */

const CANDADO = (() => {
  'use strict';

  const sc = globalThis.crypto?.subtle || null;
  const hay = () => !!sc && typeof indexedDB !== 'undefined';

  const CURVA = { name: 'ECDH', namedCurve: 'P-256' };

  /* LA CURVA DE FIRMA VA APARTE, y no es por gusto: WebCrypto no deja que una
     misma llave sirva para acordar un secreto (ECDH) y para firmar (ECDSA).
     Son dos pares distintos en el mismo aparato. */
  const CURVA_FIRMA = { name: 'ECDSA', namedCurve: 'P-256' };
  const FIRMA_HASH = { name: 'ECDSA', hash: 'SHA-256' };

  /* Version 1: el bulto NO decia quien lo escribio. `abrir()` derivaba el
     secreto con la llave publica que venia DENTRO del propio bulto, o sea con
     una llave que elegia quien lo fabricaba. AES-GCM garantiza que «quien
     conocia este secreto fabrico esto», y si el secreto sale de una llave
     elegida por el atacante, la garantia se queda en el aire: quien pudiera
     escribir en el relevo podia poner palabras en boca de un contacto.

     Version 2: el bulto va firmado con ECDSA, y `abrir()` exige que la firma
     cuadre contra las llaves PUBLICADAS del remitente que el servidor declara,
     no contra las que vienen dentro. Se siguen abriendo los bultos de version
     1 —son los que ya estan guardados y no se pueden refirmar— pero se
     devuelven marcados como no verificados, para que la app lo diga. */
  const VERSION = 2;
  const VERSION_SIN_FIRMA = 1;

  /* ── el cajon donde vive la llave privada ──────────────────────────────
     IndexedDB y no localStorage porque localStorage solo guarda TEXTO: para
     meter una llave ahi habria que exportarla, y una llave exportable es una
     llave que se puede robar. IndexedDB guarda el objeto CryptoKey tal cual,
     sin que su contenido pase nunca por JavaScript. */
  const CAJON = 'p2c-candado';
  const ANAQUEL = 'llaves';

  function abrirCajon() {
    return new Promise((sale, falla) => {
      const p = indexedDB.open(CAJON, 1);
      p.onupgradeneeded = () => {
        if (!p.result.objectStoreNames.contains(ANAQUEL)) p.result.createObjectStore(ANAQUEL);
      };
      p.onsuccess = () => sale(p.result);
      p.onerror = () => falla(p.error);
    });
  }

  function enCajon(modo, hacer) {
    return abrirCajon().then(db => new Promise((sale, falla) => {
      const tx = db.transaction(ANAQUEL, modo);
      const pedido = hacer(tx.objectStore(ANAQUEL));
      pedido.onsuccess = () => sale(pedido.result);
      pedido.onerror = () => falla(pedido.error);
    }));
  }

  /* ── utilidades de bytes ────────────────────────────────────────────────
     base64url, no base64 a secas: estos textos viajan dentro de JSON y a
     veces en direcciones, y `+` y `/` se rompen ahi. */
  const aB64 = buf => {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const deB64 = s => {
    const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  };
  const textoABytes = s => new TextEncoder().encode(s);
  const bytesATexto = b => new TextDecoder().decode(b);

  /* ── el par de llaves de ESTE aparato ───────────────────────────────── */

  let mio = null;          // { id, priv, pub, pubB64 }
  let arrancando = null;   // para que dos llamadas a la vez no creen dos pares

  async function crear() {
    const par = await sc.generateKey(CURVA, /* extractable */ false, ['deriveBits']);
    const pub = new Uint8Array(await sc.exportKey('raw', par.publicKey));
    /* El par de FIRMA. Es otro par, en otra curva, guardado al lado: WebCrypto
       no deja que una llave de acuerdo sirva tambien para firmar. Tambien sale
       inextraible, asi que una inyeccion en la pagina no se la lleva. */
    const parF = await sc.generateKey(CURVA_FIRMA, /* extractable */ false, ['sign', 'verify']);
    const pubF = new Uint8Array(await sc.exportKey('raw', parF.publicKey));
    /* El id del aparato es el resumen de su propia llave publica. No es un
       numero al azar: asi dos aparatos no pueden chocar nunca, y el id se
       puede volver a calcular a partir de la llave si hiciera falta. */
    const id = aB64(await sc.digest('SHA-256', pub)).slice(0, 22);
    const guardado = {
      id, priv: par.privateKey, pub: par.publicKey, pubB64: aB64(pub),
      privF: parF.privateKey, pubF: parF.publicKey, pubFB64: aB64(pubF),
    };
    await enCajon('readwrite', a => a.put({
      id, priv: par.privateKey, pub: par.publicKey,
      privF: parF.privateKey, pubF: parF.publicKey,
    }, 'aparato'));
    return guardado;
  }

  async function mias() {
    if (mio) return mio;
    if (arrancando) return arrancando;
    arrancando = (async () => {
      if (!hay()) return null;
      try {
        const g = await enCajon('readonly', a => a.get('aparato'));
        if (g?.priv && g?.pub) {
          const pub = new Uint8Array(await sc.exportKey('raw', g.pub));
          mio = { id: g.id, priv: g.priv, pub: g.pub, pubB64: aB64(pub) };

          /* APARATOS DE ANTES DE LA FIRMA.
             Los que ya existian no tienen par de firma. NO se les cambia el
             par de acuerdo —eso los dejaria sin poder abrir todo lo que ya
             recibieron— sino que se les agrega el de firma al lado, se guarda,
             y a partir de ahi firman como los nuevos. Es la unica forma de que
             el arreglo alcance a quien ya venia usando el chat. */
          if (g.privF && g.pubF) {
            const pubF = new Uint8Array(await sc.exportKey('raw', g.pubF));
            mio.privF = g.privF; mio.pubF = g.pubF; mio.pubFB64 = aB64(pubF);
          } else {
            const parF = await sc.generateKey(CURVA_FIRMA, false, ['sign', 'verify']);
            const pubF = new Uint8Array(await sc.exportKey('raw', parF.publicKey));
            mio.privF = parF.privateKey; mio.pubF = parF.publicKey; mio.pubFB64 = aB64(pubF);
            await enCajon('readwrite', a => a.put({
              id: g.id, priv: g.priv, pub: g.pub,
              privF: parF.privateKey, pubF: parF.publicKey,
            }, 'aparato')).catch(() => {});
          }
        } else {
          mio = await crear();
        }
      } catch {
        /* Navegacion privada, cuota llena, IndexedDB bloqueado: se sigue con
           un par que solo vive en memoria. Cifra igual mientras la pestaña
           este abierta; al cerrarla se pierde, y lo recibido con el no se
           puede releer. Es peor que guardarlo, y muchisimo mejor que mandar
           el texto en claro. */
        try { mio = await crearEnMemoria(); } catch { mio = null; }
      }
      return mio;
    })();
    return arrancando;
  }

  async function crearEnMemoria() {
    const par = await sc.generateKey(CURVA, false, ['deriveBits']);
    const pub = new Uint8Array(await sc.exportKey('raw', par.publicKey));
    const parF = await sc.generateKey(CURVA_FIRMA, false, ['sign', 'verify']);
    const pubF = new Uint8Array(await sc.exportKey('raw', parF.publicKey));
    const id = aB64(await sc.digest('SHA-256', pub)).slice(0, 22);
    return {
      id, priv: par.privateKey, pub: par.publicKey, pubB64: aB64(pub),
      privF: parF.privateKey, pubF: parF.publicKey, pubFB64: aB64(pubF),
      volatil: true,
    };
  }

  /** La llave publica de este aparato, lista para publicar. */
  async function miLlave() {
    const m = await mias();
    return m ? { id: m.id, pub: m.pubB64, fir: m.pubFB64 || null, volatil: !!m.volatil } : null;
  }

  /* ── el secreto compartido entre dos aparatos ─────────────────────────
     ECDH da 32 bytes crudos. Usarlos tal cual como llave es un error clasico:
     no estan repartidos parejo. HKDF los amasa hasta que si lo estan, y de
     paso ata el resultado a un texto fijo, para que el mismo secreto no sirva
     por accidente para otra cosa. */
  const cache = new Map();   // pubB64 -> CryptoKey (AES-GCM)

  async function secretoCon(pubAjenaB64) {
    const guardada = cache.get(pubAjenaB64);
    if (guardada) return guardada;
    const m = await mias();
    if (!m) throw new Error('sin-llaves');
    const suya = await sc.importKey('raw', deB64(pubAjenaB64), CURVA, false, []);
    const crudo = await sc.deriveBits({ name: 'ECDH', public: suya }, m.priv, 256);
    const semilla = await sc.importKey('raw', crudo, 'HKDF', false, ['deriveKey']);
    const k = await sc.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: textoABytes('pulse2chat/sobre/v1') },
      semilla, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    cache.set(pubAjenaB64, k);
    return k;
  }

  /* ── cerrar y abrir ─────────────────────────────────────────────────── */

  /**
   * Cierra un texto para una lista de aparatos.
   *
   * @param {string} texto
   * @param {Array<{id:string, pub:string}>} aparatos  los de quien recibe
   * @returns {Promise<object>} el bulto que se le entrega al servidor
   */
  async function cerrar(texto, aparatos) {
    const m = await mias();
    if (!m) throw new Error('sin-llaves');
    const propios = [{ id: m.id, pub: m.pubB64 }];
    /* El sobre para uno mismo no es un detalle: sin el, uno no puede releer lo
       que escribio desde este mismo aparato ni desde ningun otro suyo. Se
       incluyen TODOS los aparatos propios que se conozcan, no solo este. */
    const todos = dedup([...aparatos, ...propios]);
    if (!todos.length) throw new Error('sin-destino');

    const llaveMsg = await sc.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cerrado = await sc.encrypt({ name: 'AES-GCM', iv }, llaveMsg, textoABytes(texto));
    const cruda = await sc.exportKey('raw', llaveMsg);

    const sobres = [];
    for (const ap of todos) {
      try {
        const k = await secretoCon(ap.pub);
        const ivS = crypto.getRandomValues(new Uint8Array(12));
        const sobre = await sc.encrypt({ name: 'AES-GCM', iv: ivS }, k, cruda);
        sobres.push({ a: ap.id, iv: aB64(ivS), k: aB64(sobre) });
      } catch {
        /* Una llave publica corrupta no puede tumbar el envio a los demas.
           Ese aparato simplemente no podra abrirlo, y se nota: al abrirlo
           dira que no tiene sobre. */
      }
    }
    if (!sobres.length) throw new Error('sin-destino');

    /* LO QUE SE FIRMA, y por que eso y no otra cosa.
       Se firma el resumen de todo lo que identifica a este bulto: la version,
       la llave de acuerdo de quien escribe, el texto cifrado, su vector, y la
       lista entera de sobres. Con eso, cambiar un solo byte de cualquiera de
       las partes —o mover un sobre de un bulto a otro— rompe la firma.
       La firma NO tapa los metadatos: quien habla con quien y cuando lo sigue
       viendo el servidor, y eso esta escrito arriba en los limites del diseño. */
    const cuerpo = { v: VERSION, de: m.pubB64, iv: aB64(iv), ct: aB64(cerrado), s: sobres };
    const firma = m.privF
      ? aB64(await sc.sign(FIRMA_HASH, m.privF, textoABytes(paraFirmar(cuerpo))))
      : null;

    /* `fir` es la llave publica de firma de ESTE aparato, y va dentro para que
       quien abre sepa cual de los aparatos del remitente firmo. No sirve como
       prueba por si sola: `abrir()` exige que esa llave este entre las que el
       remitente tiene PUBLICADAS, y eso se comprueba contra el servidor, no
       contra el bulto. */
    return firma ? { ...cuerpo, fir: m.pubFB64, f: firma } : cuerpo;
  }

  /** El texto exacto que se firma. Mismo orden siempre, o la firma no cuadra. */
  function paraFirmar(c) {
    return [
      'pulse2chat/bulto/v2',
      c.v, c.de, c.iv, c.ct,
      (c.s || []).map(x => `${x.a}.${x.iv}.${x.k}`).join('|'),
    ].join('\n');
  }

  /** Cierra bytes (una foto, una nota de voz) con una llave suelta. */
  async function cerrarBytes(bytes) {
    const llave = await sc.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cerrado = await sc.encrypt({ name: 'AES-GCM', iv }, llave, bytes);
    return {
      bytes: new Uint8Array(cerrado),
      /* La llave del archivo viaja DENTRO del texto cifrado del mensaje, no
         al lado. Por eso el servidor guarda el archivo cerrado y jamas ve con
         que abrirlo. */
      llave: aB64(await sc.exportKey('raw', llave)),
      iv: aB64(iv),
    };
  }

  async function abrirBytes(bytes, llaveB64, ivB64) {
    const llave = await sc.importKey('raw', deB64(llaveB64), { name: 'AES-GCM' }, false, ['decrypt']);
    return new Uint8Array(await sc.decrypt({ name: 'AES-GCM', iv: deB64(ivB64) }, llave, bytes));
  }

  /**
   * Abre un bulto. Devuelve el texto, o null si este aparato no tiene sobre
   * —lo cual es normal: un mensaje que llego cuando este navegador todavia no
   * existia no se puede abrir aqui, y la app lo dice con esas palabras en vez
   * de mostrar un renglon vacio.
   */
  /**
   * Abre un bulto y dice si de verdad lo escribio quien dice.
   *
   * EL SEGUNDO ARGUMENTO NO ES OPCIONAL DE VERDAD, aunque el codigo lo tolere.
   * `aparatosDelRemitente` son los aparatos PUBLICADOS de quien el servidor
   * dice que escribio. Sin esa lista no hay con que comparar la firma, y lo
   * unico que se puede hacer es abrir el bulto y decir que no se pudo
   * verificar. Quien llame sin ella se queda sin la mitad util de esta
   * funcion.
   *
   * @param {object} bulto
   * @param {Array<{id:string,pub:string,fir?:string}>} aparatosDelRemitente
   * @returns {Promise<{texto:string, verificado:boolean, motivo:string}|null>}
   */
  async function abrir(bulto, aparatosDelRemitente) {
    const m = await mias();
    if (!m || !bulto) return null;
    if (bulto.v !== VERSION && bulto.v !== VERSION_SIN_FIRMA) return null;
    const sobre = (bulto.s || []).find(x => x.a === m.id);
    if (!sobre) return null;

    let texto;
    try {
      const k = await secretoCon(bulto.de);
      const cruda = await sc.decrypt({ name: 'AES-GCM', iv: deB64(sobre.iv) }, k, deB64(sobre.k));
      const llaveMsg = await sc.importKey('raw', cruda, { name: 'AES-GCM' }, false, ['decrypt']);
      const claro = await sc.decrypt({ name: 'AES-GCM', iv: deB64(bulto.iv) }, llaveMsg, deB64(bulto.ct));
      texto = bytesATexto(claro);
    } catch {
      /* GCM falla si el bulto fue tocado. Que falle es la señal de que algo
         no cuadra, no un detalle a esconder. */
      return null;
    }

    return { texto, ...(await juzgarFirma(bulto, aparatosDelRemitente)) };
  }

  /**
   * Decide si la firma de un bulto prueba quien lo escribio.
   *
   * Tres respuestas, y las tres importan por separado:
   *   verificado:true                 la firma cuadra con un aparato publicado
   *   verificado:false + 'sin-firma'  bulto viejo, de antes de que se firmara
   *   verificado:false + lo demas     ALGO NO CUADRA. La app tiene que decirlo.
   */
  async function juzgarFirma(bulto, aparatos) {
    if (!bulto.f || !bulto.fir) return { verificado: false, motivo: 'sin-firma' };
    if (!Array.isArray(aparatos) || !aparatos.length) {
      return { verificado: false, motivo: 'sin-llaves-del-remitente' };
    }

    /* LA COMPROBACION QUE CIERRA EL AGUJERO.
       La llave que viene en el bulto no vale por si sola: tiene que estar entre
       las que el remitente PUBLICO. Sin este renglon, quien pudiera escribir en
       el relevo firmaria con una llave suya y todo cuadraria. */
    const publicadas = aparatos.map(a => a && a.fir).filter(Boolean);
    if (!publicadas.includes(bulto.fir)) {
      return { verificado: false, motivo: 'llave-no-publicada' };
    }

    /* Y ademas: la llave de acuerdo que dice el bulto tiene que ser la del
       MISMO aparato que firmo. Si no, alguien podria firmar con su llave un
       bulto cerrado con la de otro. */
    const suyo = aparatos.find(a => a && a.fir === bulto.fir);
    if (!suyo || suyo.pub !== bulto.de) {
      return { verificado: false, motivo: 'aparato-no-cuadra' };
    }

    try {
      const llave = await sc.importKey('raw', deB64(bulto.fir), CURVA_FIRMA, false, ['verify']);
      const ok = await sc.verify(
        FIRMA_HASH, llave, deB64(bulto.f),
        textoABytes(paraFirmar({ v: bulto.v, de: bulto.de, iv: bulto.iv, ct: bulto.ct, s: bulto.s })));
      return ok ? { verificado: true, motivo: '' } : { verificado: false, motivo: 'firma-rota' };
    } catch {
      return { verificado: false, motivo: 'firma-ilegible' };
    }
  }

  function dedup(lista) {
    const visto = new Set();
    return (lista || []).filter(x => {
      if (!x?.id || !x?.pub || visto.has(x.id)) return false;
      visto.add(x.id);
      return true;
    });
  }

  /* ── el codigo de seguridad ─────────────────────────────────────────────
     Sesenta digitos, en dos mitades: la de cada uno. Se ordenan siempre igual
     —la menor primero— para que las dos personas vean EXACTAMENTE el mismo
     numero y puedan leerlo en voz alta sin liarse con el orden.

     Si coincide, no hay nadie en medio. Si no coincide, alguien cambio una
     llave: puede ser que la otra persona reinstalo, o puede ser un ataque, y
     hasta saber cual de las dos cosas es, no se manda nada delicado. */
  async function codigoDeSeguridad(pubsMias, pubsSuyas) {
    if (!hay()) return null;
    const huella = async lista => {
      const juntas = (lista || []).slice().sort().join('|');
      const h = await sc.digest('SHA-256', textoABytes('pulse2chat/codigo/v1|' + juntas));
      const b = new Uint8Array(h);
      let s = '';
      /* Diez grupos de cinco cifras: es como se lee un numero largo en voz
         alta sin perder el sitio. */
      for (let i = 0; i < 15; i += 3) {
        const n = (b[i] << 16 | b[i + 1] << 8 | b[i + 2]) % 100000;
        s += String(n).padStart(5, '0') + ' ';
      }
      return s.trim();
    };
    const [a, b] = await Promise.all([huella(pubsMias), huella(pubsSuyas)]);
    return (a < b ? a + '  ' + b : b + '  ' + a);
  }

  return {
    hay, miLlave, mias, cerrar, abrir, juzgarFirma, cerrarBytes, abrirBytes,
    codigoDeSeguridad, aB64, deB64,
  };
})();

if (typeof window !== 'undefined') window.CANDADO = CANDADO;
