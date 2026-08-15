import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput, Platform } from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable, useCampoAuto } from '../og/Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Card, Field, hap, useToast, useAccount } from '../ui';
import { genesis, revisarFormaMrz } from '../genesis';
import { leerDeFoto, leerTexto, puedeEscanear, nombreDeAnverso, datosDeMrz, mismoNombre } from '../mrzOcr';
import { FRECUENTES, buscarPaises, nombrePais } from '../paises';
import { SenaGesto, OvaloRostro } from '../RostroGuia';
import { setPassport } from '../accounts';
import { getSeed } from '../api';
import PedirClave from '../PedirClave';
import { useT } from '../i18n';

// ---------------- GENESIS ID: verificación de identidad ----------------
//
// La app NO verifica a nadie: aporta los datos y espera la decisión de una
// persona del equipo de cumplimiento. El GID solo aparece cuando esa decisión
// existe.
//
// Cuatro pasos: datos → documento → rostro → revisión.

export function Kyc({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login: loginAccount } = useAccount();

  const [paso, setPaso] = useState('cargando');
  const [estado, setEstado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Paso 1 — datos declarados
  //
  // La fecha se pide en tres casillas y no en un campo con formato. Tenía que
  // escribirse exactamente «1990-05-23»: un guion de menos y el servidor
  // respondía que no coincidía con el documento, sin forma de volver atrás a
  // corregirlo. Tres números con teclado numérico no se pueden escribir mal.
  const [nombre, setNombre] = useState(account?.name || '');
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [pais, setPais] = useState(account?.country || 'HND');
  const [buscaPais, setBuscaPais] = useState('');
  const [eligiendoPais, setEligiendoPais] = useState(false);

  // Perfil de cumplimiento. No es papeleo: es lo unico contra lo que se puede
  // comparar un movimiento cuando salte una alerta.
  //
  // PERO ES PROPORCIONAL. La primera pregunta es cuanto espera mover: por
  // debajo de 10 000 USD al año rige la diligencia simplificada y el resto
  // del formulario es opcional — a quien mueve 300 dolares no se le puede
  // exigir el mismo papeleo que a quien mueve 50 000. Si despues sus
  // movimientos reales cruzan el umbral, Genesis ID abre caso y pide el
  // perfil completo: la trampa de declarar poco y mover mucho no funciona.
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ocupacion, setOcupacion] = useState('');
  const [origenFondos, setOrigenFondos] = useState('');
  const [proposito, setProposito] = useState('');
  const [rangoVolumen, setRangoVolumen] = useState('');   // 'bajo' | 'medio' | 'alto'
  const [masDatos, setMasDatos] = useState(false);        // desplegar lo opcional
  const [pep, setPep] = useState(null);
  const requiereCompleto = rangoVolumen === 'alto';
  const refMes = useRef(null);
  const refAnio = useRef(null);

  const nacimiento = (dia && mes && anio)
    ? `${anio.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
    : '';

  /** ¿Es una fecha que existe de verdad? El 31 de febrero no. */
  const fechaValida = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return false;
    const [a, m, d] = nacimiento.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return false;
    const edad = (Date.now() - f.getTime()) / 31557600000;
    return edad >= 18 && edad <= 120;
  })();

  // Paso 2 — documento
  const [mrz, setMrz] = useState('');
  const [problemas, setProblemas] = useState([]);
  const [escaneando, setEscaneando] = useState(false);   // false | 'anverso' | 'reverso'
  const camaraDoc = useRef(null);
  // Linterna para documentos con poca luz, y el escaneo continuo: la camara
  // intenta leer sola cada segundo, como cualquier lector comercial. Apretar
  // un boton en el instante exacto era la causa numero uno de fotos borrosas.
  const [linterna, setLinterna] = useState(false);
  const [intentoAuto, setIntentoAuto] = useState(0);
  const autoActivo = useRef(false);
  // Texto del anverso. Se guarda el TEXTO, nunca la imagen: la foto del
  // documento no sale del telefono, y sin embargo el nombre completo —el que
  // la MRZ corta— si llega a Genesis ID para poder cotejarlo.
  const [textoAnverso, setTextoAnverso] = useState('');
  // Y la foto del anverso, reducida. Sin ella el rostro NO se puede cotejar:
  // comparar dos caras exige dos caras. Se manda una sola vez, en el momento
  // del cotejo, y Genesis ID no la guarda — compara y la descarta.
  const [fotoAnverso, setFotoAnverso] = useState(null);
  // El nombre tal como lo leyó el OCR (del anverso o, si este no se dejó, de
  // la MRZ). Es la referencia del cotejo local: se compara con lo declarado
  // y, si cuadran y hay selfie, la solicitud viaja marcada 'automatico'.
  // La marca informa; aprobar sigue siendo del servidor Genesis.
  const [nombreOcr, setNombreOcr] = useState('');
  // Intentos de anverso que no dieron nombre. Al segundo se ofrece el
  // reverso: la MRZ trae dígitos de control y se deja leer donde el texto
  // impreso no. El ref lleva la cuenta exacta dentro del bucle asíncrono,
  // donde el estado de React llega tarde.
  const [fallosAnverso, setFallosAnverso] = useState(0);
  const fallosAnv = useRef(0);
  // Qué cotejo viajó con el rostro, para contarlo en la sala de espera.
  const [cotejoEnviado, setCotejoEnviado] = useState(null);

  // Paso 3 — rostro y prueba de vida
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef(null);
  const [reto, setReto] = useState(null);
  const [gesto, setGesto] = useState(0);
  const [fotogramas, setFotogramas] = useState([]);
  const [cuenta, setCuenta] = useState(null);   // cuenta atrás antes de cada foto
  const [toma, setToma] = useState(0);          // 1 o 2: cuál de las dos fotos va
  const [manual, setManual] = useState(false);  // el usuario prefiere disparar él
  const disparo = useRef(null);                 // resolver() del disparo manual
  const corriendo = useRef(false);              // para cortar la secuencia al salir

  // Un aviso que SE QUEDA en pantalla. Los errores salían como un mensajito
  // que se iba solo en dos segundos: si mirabas la cámara en ese momento, no
  // llegabas a leerlo y te quedabas sin saber qué pasó ni qué hacer.
  const [aviso, setAviso] = useState(null);

  async function guardarEnCuenta(vista) {
    if (!account || !vista?.genesisUid) return;
    const actualizada = await setPassport(account.email, {
      genesisUid: vista.genesisUid,
      fullName: vista.fullName,
      email: vista.email,
      walletAddress: account.addr,
      status: 'verified',
      issuedAt: vista.actualizadaEn,
    });
    if (actualizada) loginAccount(actualizada);
  }

  async function refrescar(avisar) {
    const e = await genesis.estado();
    if (!e || e.error) {
      // 'sin-puente' (el backend no tiene la ruta) y 'sin-clave' (la tiene
      // pero sin GENESIS_API_KEY) son el mismo problema visto por el usuario:
      // falta terminar de configurar el servidor. Se dice, en vez de dejarle
      // creer que es su conexión.
      const faltaConfig = e?.code === 'sin-puente' || e?.code === 'sin-clave';
      setFallo(faltaConfig
        ? { code: 'config', detail: t('gen.errBridge') }
        : { code: e?.code || 'red', detail: e?.error });
      setPaso('fallo');
      return null;
    }
    setFallo(null);
    setEstado(e);
    if (e.verificada) {
      await guardarEnCuenta(e);
      // Ata esta cuenta al GID para que valga en el resto del ecosistema.
      genesis.vincular().catch(() => {});
      setPaso('listo');
    } else {
      setPaso(e.paso);
      if (avisar && e.paso === 'revision') toast(t('gen.stillPending'));
    }
    return e;
  }

  useEffect(() => { refrescar(false); }, []);

  // ---- paso 1 ----
  async function enviarDatos() {
    if (!nombre.trim()) { setAviso({ mal: true, txt: t('gen.needName') }); return; }
    if (!fechaValida) { setAviso({ mal: true, txt: t('gen.needDob') }); return; }
    hap(); setOcupado(true);
    const r = await genesis.declararDatos({
      nombreCompleto: nombre.trim(),
      fechaNacimiento: nacimiento,
      paisResidencia: pais,
    });
    setOcupado(false);
    if (!r || r.error) { setAviso({ mal: true, txt: r?.error || t('gen.errNetT') }); return; }
    setAviso(null); setEstado(r); setPaso('perfil');
  }

  // ---- paso 1b: perfil de cumplimiento ----
  async function enviarPerfil() {
    if (!rangoVolumen) { setAviso({ mal: true, txt: t('gen.needVolume') }); return; }
    // Solo por encima del umbral el perfil completo es obligatorio.
    if (requiereCompleto && (!ocupacion.trim() || !origenFondos)) {
      setAviso({ mal: true, txt: t('gen.needAml') }); return;
    }
    hap(); setOcupado(true);
    // El valor representativo de cada franja. No se pide la cifra exacta:
    // nadie la sabe, y lo que decide el nivel de diligencia es la franja.
    const volumenUsd = rangoVolumen === 'bajo' ? 500 : rangoVolumen === 'medio' ? 5000 : 15000;
    const r = await genesis.declararDatos({
      telefono: telefono.trim() || undefined,
      direccion: direccion.trim() || undefined,
      ocupacion: ocupacion.trim() || undefined,
      origenFondos: origenFondos || undefined,
      propositoCuenta: proposito || undefined,
      volumenEsperadoUsd: volumenUsd,
      pepDeclarado: pep,
    });
    setOcupado(false);
    if (!r || r.error) { setAviso({ mal: true, txt: r?.error || t('gen.errNetT') }); return; }
    setAviso(null); setEstado(r); setPaso('documento');
  }

  /**
   * Reduce la foto antes de mandarla.
   *
   * `quality` comprime pero NO cambia el tamaño: una foto de 12 megapíxeles
   * sigue pesando dos megas, y en base64 casi tres. Con ocho fotogramas eso
   * son veinte megas y el servidor devolvía 413 —«demasiado grande»— sin que
   * la persona pudiera hacer nada al respecto.
   *
   * A 720 píxeles de ancho cada fotograma baja a unos 60 kB. El análisis de
   * rostro no necesita más resolución que esa, y de paso la subida deja de
   * tardar una eternidad con datos móviles.
   */
  async function encoger(uri) {
    const r = await ImageManipulator.manipulateAsync(
      uri, [{ resize: { width: 720 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return r?.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  }

  // ---- paso 2: leer la MRZ con la cámara ----
  //
  // La foto NO sale del teléfono: el reconocimiento es local y lo único que
  // viaja es el texto. Es lo que permite que la pantalla prometa «nunca la foto
  // de tu documento» y sea verdad.

  /** Un anverso más sin nombre legible. Al segundo, el camino cambia: se
   *  ofrece el reverso, cuya MRZ trae dígitos de control y casi siempre sale. */
  function falloAnverso() {
    fallosAnv.current += 1;
    setFallosAnverso(fallosAnv.current);
    if (fallosAnv.current === 2) setAviso({ mal: false, txt: t('gen.frontFallback') });
  }

  /**
   * El anverso se da por bueno SOLO aquí: con un nombre leído. Aceptar texto
   * sin nombre era mandar basura a la revisión manual — mejor repetir la foto.
   *
   * El nombre PRECARGA el campo si está vacío; si la persona ya escribió otra
   * cosa, no se le pisa: se le ofrece adoptarlo con un toque.
   */
  function aceptarAnverso(texto, pequena, nombreLeido) {
    setTextoAnverso(texto);
    setFotoAnverso(pequena);
    setNombreOcr(nombreLeido);
    if (!nombre.trim()) setNombre(nombreLeido);
    cerrarEscaner();
    setAviso(null);
    hap(Haptics.ImpactFeedbackStyle.Heavy);
    toast(t('gen.readName', { n: nombreLeido }));
  }

  /**
   * El reverso vale por sí solo: de la MRZ salen nombre, fecha y número, y los
   * dígitos de control ya los comprobó `leerDeFoto`. Precarga lo que esté
   * vacío —nunca pisa lo tecleado— y deja la MRZ lista para el paso del
   * documento. Ojo: la MRZ recorta nombres largos; por eso el anverso, si ya
   * se leyó, manda sobre ella como referencia del cotejo.
   */
  function aceptarReverso(mrzTexto, corregida) {
    setMrz(mrzTexto);
    const d = datosDeMrz(mrzTexto);
    if (d?.nombre) {
      if (!textoAnverso) setNombreOcr(d.nombre);
      if (!nombre.trim()) setNombre(d.nombre);
      if (d.nacimiento && !dia && !mes && !anio) {
        setDia(d.nacimiento.dia); setMes(d.nacimiento.mes); setAnio(d.nacimiento.anio);
      }
    }
    cerrarEscaner();
    setAviso(null);
    hap(Haptics.ImpactFeedbackStyle.Heavy);
    toast(d?.nombre ? t('gen.readName', { n: d.nombre })
      : corregida ? t('gen.scanFixed') : t('gen.scanOk'));
  }

  async function abrirEscaner(cara) {
    if (!permiso?.granted) { const p = await pedirPermiso(); if (!p?.granted) return; }
    hap(); setProblemas([]); setAviso(null); setIntentoAuto(0); setEscaneando(cara);
  }

  function cerrarEscaner() {
    autoActivo.current = false;
    setLinterna(false);
    setEscaneando(false);
  }

  /**
   * Escaneo continuo: un intento por segundo hasta que lea, sin tocar nada.
   *
   * La version anterior pedia apretar «Leer» en el momento justo, y ahi se
   * perdia casi todo el mundo: la mano se mueve al apretar, la foto sale
   * movida, y el mensaje de error no decia si acercarse, alejarse o buscar
   * luz. Un lector que intenta solo cada segundo convierte «apunta y aprieta
   * en el instante perfecto» en «sostene el telefono encima y espera» — que
   * es lo que cualquiera puede hacer.
   *
   * El boton manual sigue existiendo por si el bucle no lo logra: tomar la
   * foto uno mismo con el documento bien puesto sigue siendo la salida.
   */
  useEffect(() => {
    if (!escaneando) return;
    autoActivo.current = true;
    let vivo = true;
    const cara = escaneando;

    (async () => {
      // Un respiro para que la persona encuadre antes del primer intento.
      await new Promise((r) => setTimeout(r, 1600));
      // No hay luxómetro sin módulo nativo, pero el propio OCR hace de
      // fotómetro barato: un encuadre a oscuras devuelve casi cero caracteres.
      // Tres frames casi vacíos seguidos = aviso de luz, una sola vez.
      let oscuros = 0;
      for (let n = 1; vivo && autoActivo.current && n <= 15; n++) {
        setIntentoAuto(n);
        try {
          const foto = await camaraDoc.current?.takePictureAsync(
            { quality: 0.85, skipProcessing: true, shutterSound: false });
          if (!vivo || !autoActivo.current) break;
          if (foto?.uri) {
            if (cara === 'reverso') {
              const r = await leerDeFoto(foto.uri);
              if (!vivo || !autoActivo.current) break;
              if (r.ok) {
                autoActivo.current = false;
                aceptarReverso(r.mrz, r.corregida);
                return;
              }
              // «Cortadas» es corregible al instante: se avisa sin parar el bucle.
              if (r.motivo === 'cortadas') setAviso({ mal: false, txt: t('gen.scanCut') });
            } else {
              const texto = await leerTexto(foto.uri);
              if (!vivo || !autoActivo.current) break;
              const letras = texto.replace(/[^A-ZÁÉÍÓÚÑa-z]/g, '').length;
              oscuros = letras < 12 ? oscuros + 1 : 0;
              if (oscuros === 3) setAviso({ mal: false, txt: t('gen.lowLight') });
              // El frente solo se acepta con un NOMBRE leído: texto suelto sin
              // nombre es basura camino de la revisión manual. Mejor otra foto.
              const nombreLeido = letras >= 25 ? nombreDeAnverso(texto) : null;
              if (nombreLeido) {
                const pequena = await encoger(foto.uri);
                if (!vivo || !autoActivo.current) break;
                autoActivo.current = false;
                aceptarAnverso(texto, pequena, nombreLeido);
                return;
              }
            }
          }
        } catch (e) { /* un intento fallido no corta el bucle */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Se agotaron los intentos: queda la camara abierta con el boton manual.
      if (vivo && autoActivo.current) {
        autoActivo.current = false;
        setIntentoAuto(-1);
        // Un ciclo entero de anverso sin nombre cuenta como un intento fallido:
        // al segundo se ofrece el reverso, que es el camino que sí sale.
        if (cara === 'anverso') falloAnverso();
      }
    })();

    return () => { vivo = false; autoActivo.current = false; };
  }, [escaneando]);

  /**
   * Anverso del documento: la cara con la foto y el nombre COMPLETO.
   *
   * Es lo que pide la mayoria de los reguladores y lo que resuelve el nombre
   * cortado: la MRZ del reverso tiene ancho fijo y recorta —«JOSE» sale
   * «JOS»—, y sin el anverso no hay forma de distinguir un nombre truncado de
   * una discrepancia real.
   *
   * Se reconoce el texto aqui y se manda solo eso. La imagen no viaja.
   */
  async function leerAnverso() {
    hap(); setOcupado(true);
    try {
      const foto = await camaraDoc.current?.takePictureAsync({ quality: 1, skipProcessing: true });
      if (!foto?.uri) { setAviso({ mal: true, txt: t('gen.errPhoto') }); setOcupado(false); return; }
      const texto = await leerTexto(foto.uri);
      // Sin NOMBRE no hay trato: un frente que no dice quién es no sirve para
      // cotejar nada y acabaría en revisión manual. Se distingue «no se leyó
      // casi nada» (luz, encuadre) de «se leyó texto pero ningún nombre».
      const nombreLeido = nombreDeAnverso(texto);
      if (!nombreLeido) {
        setOcupado(false);
        setAviso({ mal: true, txt: texto && texto.length >= 12 ? t('gen.frontNoName') : t('gen.frontRetry') });
        falloAnverso();
        return;
      }
      const pequena = await encoger(foto.uri);
      setOcupado(false);
      aceptarAnverso(texto, pequena, nombreLeido);
    } catch (e) { setOcupado(false); setAviso({ mal: true, txt: t('gen.errPhoto') }); }
  }

  async function escanearDocumento() {
    hap(); setOcupado(true);
    try {
      const foto = await camaraDoc.current?.takePictureAsync({ quality: 1, skipProcessing: true });
      if (!foto?.uri) { setAviso({ mal: true, txt: t('gen.errPhoto') }); setOcupado(false); return; }

      const r = await leerDeFoto(foto.uri);
      setOcupado(false);

      if (r.ok) {
        aceptarReverso(r.mrz, r.corregida);
        return;
      }
      // Si se leyó algo con forma de MRZ pero los dígitos no cuadran, se deja
      // en el cuadro de texto: corregir dos caracteres es mucho mejor que
      // teclear ochenta y ocho.
      if (r.mrz) {
        setMrz(r.mrz);
        cerrarEscaner();
        setAviso({ mal: true, txt: t('gen.scanPartial') });
        return;
      }
      // «Cortadas» no es «no se ve nada»: se leyeron las lineas pero el
      // telefono estaba demasiado cerca. Decirle a alguien que busque mas luz
      // cuando lo que sobra es cercania es mandarlo a perder el tiempo.
      if (r.motivo === 'cortadas') { setAviso({ mal: true, txt: t('gen.scanCut') }); return; }
      setAviso({ mal: true, txt: r.motivo === 'sin-lector' ? t('gen.scanNoReader') : t('gen.scanRetry') });
    } catch (e) { setOcupado(false); setAviso({ mal: true, txt: t('gen.errPhoto') }); }
  }

  /**
   * Leer desde una foto ya tomada.
   *
   * Con la camara de la app no se puede enfocar ni acercar a voluntad. La
   * camara del telefono si, y para un documento gastado eso es la diferencia
   * entre leerlo y no leerlo. La imagen tampoco sale del telefono.
   */
  async function elegirFoto() {
    hap();
    try {
      const ImagePicker = require('expo-image-picker');
      const permisoGaleria = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permisoGaleria?.granted) { setAviso({ mal: true, txt: t('gen.scanNoGallery') }); return; }
      const sel = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ['images'] });
      if (sel?.canceled || !sel?.assets?.[0]?.uri) return;

      setOcupado(true);
      const r = await leerDeFoto(sel.assets[0].uri);
      setOcupado(false);
      if (r.ok) { aceptarReverso(r.mrz, r.corregida); return; }
      if (r.mrz) {
        setMrz(r.mrz); cerrarEscaner();
        setAviso({ mal: true, txt: t('gen.scanPartial') });
        return;
      }
      setAviso({ mal: true, txt: r.motivo === 'cortadas' ? t('gen.scanCut') : t('gen.scanRetry') });
    } catch (e) { setOcupado(false); setAviso({ mal: true, txt: t('gen.scanRetry') }); }
  }

  async function enviarDocumento() {
    hap(); setOcupado(true); setProblemas([]);
    const r = await genesis.enviarDocumento(mrz, textoAnverso);
    setOcupado(false);
    if (r.aceptable) { setEstado(r.estado); setProblemas([]); setPaso('rostro'); return; }
    // Los dígitos de control detectan al instante un error de transcripción,
    // así que se dice exactamente qué falla en vez de "inténtelo de nuevo".
    setProblemas(r.problemas?.length ? r.problemas : [t('gen.docBad')]);
  }

  // ---- paso 3: rostro con prueba de vida ----
  //
  // La secuencia de gestos la sortea el servidor y viene con caducidad. La app
  // solo la muestra, graba un fotograma por gesto y los devuelve en ese orden;
  // no decide nada ni puntúa nada, porque cualquier comprobación hecha en el
  // teléfono la desactiva quien controla el teléfono.

  async function comenzarReto() {
    if (!permiso?.granted) { const p = await pedirPermiso(); if (!p?.granted) return; }
    hap(); setAviso(null); setOcupado(true);
    const r = await genesis.pedirReto();
    setOcupado(false);
    if (!r || r.error) { setAviso({ mal: true, txt: r?.error || t('gen.errNetT') }); return; }
    setReto(r); setGesto(0); setFotogramas([]);
    correrReto(r);
  }

  /**
   * Recorre los gestos SOLO. La persona no toca el teléfono en ningún momento.
   *
   * La versión anterior pedía apretar un botón después de cada gesto, y con
   * «cierra los ojos» eso era literalmente imposible: no se puede ver el botón
   * con los ojos cerrados, y al abrirlos para buscarlo el gesto ya no se
   * cumple. Nadie podía terminar la verificación, y el mensaje culpaba a la luz.
   *
   * Ahora hay una cuenta atrás con vibración en cada número —que se siente sin
   * mirar— y la foto se toma sola. Con los ojos cerrados se sigue por el tacto.
   */
  async function correrReto(r) {
    const dormir = (ms) => new Promise((r2) => setTimeout(r2, ms));
    const tomados = [];
    corriendo.current = true;
    try {
      for (let i = 0; i < r.gestos.length; i++) {
        setGesto(i);
        // Un respiro para leer la instrucción antes de que empiece la cuenta.
        setCuenta(null);
        await dormir(1400);
        if (!corriendo.current) return;

        if (manual) {
          // Modo manual: se espera a que la persona dispare. Sirve cuando la
          // cuenta atras va demasiado rapida, o cuando alguien necesita su
          // tiempo para colocarse.
          setCuenta(null);
          await new Promise((res) => { disparo.current = res; });
          disparo.current = null;
          if (!corriendo.current) return;
        } else {
          for (let c = 3; c > 0; c--) {
            setCuenta(c);
            hap();
            await dormir(900);
            if (!corriendo.current) return;
          }
          setCuenta(0);
        }
        hap(Haptics.ImpactFeedbackStyle.Heavy); // el pulso fuerte = «ya»

        // DOS fotos por gesto, separadas medio segundo. Es lo que salva la
        // verificacion: entre que se lee la instruccion y se dispara hay un
        // instante, y con una sola foto un gesto bien hecho se pierde por
        // llegar tarde o adelantarse. Al servidor le basta con que una salga
        // bien; una fotografia sigue sin poder hacerlo en ninguna.
        for (let k = 0; k < 2; k++) {
          setToma(k + 1);
          const foto = await camara.current?.takePictureAsync({ quality: 1, skipProcessing: true });
          if (!corriendo.current) return;
          const pequena = foto?.uri ? await encoger(foto.uri) : null;
          if (!corriendo.current) return;
          if (!pequena) { setAviso({ mal: true, txt: t('gen.errPhoto') }); reiniciarReto(); return; }
          tomados.push(pequena);
          if (k === 0) await dormir(450);
        }
        setToma(0);
        setFotogramas([...tomados]);
        await dormir(400);
      }

      setCuenta(null);
      setOcupado(true);
      // Cotejo local honesto: si el nombre leído por OCR y el declarado son la
      // misma firma Y hay foto del documento para comparar el rostro, la
      // solicitud viaja marcada 'automatico'. Es una marca, no una aprobación:
      // el servidor Genesis coteja de nuevo y la decisión sigue siendo suya.
      const cotejo = (fotoAnverso && coincide) ? 'automatico' : undefined;
      setCotejoEnviado(cotejo || null);
      const res = await genesis.enviarRostro({
        reto: r.id, fotogramas: tomados, fotoDocumento: fotoAnverso, cotejo,
      });
      setOcupado(false);
      if (!corriendo.current) return;
      if (!res || res.error) {
        setAviso({ mal: true, txt: res?.error || t('gen.errNetT') });
        reiniciarReto();
        return;
      }

      setEstado(res.estado);
      reiniciarReto();

      // Un cotejo fallido no puede acabar en la cola de revisión sin más: casi
      // siempre es un gesto a medias y se repite en veinte segundos.
      const bio = res.biometria;
      if (bio?.estado === 'fallida') {
        const fallo = (bio.gestos || []).find((g) => !g.ok);
        setAviso({
          mal: true,
          txt: fallo ? `${t('gesto.' + fallo.gesto)} — ${fallo.motivo || ''}` : t('gen.liveFailed'),
        });
        return; // sigue en 'rostro', con el botón de repetir
      }
      if (bio?.estado === 'dudosa') setAviso({ mal: false, txt: t('gen.liveDoubt') });
      setPaso('revision');
    } catch (e) {
      setOcupado(false);
      if (corriendo.current) { setAviso({ mal: true, txt: t('gen.errPhoto') }); reiniciarReto(); }
    } finally {
      corriendo.current = false;
      setCuenta(null);
    }
  }

  function reiniciarReto() {
    corriendo.current = false;
    setReto(null); setGesto(0); setFotogramas([]); setCuenta(null); setToma(0);
  }

  useEffect(() => {
    if (paso !== 'listo') return;
    const timer = setTimeout(() => nav.go('passport'), 2400);
    return () => clearTimeout(timer);
  }, [paso]);

  const forma = revisarFormaMrz(mrz);
  // ¿Lo leído y lo declarado son la misma firma? Se recalcula en cada render
  // porque cambia si la persona edita el campo después de escanear.
  const coincide = Boolean(nombreOcr && nombre.trim() && mismoNombre(nombreOcr, nombre));

  // Poder volver atrás. No lo habia en ningun paso: si algo fallaba —un dato
  // mal escrito, un documento que no cuadraba— la unica salida era abandonar
  // la verificacion entera y empezar de cero.
  const ANTERIOR = { perfil: 'datos', documento: 'perfil', rostro: 'documento', revision: 'rostro' };
  function volver() {
    const previo = ANTERIOR[paso];
    if (!previo) return;
    hap(); reiniciarReto(); setEscaneando(false); setAviso(null); setProblemas([]);
    setPaso(previo);
  }

  return (
    // Cabecera fija y cuerpo desplazable: al enfocar un campo la pantalla
    // lo sube por encima del teclado (ver src/og/Teclado.js).
    <PantallaConTeclado desplaza={false} style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go(account ? 'settings' : 'auth')} />
      <CuerpoDesplazable contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>

        {paso !== 'cargando' && paso !== 'listo' && paso !== 'fallo' && (
          <Pasos actual={paso} />
        )}

        {/* Se queda hasta que la persona lo cierra o avanza. */}
        {aviso && (
          <Pressable onPress={() => setAviso(null)} style={[st.warn, !aviso.mal && st.warnInfo]}>
            <Icon name={aviso.mal ? 'alert-circle' : 'information-circle'} size={20}
              color={aviso.mal ? '#F0776B' : C.gold} />
            <View style={{ flex: 1 }}>
              <Text style={st.warnTxt}>{aviso.txt}</Text>
              <Text style={[st.warnTxt, { color: C.txt3, marginTop: 4 }]}>{t('gen.tapToClose')}</Text>
            </View>
          </Pressable>
        )}

        {ANTERIOR[paso] && (
          <Pressable onPress={volver} style={st.volver}>
            <Icon name="chevron-back" size={16} color={C.txt3} />
            <Text style={st.volverTxt}>{t('gen.goBack')}</Text>
          </Pressable>
        )}

        {/* Ya verificado: no se vuelve a pedir nada. Antes la pantalla seguia
            ofreciendo rehacer el tramite a quien ya tenia su GID. */}
        {paso === 'listo' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(62,217,160,0.12)' }]}>
              <Icon name="checkmark-circle" size={30} color={C.up || '#3ED9A0'} />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.alreadyVerified')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.alreadyVerifiedP')}</Text>
            {estado?.genesisUid ? (
              <Text style={[st.gestoTxt, { textAlign: 'center' }]}>{estado.genesisUid}</Text>
            ) : null}
            <Button3D title={t('gen.seePassport')} icon="card" onPress={() => nav.go('passport')}
              style={{ alignSelf: 'stretch', marginTop: 14 }} />
          </View>
        )}

        {paso === 'cargando' && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={[st.body, { textAlign: 'center', marginTop: 18 }]}>{t('gen.processing')}</Text>
          </View>
        )}

        {/* ---- escáner del documento (compartido) ----
            Vive FUERA de los pasos porque sirve a dos: en «datos» lee el
            frente para PRECARGAR el nombre —que nadie teclee lo que la cámara
            puede leer— y en «documento» completa anverso y MRZ. El marco guía
            tiene la proporción real del documento (85,6 × 54 mm). */}
        {escaneando && (paso === 'datos' || paso === 'documento') ? (
          <>
            <Text style={st.gestoTxt}>
              {escaneando === 'anverso' ? t('gen.frontTitle') : t('gen.backTitle')}
            </Text>
            <View style={st.camaraCaja}>
              <CameraView ref={camaraDoc} style={{ flex: 1 }} facing="back"
                autofocus="on" enableTorch={linterna} />
              {/* Marco con la proporcion real de una cedula (85,6 × 54 mm)
                  y, en el reverso, la franja donde va la MRZ: encuadrar
                  bien es la diferencia entre leer a la primera y fallar
                  tres veces. */}
              <View style={st.guiaMarco} pointerEvents="none">
                <View style={st.guiaDoc}>
                  <View style={[st.esquina, { top: -1, left: -1, borderTopWidth: 2.5, borderLeftWidth: 2.5 }]} />
                  <View style={[st.esquina, { top: -1, right: -1, borderTopWidth: 2.5, borderRightWidth: 2.5 }]} />
                  <View style={[st.esquina, { bottom: -1, left: -1, borderBottomWidth: 2.5, borderLeftWidth: 2.5 }]} />
                  <View style={[st.esquina, { bottom: -1, right: -1, borderBottomWidth: 2.5, borderRightWidth: 2.5 }]} />
                  {escaneando === 'reverso' && <View style={st.franjaMrz} />}
                </View>
              </View>
              {/* Linterna: documentos leidos de noche o en interiores. */}
              <Pressable onPress={() => { hap(); setLinterna(!linterna); }} style={st.botonLinterna}>
                <Icon name={linterna ? 'flashlight' : 'flashlight-outline'} size={20}
                  color={linterna ? C.gold : '#fff'} />
              </Pressable>
            </View>

            {/* Que esta pasando, en una linea: buscando, o consejos si no lee. */}
            <Text style={st.mrzPista}>
              {ocupado ? t('gen.scanReading')
                : intentoAuto === -1 ? t('gen.autoNoLuck')
                : intentoAuto >= 5 ? t('gen.autoHints')
                : intentoAuto > 0 ? t('gen.autoScanning')
                : (escaneando === 'anverso' ? t('gen.frontAim') : t('gen.scanAim'))}
            </Text>

            <Button3D
              title={ocupado ? t('gen.scanReading') : t('gen.scanShot')}
              icon="card" disabled={ocupado}
              onPress={() => {
                autoActivo.current = false;
                (escaneando === 'anverso' ? leerAnverso : escanearDocumento)();
              }}
              style={{ marginTop: 12 }} />
            {/* Dos anversos sin nombre y el camino cambia AQUI mismo: el
                reverso trae dígitos de control y se deja leer casi siempre. */}
            {escaneando === 'anverso' && fallosAnverso >= 2 && (
              <Pressable onPress={() => { hap(); setIntentoAuto(0); setEscaneando('reverso'); }}
                style={st.retry} disabled={ocupado}>
                <Text style={st.retryTxt}>{t('gen.tryBack')}</Text>
              </Pressable>
            )}
            {escaneando === 'reverso' && (
              <Pressable onPress={() => { autoActivo.current = false; elegirFoto(); }}
                style={st.retry} disabled={ocupado}>
                <Text style={st.retryTxt}>{t('gen.scanGallery')}</Text>
              </Pressable>
            )}
            <Pressable onPress={cerrarEscaner} style={st.retry} disabled={ocupado}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.cancel')}</Text>
            </Pressable>
          </>
        ) : null}

        {/* ---- 1. datos ---- */}
        {paso === 'datos' && !escaneando && (
          <>
            <View style={st.heroIcon}><Icon name="person" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepDataT')}</Text>
            <Text style={st.body}>{t('gen.stepDataP')}</Text>
            {/* La verificación que pasa sola empieza aquí: la cámara lee el
                nombre del frente del documento y el campo se llena solo,
                EDITABLE. Teclear queda como salida, no como norma. */}
            {puedeEscanear() && (
              <Pressable onPress={() => abrirEscaner('anverso')} disabled={ocupado}
                style={[st.cara, nombreOcr && st.caraLista]}>
                <Icon name={nombreOcr ? 'checkmark-circle' : 'scan'} size={22}
                  color={nombreOcr ? C.up || '#3ED9A0' : C.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={st.caraT}>
                    {nombreOcr ? t('gen.readName', { n: nombreOcr }) : t('gen.scanFromData')}
                  </Text>
                  <Text style={st.caraD}>{t('gen.scanFromDataHint')}</Text>
                </View>
              </Pressable>
            )}
            <Field label={t('prof.name')} value={nombre} onChangeText={setNombre}
              placeholder={t('gen.nameHint')} autoCapitalize="words" />
            <Text style={st.foot2}>{t('gen.nameAsDoc')}</Text>
            {/* Si lo leído y lo tecleado no son la misma firma, adoptar lo del
                documento es un toque: lo declarado tiene que coincidir con el
                documento o el servidor lo rebota después. */}
            {nombreOcr && nombre.trim() && !coincide ? (
              <Pressable onPress={() => { hap(); setNombre(nombreOcr); }} style={st.retry}>
                <Text style={st.retryTxt}>{t('gen.useDocName', { n: nombreOcr })}</Text>
              </Pressable>
            ) : null}

            {/* Tres casillas y salto automático: se teclea sin pensar en formatos. */}
            <Text style={st.label}>{t('gen.dob')}</Text>
            <View style={st.fecha}>
              <TextInput style={st.fechaCaja} value={dia} placeholder={t('gen.dobD')}
                placeholderTextColor="#6f938f" keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => {
                  const n = v.replace(/\D/g, ''); setDia(n);
                  if (n.length === 2) refMes.current?.focus();
                }} />
              <Text style={st.fechaSep}>/</Text>
              <TextInput ref={refMes} style={st.fechaCaja} value={mes} placeholder={t('gen.dobM')}
                placeholderTextColor="#6f938f" keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => {
                  const n = v.replace(/\D/g, ''); setMes(n);
                  if (n.length === 2) refAnio.current?.focus();
                }} />
              <Text style={st.fechaSep}>/</Text>
              <TextInput ref={refAnio} style={[st.fechaCaja, { flex: 1.5 }]} value={anio}
                placeholder={t('gen.dobY')} placeholderTextColor="#6f938f"
                keyboardType="number-pad" maxLength={4}
                onChangeText={(v) => setAnio(v.replace(/\D/g, ''))} />
            </View>
            {dia && mes && anio.length === 4 && !fechaValida && (
              <Text style={st.mrzPista}>{t('gen.dobBad')}</Text>
            )}

            <Text style={st.label}>{t('gen.country')}</Text>
            <View style={st.paises}>
              {FRECUENTES.map((p) => (
                <Pressable key={p} onPress={() => { hap(); setPais(p); setEligiendoPais(false); }}
                  style={[st.pais, pais === p && st.paisSel]}>
                  {/* El NOMBRE, no el codigo: «HND» no le dice nada a nadie. */}
                  <Text style={[st.paisTxt, pais === p && st.paisTxtSel]}>{nombrePais(p)}</Text>
                </Pressable>
              ))}
              {/* Sin esto, quien no viva en uno de los diez de arriba no podía
                  terminar la verificación, o declaraba un país que no es el suyo. */}
              <Pressable onPress={() => { hap(); setEligiendoPais(!eligiendoPais); }}
                style={[st.pais, !FRECUENTES.includes(pais) && st.paisSel]}>
                <Text style={[st.paisTxt, !FRECUENTES.includes(pais) && st.paisTxtSel]}>
                  {FRECUENTES.includes(pais) ? t('gen.otherCountry') : nombrePais(pais)}
                </Text>
              </Pressable>
            </View>
            <Text style={st.foot2}>{nombrePais(pais)}</Text>

            {eligiendoPais && (
              <View style={{ marginTop: 10 }}>
                <TextInput style={st.buscaPais} value={buscaPais} onChangeText={setBuscaPais}
                  placeholder={t('gen.searchCountry')} placeholderTextColor="#6f938f"
                  autoCorrect={false} />
                <View style={st.listaPaises}>
                  {buscarPaises(buscaPais).slice(0, 40).map(([codigo, nombrePs]) => (
                    <Pressable key={codigo} style={st.filaPais}
                      onPress={() => { hap(); setPais(codigo); setEligiendoPais(false); setBuscaPais(''); }}>
                      <Text style={st.filaPaisTxt}>{nombrePs}</Text>
                      <Text style={st.filaPaisCod}>{codigo}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <Button3D title={t('gen.continue')} icon="arrow-forward" onPress={enviarDatos}
              disabled={ocupado || !nombre.trim() || !fechaValida} style={{ marginTop: 18 }} />
            <Text style={st.foot}>{t('gen.dataFoot')}</Text>
          </>
        )}

        {/* ---- 1b. perfil de cumplimiento ---- */}
        {paso === 'perfil' && (
          <>
            <View style={st.heroIcon}><Icon name="shield-checkmark" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepAmlT')}</Text>
            <Text style={st.body}>{t('gen.stepAmlP')}</Text>

            {/* LA PREGUNTA QUE DECIDE TODO LO DEMAS. Bajo el umbral de
                10 000 USD rige la diligencia simplificada: una sola pregunta
                y listo. Solo por encima se exige el perfil completo. */}
            <Text style={st.label}>{t('gen.volumeQ')}</Text>
            <View style={st.paises}>
              {['bajo', 'medio', 'alto'].map((k) => (
                <Pressable key={k} onPress={() => { hap(); setRangoVolumen(k); }}
                  style={[st.pais, rangoVolumen === k && st.paisSel]}>
                  <Text style={[st.paisTxt, rangoVolumen === k && st.paisTxtSel]}>{t(`vol.${k}`)}</Text>
                </Pressable>
              ))}
            </View>
            {rangoVolumen ? (
              <Text style={[st.foot2, { marginTop: 6 }, requiereCompleto && { color: '#FBBF24' }]}>
                {requiereCompleto ? t('gen.volNoteFull') : t('gen.volNoteSimple')}
              </Text>
            ) : null}

            {/* PEP se pregunta siempre: no depende del volumen y es un toque. */}
            <Text style={st.label}>{t('gen.pepQ')}</Text>
            <View style={st.paises}>
              <Pressable onPress={() => { hap(); setPep(false); }}
                style={[st.pais, pep === false && st.paisSel]}>
                <Text style={[st.paisTxt, pep === false && st.paisTxtSel]}>{t('gen.pepNo')}</Text>
              </Pressable>
              <Pressable onPress={() => { hap(); setPep(true); }}
                style={[st.pais, pep === true && st.paisSel]}>
                <Text style={[st.paisTxt, pep === true && st.paisTxtSel]}>{t('gen.pepYes')}</Text>
              </Pressable>
            </View>
            <Text style={st.foot2}>{t('gen.pepNote')}</Text>

            {/* El resto: obligatorio sobre el umbral, plegado y opcional debajo. */}
            {!requiereCompleto && rangoVolumen ? (
              <Pressable onPress={() => { hap(); setMasDatos(!masDatos); }} style={st.retry}>
                <Icon name={masDatos ? 'chevron-down' : 'chevron-forward'} size={14} color={C.gold} />
                <Text style={st.retryTxt}>{t('gen.addOptional')}</Text>
              </Pressable>
            ) : null}

            {(requiereCompleto || masDatos) && (
              <>
                <Field label={t('gen.job') + (requiereCompleto ? '' : t('gen.optMark'))} value={ocupacion}
                  onChangeText={setOcupacion} placeholder={t('gen.jobHint')} />

                <Text style={st.label}>{t('gen.funds')}{requiereCompleto ? '' : t('gen.optMark')}</Text>
                <View style={st.paises}>
                  {['salario', 'negocio', 'remesas', 'inversiones', 'pension', 'herencia', 'otro'].map((k) => (
                    <Pressable key={k} onPress={() => { hap(); setOrigenFondos(k); }}
                      style={[st.pais, origenFondos === k && st.paisSel]}>
                      <Text style={[st.paisTxt, origenFondos === k && st.paisTxtSel]}>{t(`funds.${k}`)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={st.label}>{t('gen.purpose')}{t('gen.optMark')}</Text>
                <View style={st.paises}>
                  {['ahorro', 'remesas', 'pagos', 'negocio', 'inversion'].map((k) => (
                    <Pressable key={k} onPress={() => { hap(); setProposito(k); }}
                      style={[st.pais, proposito === k && st.paisSel]}>
                      <Text style={[st.paisTxt, proposito === k && st.paisTxtSel]}>{t(`purpose.${k}`)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Field label={t('gen.phone') + t('gen.optMark')} value={telefono} onChangeText={setTelefono}
                  placeholder={t('gen.phoneHint')} keyboardType="phone-pad" />
                <Field label={t('gen.address') + t('gen.optMark')} value={direccion} onChangeText={setDireccion}
                  placeholder={t('gen.addressHint')} />
              </>
            )}

            <Button3D title={t('gen.continue')} icon="arrow-forward" onPress={enviarPerfil}
              disabled={ocupado || !rangoVolumen || (requiereCompleto && (!ocupacion.trim() || !origenFondos))}
              style={{ marginTop: 18 }} />
          </>
        )}

        {/* ---- 2. documento ---- */}
        {paso === 'documento' && !escaneando && (
          <>
            <View style={st.heroIcon}><Icon name="card" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepDocT')}</Text>
            <Text style={st.body}>{t('gen.stepDocP')}</Text>

            {/* La cámara va primero y a mano queda como salida de emergencia:
                teclear 88 caracteres llenos de «<» es donde la gente abandona.
                El escáner en sí vive arriba, compartido con el paso de datos:
                este bloque entero se esconde mientras se escanea. */}
            {/* Tres consejos ANTES de abrir la camara. Son los tres motivos
                reales por los que una lectura falla; leerlos antes evita el
                ciclo de foto-error-foto-error que hace abandonar. */}
            <View style={st.tips}>
              {['tips1', 'tips2', 'tips3'].map((k, n) => (
                <View key={k} style={st.tip}>
                  <View style={st.tipN}><Text style={st.tipNTxt}>{n + 1}</Text></View>
                  <Text style={st.tipTxt}>{t(`gen.${k}`)}</Text>
                </View>
              ))}
            </View>

            {puedeEscanear() ? (
              <>
                {/* Las dos caras, como las pide cualquier verificacion seria:
                    el anverso lleva el nombre completo y el reverso el codigo
                    que se puede comprobar solo. */}
                <Pressable onPress={() => abrirEscaner('anverso')} disabled={ocupado}
                  style={[st.cara, textoAnverso && st.caraLista]}>
                  <Icon name={textoAnverso ? 'checkmark-circle' : 'card'} size={22}
                    color={textoAnverso ? C.up || '#3ED9A0' : C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.caraT}>{t('gen.frontTitle')}</Text>
                    <Text style={st.caraD}>
                      {textoAnverso ? t('gen.frontDone') : t('gen.frontHint')}
                    </Text>
                    {/* Se enseña lo que importa de lo leído: EL NOMBRE, no un
                        volcado de OCR. Si salió mal, se ve y se repite la foto
                        sabiendo por qué. */}
                    {textoAnverso ? (
                      <Text style={[st.caraD, { fontSize: 11, marginTop: 4 }, nombreOcr && { color: C.up }]}
                        numberOfLines={2}>
                        {nombreOcr ? t('gen.readName', { n: nombreOcr })
                          : textoAnverso.replace(/\s+/g, ' ').slice(0, 120)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                <Pressable onPress={() => abrirEscaner('reverso')} disabled={ocupado}
                  style={[st.cara, forma.ok && st.caraLista]}>
                  <Icon name={forma.ok ? 'checkmark-circle' : 'card'} size={22}
                    color={forma.ok ? C.up || '#3ED9A0' : C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.caraT}>{t('gen.backTitle')}</Text>
                    <Text style={st.caraD}>
                      {forma.ok ? t('gen.backDone', { f: forma.formato }) : t('gen.backHint')}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <View style={st.warn}>
                <Icon name="information-circle" size={20} color={C.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={st.warnTxt}>{t('gen.scanNeedsApk')}</Text>
                </View>
              </View>
            )}

            <Card style={{ padding: 14, marginBottom: 14 }}>
              <Text style={st.cardTitle}>{t('gen.mrzWhere')}</Text>
              <Text style={[st.foot2, { marginTop: 6, marginBottom: 10 }]}>{t('gen.docBack')}</Text>
              <Text style={st.mrzEjemplo} numberOfLines={2}>
                P&lt;HNDPEREZ&lt;&lt;JUAN&lt;CARLOS&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;{'\n'}
                A123456781HND9005236M3012159&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;06
              </Text>
            </Card>

            <Text style={st.label}>{t('gen.mrzLabel')}</Text>
            <TextInput
              value={mrz}
              onChangeText={setMrz}
              multiline
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              placeholder={'P<HND...\nA12345678...'}
              placeholderTextColor="#6f938f"
              style={st.mrzInput}
            />
            {mrz.trim().length > 0 && (
              <Text style={[st.mrzPista, forma.ok && { color: C.up }]}>
                {forma.ok ? t('gen.mrzOk', { f: forma.formato }) : forma.motivo}
              </Text>
            )}

            {problemas.length > 0 && (
              <View style={st.warn}>
                <Icon name="alert-circle" size={20} color="#F0776B" />
                <View style={{ flex: 1 }}>
                  {problemas.map((p, i) => <Text key={i} style={st.warnTxt}>{p}</Text>)}
                </View>
              </View>
            )}

            {/* Si lo que falla es el nombre o la fecha que declaró, el problema
                no está en el documento sino en el paso anterior — y hasta ahora
                no había manera de volver: la verificación se quedaba muerta ahí. */}
            {problemas.some((p) => /declarad|coincid/i.test(p)) && (
              <Pressable onPress={() => { hap(); setProblemas([]); setPaso('datos'); }} style={st.retry}>
                <Text style={st.retryTxt}>{t('gen.fixData')}</Text>
              </Pressable>
            )}

            <Button3D title={t('gen.sendDoc')} icon="shield-checkmark" onPress={enviarDocumento}
              disabled={ocupado || !forma.ok} style={{ marginTop: 16 }} />
            <Text style={st.foot}>{t('gen.docFoot')}</Text>
          </>
        )}

        {/* ---- 3. rostro ---- */}
        {paso === 'rostro' && (
          <>
            <View style={st.heroIcon}><Icon name="person" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepFaceT')}</Text>
            <Text style={st.body}>{t('gen.stepFaceP')}</Text>

            {!permiso?.granted ? (
              <Button3D title={t('gen.allowCam')} icon="eye" onPress={pedirPermiso} />
            ) : !reto ? (
              <>
                <Text style={st.body}>{t('gen.liveIntro')}</Text>
                {/* Sin la foto del anverso no hay con que comparar el rostro:
                    mas vale decirlo aqui que dejar la verificacion en espera. */}
                {!fotoAnverso && (
                  <View style={[st.warn, st.warnInfo]}>
                    <Icon name="information-circle" size={20} color={C.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.warnTxt}>{t('gen.needFront')}</Text>
                    </View>
                  </View>
                )}
                {/* El estado del cotejo, dicho ANTES del selfie: si ya cuadra,
                    la solicitud saldrá marcada para el pase automático; si no,
                    se avisa que la mirará una persona — sin sorpresas luego. */}
                {nombreOcr ? (
                  <Text style={[st.mrzPista, coincide && { color: C.up }]}>
                    {coincide ? t('gen.matchOk') : t('gen.matchNo')}
                  </Text>
                ) : null}
                <Button3D title={t('gen.liveStart')} icon="finger-print" onPress={comenzarReto}
                  disabled={ocupado} style={{ marginTop: 16 }} />
              </>
            ) : (
              <>
                <Text style={st.gestoPaso}>
                  {t('gen.liveStep', { n: gesto + 1, total: reto.gestos.length })}
                </Text>
                <Text style={st.gestoTxt}>
                  {t(`gesto.${reto.gestos[gesto]}`) !== `gesto.${reto.gestos[gesto]}`
                    ? t(`gesto.${reto.gestos[gesto]}`)
                    : reto.instrucciones[gesto]}
                </Text>

                {/* El dibujo se mueve como hay que moverse: se entiende sin leer. */}
                <View style={st.sena}><SenaGesto gesto={reto.gestos[gesto]} /></View>

                <View style={st.camaraCaja}>
                  <CameraView ref={camara} style={{ flex: 1 }} facing="front" />
                  <OvaloRostro cuenta={cuenta} listo={cuenta === 0} />
                </View>

                <View style={st.puntos}>
                  {reto.gestos.map((g, k) => (
                    <View key={g + k} style={[st.punto, k < Math.floor(fotogramas.length / 2) && st.puntoHecho]} />
                  ))}
                </View>

                <Text style={st.mrzPista}>
                  {ocupado ? t('gen.liveSending')
                    : toma ? t('gen.liveShotN', { n: toma })
                    : cuenta !== null ? t('gen.liveHold')
                    : manual ? t('gen.liveReady') : t('gen.liveAuto')}
                </Text>

                {manual ? (
                  <Button3D title={ocupado ? t('gen.liveSending') : t('gen.liveShotManual')}
                    icon="eye" disabled={ocupado}
                    onPress={() => { hap(); disparo.current?.(); }}
                    style={{ marginTop: 12 }} />
                ) : null}

                <Pressable onPress={() => setManual(!manual)} style={st.retry} disabled={ocupado}>
                  <Text style={st.retryTxt}>{manual ? t('gen.liveToAuto') : t('gen.liveToManual')}</Text>
                </Pressable>
                <Pressable onPress={reiniciarReto} style={st.retry} disabled={ocupado}>
                  <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.liveRetry')}</Text>
                </Pressable>
              </>
            )}
            <Text style={st.foot}>{reto ? t('gen.liveFoot') : t('gen.faceFoot')}</Text>
          </>
        )}

        {/* ---- 4. revisión ---- */}
        {paso === 'revision' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
              <Icon name="time" size={30} color="#FBBF24" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.reviewT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.reviewP')}</Text>
            {/* Si todo cuadró en el teléfono se dice — y se dice también que
                la palabra final es de Genesis ID: estados honestos. */}
            {cotejoEnviado === 'automatico' && (
              <Text style={[st.body, { textAlign: 'center', color: C.up }]}>{t('gen.reviewAuto')}</Text>
            )}
            <Button3D title={t('gen.recheck')} icon="refresh" onPress={() => refrescar(true)}
              style={{ alignSelf: 'stretch', marginTop: 10 }} />
            <Pressable onPress={() => nav.go(account ? 'home' : 'auth')} style={st.retry}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.back')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- rechazada / suspendida ---- */}
        {(paso === 'rechazada' || paso === 'suspendida') && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(240,119,107,0.12)' }]}>
              <Icon name="close-circle" size={30} color="#F0776B" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>
              {paso === 'rechazada' ? t('gen.rejectedT') : t('gen.suspendedT')}
            </Text>
            <Text style={[st.body, { textAlign: 'center' }]}>
              {paso === 'rechazada' ? t('gen.rejectedP') : t('gen.suspendedP')}
            </Text>
            <Pressable onPress={() => nav.go('help')} style={st.retry}>
              <Icon name="help-buoy" size={14} color={C.gold} />
              <Text style={st.retryTxt}>{t('gen.contact')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- fallo de comunicación ---- */}
        {paso === 'fallo' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(240,119,107,0.12)' }]}>
              <Icon name="cloud-offline" size={30} color="#F0776B" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>
              {fallo?.code === 'auth' ? t('gen.errAuthT') : t('gen.errNetT')}
            </Text>
            <Text style={[st.body, { textAlign: 'center' }]}>
              {fallo?.code === 'auth' ? t('gen.errAuthP') : t('gen.errNetP')}
            </Text>
            {fallo?.detail ? <Text style={st.detail}>{fallo.detail}</Text> : null}
            <Button3D title={t('gen.recheck')} icon="refresh" onPress={() => { setPaso('cargando'); refrescar(false); }}
              style={{ alignSelf: 'stretch', marginTop: 16 }} />
            <Pressable onPress={() => nav.go(account ? 'home' : 'auth')} style={st.retry}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.back')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- verificada ---- */}
        {paso === 'listo' && (
          <View style={st.center}>
            <View style={st.doneBadge}><Icon name="checkmark" size={46} color={C.up} /></View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.doneT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.doneP')}</Text>
            {estado?.genesisUid && (
              <View style={st.uidChip}>
                <Icon name="finger-print" size={14} color={C.gold} />
                <Text style={st.uidTxt}>{estado.genesisUid}</Text>
              </View>
            )}
            <Button3D title={t('gen.seePass')} icon="arrow-forward" onPress={() => nav.go('passport')}
              style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        )}
      </CuerpoDesplazable>
    </PantallaConTeclado>
  );
}

const ORDEN = ['datos', 'perfil', 'documento', 'rostro', 'revision'];

function Pasos({ actual }) {
  const i = ORDEN.indexOf(actual);
  return (
    <View style={st.barra}>
      {ORDEN.map((p, n) => (
        <View key={p} style={[st.tramo, n <= i && st.tramoHecho]} />
      ))}
    </View>
  );
}



// ---------------- Oferta de emparejamiento tras crear la cuenta ----------------
export function GenesisOffer({ nav }) {
  const t = useT();
  const { account } = useAccount();

  // Quien YA tiene su Genesis ID no vuelve a ver la oferta: se le lleva a su
  // credencial. Ofrecerle hacer lo que ya hizo es un ruido innecesario.
  useEffect(() => {
    if (account?.genesisUid) nav.go('passport');
  }, [account?.genesisUid]);
  if (account?.genesisUid) return null;

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      {/* Salir sin verificar lleva al ECOSISTEMA, no a la billetera: es donde
          el nodo Genesis ID con su anillo ámbar sigue recordando lo que quedó
          pendiente. Mandarlo a la wallet era esconder el recordatorio. */}
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go('ecosistema')} />
      <ScrollView contentContainerStyle={{ padding: 22, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <LinearGradient colors={G.gold} style={st.offerIcon}>
            <Icon name="checkmark" size={38} color={C.darkText} />
          </LinearGradient>
          <Text style={[st.h1, { textAlign: 'center' }]}>{t('offer.title')}</Text>
          <Text style={[st.body, { textAlign: 'center' }]}>{t('offer.p')}</Text>
          {account?.addr ? (
            <View style={st.uidChip}>
              <Icon name="wallet" size={14} color={C.gold} />
              <Text style={st.uidTxt}>{account.addr.slice(0, 8)}…{account.addr.slice(-6)}</Text>
            </View>
          ) : null}
          <Button3D title={t('offer.now')} icon="finger-print" onPress={() => nav.go('kyc')} style={{ alignSelf: 'stretch', marginTop: 22 }} />
          {/* «Ahora no» también cae al ecosistema por la misma razón que la
              flecha de atrás: el Núcleo es quien recuerda, sin regañar. */}
          <Pressable onPress={() => { hap(); nav.go('ecosistema'); }} style={st.retry}>
            <Text style={st.retryTxt}>{t('offer.later')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------- Frase semilla (real, desde el backend) ----------------
export function SeedView({ nav }) {
  const t = useT();
  const [state, setState] = useState('hidden'); // hidden | shown | unavailable
  const [words, setWords] = useState([]);
  const [pedirPw, setPedirPw] = useState(false);

  // Se oculta sola a los 45 s, igual que el número de la tarjeta.
  useEffect(() => {
    if (state !== 'shown') return;
    const id = setTimeout(() => { setWords([]); setState('hidden'); }, 45000);
    return () => clearTimeout(id);
  }, [state]);

  // Misma contraseña que se pide para ver el PIN/número de la tarjeta: la
  // seed es lo más sensible que tiene la app, no puede quedar a un solo
  // toque de distancia si alguien agarra el teléfono desbloqueado.
  const revelar = async (password) => {
    try {
      const phrase = await getSeed(password);
      if (phrase) {
        setWords(phrase.split(/\s+/));
        setState('shown');
        // El usuario vio la seed: no hace falta seguirle recordando que la respalde.
        try { const { marcarSeedVista } = await import('../backupNudge'); marcarSeedVista(); } catch (e) {}
      } else {
        setState('unavailable');
      }
      setPedirPw(false);
      return { ok: true };
    } catch (e) {
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      setState('unavailable');
      setPedirPw(false);
      return { ok: true };
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('seed.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={st.warn}>
          <Icon name="warning" size={20} color={C.down} />
          <Text style={st.warnTxt}>{t('seed.warn')}</Text>
        </View>

        {state === 'shown' ? (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {words.map((w, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>{w}</Text>
              </View>
            ))}
          </View>
        ) : state === 'unavailable' ? (
          <Card style={{ padding: 18, marginVertical: 16 }}>
            <Text style={{ color: C.txt, fontWeight: '700', fontSize: 15, marginBottom: 8 }}>{t('seed.webT')}</Text>
            <Text style={{ color: C.txt2, fontSize: 12.5, lineHeight: 19 }}>{t('seed.webP')}</Text>
          </Card>
        ) : (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {Array.from({ length: 12 }).map((_, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>••••••</Text>
              </View>
            ))}
          </View>
        )}

        {state !== 'shown' && (
          <Button3D
            title={t('seed.reveal')}
            icon="eye"
            onPress={() => { hap(); setPedirPw(true); }}
          />
        )}
      </ScrollView>

      <PedirClave
        visible={pedirPw}
        titulo={t('seed.pwTitle')}
        subtitulo={t('card.pwWhy')}
        ctaTexto={t('card.reveal')}
        onCancel={() => setPedirPw(false)}
        onSubmit={revelar}
      />
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: C.txt3, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },

  barra: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  tramo: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.09)' },
  tramoHecho: { backgroundColor: C.gold },

  paises: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pais: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.input,
  },
  paisSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  paisTxt: { color: C.txt2, fontSize: 12.5, fontWeight: '600' },
  paisTxtSel: { color: C.gold },

  // La MRZ se lee y se teclea en monoespaciada: en cualquier otra tipografia
  // los '<' de relleno y los ceros se confunden y la persona se equivoca.
  mrzEjemplo: {
    color: C.txt3, fontSize: 10.5, lineHeight: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mrzInput: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2, borderRadius: 13,
    color: C.txt, padding: 13, minHeight: 96, textAlignVertical: 'top',
    fontSize: 12.5, letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mrzPista: { color: '#FBBF24', fontSize: 11.5, lineHeight: 16, marginTop: 8 },

  camaraCaja: {
    height: 320, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: C.line2, backgroundColor: '#000',
  },

  // La instrucción del gesto tiene que leerse de reojo, mirando a la cámara.
  warnInfo: { borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.08)' },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, paddingVertical: 4 },
  volverTxt: { color: C.txt3, fontSize: 13 },
  sena: { alignItems: 'center', marginBottom: 10 },
  cara: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, borderColor: C.line2, backgroundColor: '#06282a',
  },
  caraLista: { borderColor: 'rgba(62,217,160,0.45)' },
  caraT: { color: C.txt, fontSize: 14, fontWeight: '700' },
  caraD: { color: C.txt3, fontSize: 12, marginTop: 2 },
  foot2: { color: C.txt3, fontSize: 11.5, marginTop: -8, marginBottom: 12 },
  fecha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fechaCaja: {
    flex: 1, backgroundColor: '#06282a', borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingVertical: 12, color: C.txt, fontSize: 17,
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  fechaSep: { color: C.txt3, fontSize: 17 },
  buscaPais: {
    backgroundColor: '#06282a', borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.txt,
  },
  listaPaises: { marginTop: 8, maxHeight: 260, borderRadius: 12, overflow: 'hidden' },
  filaPais: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  filaPaisTxt: { color: C.txt, fontSize: 14, flex: 1 },
  filaPaisCod: { color: C.txt3, fontSize: 12, fontVariant: ['tabular-nums'] },

  // El marco tiene la proporcion real de una cedula (85,6 × 54 mm): si el
  // documento lo llena, la distancia es la correcta y la MRZ cabe entera.
  // La version anterior era un recuadro generico: la gente acercaba tanto el
  // telefono que las lineas salian cortadas por los lados.
  guiaMarco: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
  guiaDoc: {
    alignSelf: 'stretch', aspectRatio: 85.6 / 54, maxHeight: '86%',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.45)', borderRadius: 12,
  },
  esquina: {
    position: 'absolute', width: 26, height: 26, borderColor: C.gold, borderRadius: 2,
  },
  // Donde va la MRZ: el tercio de abajo del reverso. Verla marcada hace obvio
  // que ESA parte es la que tiene que quedar nitida dentro del marco.
  franjaMrz: {
    position: 'absolute', left: 6, right: 6, bottom: 6, height: '30%',
    borderWidth: 1.5, borderColor: 'rgba(62,217,160,0.8)', borderRadius: 6,
    backgroundColor: 'rgba(62,217,160,0.07)',
  },
  botonLinterna: {
    position: 'absolute', top: 12, right: 12, width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },

  tips: { gap: 8, marginBottom: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipN: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tipNTxt: { color: C.gold, fontWeight: '800', fontSize: 11 },
  tipTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 17 },
  gestoPaso: { color: C.txt3, fontSize: 12, letterSpacing: 1, marginTop: 14, textTransform: 'uppercase' },
  gestoTxt: { color: C.gold, fontSize: 22, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  punto: { width: 26, height: 4, borderRadius: 2, backgroundColor: C.line2 },
  puntoHecho: { backgroundColor: C.gold },

  heroIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  offerIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  h1: { color: C.txt, fontWeight: '800', fontSize: 22, lineHeight: 28, marginBottom: 8 },
  body: { color: C.txt2, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  cardTitle: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  rowK: { color: C.txt3, fontSize: 12.5 },
  rowV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  steps: { gap: 12, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepN: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(201,169,97,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepNTxt: { color: C.gold, fontWeight: '800', fontSize: 12.5 },
  stepTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  foot: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 16 },

  center: { alignItems: 'center', paddingVertical: 30 },
  doneBadge: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(62,217,160,0.12)',
    borderWidth: 2, borderColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  uidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.1)',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6,
  },
  uidTxt: { color: C.txt, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, marginTop: 4 },
  retryTxt: { color: C.gold, fontWeight: '600', fontSize: 13 },
  detail: { color: '#FBBF24', fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },

  warn: {
    flexDirection: 'row', gap: 12, backgroundColor: 'rgba(240,119,107,0.08)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.3)', borderRadius: 16, padding: 14,
    marginTop: 14, alignItems: 'center',
  },
  warnTxt: { color: '#f4b4ac', fontSize: 12.5, flex: 1, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  cellNo: { color: C.gold, fontSize: 12, opacity: 0.7, width: 16, textAlign: 'right' },
  cellWord: { color: C.txt, fontSize: 14, fontWeight: '500' },
});
