// Los grupos de AURO CHAT. Tres caras del mismo grupo en una sola pantalla,
// porque son el mismo grupo en momentos distintos y comparten todo (subir la
// foto, pintar miembros, el candado de Genesis):
//   · sin params → crearlo: nombre, foto y a quién meto de mis conversaciones;
//   · {id}       → su ficha: foto, nombre, miembros, el QR del enlace de
//                  invitación, invitar por correo, regenerar y salir;
//   · {inv}      → me invitaron: entrar y caer directo en el hilo.
// La invitación es una CAPABILITY: el token largo ES el permiso, no hay lista
// de invitados. Por eso el QR lleva el token pelado y por eso regenerarlo es
// la única forma de cerrarle la puerta a quien ya lo tenga.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, FlatList, Modal, Image,
  ActivityIndicator, Share, StyleSheet,
} from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable } from './Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, Button3D, useAccount, useToast, hap } from '../ui';
import { useLang } from '../i18n';
import { genesis } from '../genesis';
import * as M from './mensajes';
import { aUri } from './rutas';

const TXT = {
  es: {
    tituloNuevo: 'Nuevo grupo', subNuevo: 'Nombre, foto y quién entra',
    nombrePh: 'Nombre del grupo',
    anadirFoto: 'AÑADIR FOTO', cambiarFoto: 'CAMBIAR FOTO',
    buscaMiembros: 'Buscar en tus conversaciones…',
    deTusChats: 'DE TUS CONVERSACIONES', elegidos: '{n} elegidos',
    sinConvos: 'Todavía no has hablado con nadie. Crea el grupo igual y comparte su enlace: quien lo abra, entra.',
    nadieFiltro: 'Nadie con ese nombre en tus conversaciones.',
    crear: 'CREAR GRUPO', creando: 'CREANDO…',
    faltaNombre: 'Ponle un nombre al grupo.',
    muchos: 'Ya estás en 200 grupos, el máximo. Sal de alguno para crear otro.',
    noCrea: 'No se pudo crear el grupo. Revisa tu conexión.',

    tituloGrupo: 'Grupo',
    unMiembro: '1 miembro', miembrosN: '{n} miembros',
    admin: 'admin', tu: 'tú',
    miembrosTit: 'MIEMBROS', verTodos: 'VER LOS {n}',
    enlaceTit: 'ENLACE DE INVITACIÓN',
    enlaceTxt: 'Quien escanee este código o abra el enlace entra al grupo. El enlace ES el permiso: compártelo solo con quien quieras dentro.',
    copiar: 'COPIAR', compartir: 'COMPARTIR', copiado: 'Enlace copiado',
    invito: 'Te invito al grupo «{g}» en AURO CHAT.',
    invitarTit: 'INVITAR POR CORREO', correoPh: 'correo@ejemplo.com', invitar: 'INVITAR',
    invitado: 'Ya está dentro del grupo.',
    noEsta: 'Ese correo no está en AURO CHAT todavía, o ya es del grupo. Mándale el enlace.',
    correoMal: 'Ese correo no se ve bien.',
    regenerar: 'REGENERAR INVITACIÓN',
    regTit: '¿Regenerar la invitación?',
    regTxt: 'El enlace y el QR de ahora dejan de abrir al instante, también los que ya compartiste o alguien capturó. Nace uno nuevo y solo ese entra.',
    regenerada: 'Invitación nueva. La anterior ya no abre.',
    abrirHilo: 'ABRIR EL HILO', salir: 'SALIR DEL GRUPO',
    salirTit: '¿Salir del grupo?',
    salirTxt: 'Dejas de leer y de recibir sus mensajes desde este momento. Para volver, alguien tendrá que pasarte el enlace otra vez.',
    salirAdmin: ' Como tú lo creaste, el mando pasa al miembro más antiguo.',
    saliste: 'Saliste del grupo.',
    soloAdmin: 'Solo quien creó el grupo cambia su nombre y su foto.',
    guardar: 'GUARDAR', guardado: 'Guardado',
    noEres: 'No eres de este grupo, o ya no existe.',
    noCarga: 'No se pudo cargar el grupo. Revisa tu conexión.',
    noGuarda: 'No se pudo guardar. Intenta de nuevo.',

    tituloInv: 'Invitación',
    invTit: 'Te invitaron a un grupo',
    invTxt: 'Quien tiene este enlace entra: el enlace es el permiso. El nombre del grupo, su foto y quiénes están adentro se ven al entrar — antes no, porque todavía no eres del grupo.',
    unirme: 'UNIRME AL GRUPO', entrando: 'ENTRANDO…',
    dentro: 'Ya estás en «{g}»',
    invMala: 'Esa invitación ya no vale: la regeneraron o el grupo se cerró. Pide una nueva.',
    lleno: 'El grupo está lleno o ya estás en 200 grupos.',
    noEntra: 'No se pudo entrar. Revisa tu conexión.',

    cancelar: 'CANCELAR',
    grande: 'La foto pesa más de 8 MB y el relevo no la acepta. Elige una más ligera.',
    noSubio: 'No se pudo subir la foto. Revisa tu conexión.',
    gateTit: 'Los grupos son de gente verificada',
    gateTxt: 'Para entrar necesitas tu Genesis ID aprobado. Así todos saben que del otro lado hay personas reales.',
    gateBtn: 'COMPLETAR MI GENESIS ID', mirando: 'Comprobando tu Genesis ID…',
  },
  en: {
    tituloNuevo: 'New group', subNuevo: 'Name, photo and who joins',
    nombrePh: 'Group name',
    anadirFoto: 'ADD PHOTO', cambiarFoto: 'CHANGE PHOTO',
    buscaMiembros: 'Search your conversations…',
    deTusChats: 'FROM YOUR CONVERSATIONS', elegidos: '{n} selected',
    sinConvos: 'You have not talked to anyone yet. Create the group anyway and share its link: whoever opens it, joins.',
    nadieFiltro: 'Nobody with that name in your conversations.',
    crear: 'CREATE GROUP', creando: 'CREATING…',
    faltaNombre: 'Give the group a name.',
    muchos: 'You are in 200 groups, the maximum. Leave one to create another.',
    noCrea: 'Could not create the group. Check your connection.',

    tituloGrupo: 'Group',
    unMiembro: '1 member', miembrosN: '{n} members',
    admin: 'admin', tu: 'you',
    miembrosTit: 'MEMBERS', verTodos: 'SEE ALL {n}',
    enlaceTit: 'INVITATION LINK',
    enlaceTxt: 'Whoever scans this code or opens the link joins the group. The link IS the permission: share it only with who you want inside.',
    copiar: 'COPY', compartir: 'SHARE', copiado: 'Link copied',
    invito: 'I invite you to the group “{g}” on AURO CHAT.',
    invitarTit: 'INVITE BY EMAIL', correoPh: 'name@example.com', invitar: 'INVITE',
    invitado: 'They are in the group now.',
    noEsta: 'That email is not on AURO CHAT yet, or is already in the group. Send them the link.',
    correoMal: 'That email does not look right.',
    regenerar: 'REGENERATE INVITATION',
    regTit: 'Regenerate the invitation?',
    regTxt: 'The current link and QR stop opening right away, including the ones you already shared or someone screenshotted. A new one is born and only that one gets in.',
    regenerada: 'New invitation. The old one no longer opens.',
    abrirHilo: 'OPEN THE THREAD', salir: 'LEAVE THE GROUP',
    salirTit: 'Leave the group?',
    salirTxt: 'You stop reading and receiving its messages from this moment. To come back, someone will have to send you the link again.',
    salirAdmin: ' Since you created it, the lead passes to the oldest member.',
    saliste: 'You left the group.',
    soloAdmin: 'Only whoever created the group changes its name and photo.',
    guardar: 'SAVE', guardado: 'Saved',
    noEres: 'You are not in this group, or it no longer exists.',
    noCarga: 'Could not load the group. Check your connection.',
    noGuarda: 'Could not save. Try again.',

    tituloInv: 'Invitation',
    invTit: 'You were invited to a group',
    invTxt: 'Whoever has this link gets in: the link is the permission. The group name, its photo and who is inside show up once you join — not before, because you are not in the group yet.',
    unirme: 'JOIN THE GROUP', entrando: 'JOINING…',
    dentro: 'You are in “{g}”',
    invMala: 'That invitation is no longer valid: it was regenerated or the group closed. Ask for a new one.',
    lleno: 'The group is full, or you are already in 200 groups.',
    noEntra: 'Could not join. Check your connection.',

    cancelar: 'CANCEL',
    grande: 'The photo is over 8 MB and the relay won’t take it. Pick a lighter one.',
    noSubio: 'Could not upload the photo. Check your connection.',
    gateTit: 'Groups are for verified people',
    gateTxt: 'You need your approved Genesis ID to join. That way everyone knows there are real people on the other side.',
    gateBtn: 'COMPLETE MY GENESIS ID', mirando: 'Checking your Genesis ID…',
  },
};

// El relevo rechaza lo que pase de 8MB — el mismo número aquí para avisar
// ANTES de gastar datos subiendo algo que va a rebotar.
const TOPE_ARCHIVO = 8_000_000;
// El relevo corta el nombre del grupo a 64: cortarlo aquí evita que la
// persona escriba un nombre y el servidor le devuelva otro.
const TOPE_NOMBRE = 64;
// Solo se muestran las primeras filas: un grupo puede llegar a 500 miembros y
// montarlos todos de golpe traba el desplazamiento por una lista que casi
// nadie recorre entera.
const ASOMO_MIEMBROS = 24;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

const TONOS = [['#F8EFCF', '#C9A961'], ['#9FE3C9', '#2E8F6E'], ['#BFD8F5', '#4A78B0'], ['#F2C4B3', '#B0674A']];
const tono = (c) => TONOS[String(c).split('').reduce((a, x) => a + x.charCodeAt(0), 0) % TONOS.length];

// La foto que se guarda es el id de /subir: la url se arma al pintarla, así
// un cambio de dominio del relevo no deja fotos rotas guardadas.
function Avatar({ nombre, correo, foto, tam = 44 }) {
  if (foto) {
    return <Image source={{ uri: M.urlArchivo(foto) }} resizeMode="cover"
      style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: 'rgba(0,0,0,0.25)' }} />;
  }
  return (
    <LinearGradient colors={tono(correo || nombre)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: tam, height: tam, borderRadius: tam / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#12312b', fontWeight: '800', fontSize: tam * 0.4 }}>
        {String(nombre || correo || '?')[0].toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

export default function GruposAuro({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const toast = useToast();
  const modo = params?.inv ? 'invitacion' : params?.id ? 'ficha' : 'nuevo';
  const yo = (account?.email || '').toLowerCase();

  const [puerta, setPuerta] = useState('mirando');   // mirando | falta | abierta
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);     // crear / entrar: un toque, no diez
  const [pregunta, setPregunta] = useState(null);    // {tit, txt, btn, hacer}
  // crear
  const [nombre, setNombre] = useState('');
  const [foto, setFoto] = useState('');              // id del relevo
  const [busca, setBusca] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [convos, setConvos] = useState(null);
  // ficha
  const [info, setInfo] = useState(null);
  const [nom, setNom] = useState('');
  const [correoInv, setCorreoInv] = useState('');
  const [todos, setTodos] = useState(false);
  const [error, setError] = useState('');

  // ── el candado de Genesis ────────────────────────────────────────────
  // Aquí se entra también desde fuera (un enlace de invitación abre esta
  // pantalla directamente), así que la regla se comprueba en la puerta y no
  // se hereda de la pantalla anterior. Primero lo guardado, que pinta al
  // instante; la red solo confirma.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const local = await genesis.local().catch(() => null);
      if (local?.verificada && vivo) setPuerta('abierta');
      const e = await genesis.estado().catch(() => null);
      if (!vivo) return;
      if (e?.verificada) setPuerta('abierta');
      else if (!local?.verificada) setPuerta('falta');
    })();
    return () => { vivo = false; };
  }, []);

  // Se puede caer aquí sin haber pasado por la lista del chat (invitación en
  // frío, app recién abierta): sin alta no hay llave y todo daría 401.
  useEffect(() => {
    if (puerta === 'abierta' && account?.email) M.alta(account).catch(() => {});
  }, [puerta, account?.email]);

  // ── crear: los candidatos salen de con quién ya hablas ────────────────
  useEffect(() => {
    if (puerta !== 'abierta' || modo !== 'nuevo') return;
    let vivo = true;
    (async () => {
      try { const d = await M.conversaciones(); if (vivo) setConvos(d.conversaciones || []); }
      catch { if (vivo) setConvos([]); }
    })();
    return () => { vivo = false; };
  }, [puerta, modo]);

  const traerFicha = useCallback(async () => {
    if (!params?.id) return;
    try {
      const d = await M.grupoInfo(params.id);
      setInfo(d); setNom(d.nombre); setError('');
    } catch (e) { setError(e.code === 403 ? t.noEres : t.noCarga); }
  }, [params?.id, t.noEres, t.noCarga]);
  useEffect(() => { if (puerta === 'abierta' && modo === 'ficha') traerFicha(); }, [puerta, modo, traerFicha]);

  const soyAdmin = !!info && info.admin === yo;
  const enlace = info?.invitacion ? aUri('chat/grupo', { inv: info.invitacion }) : '';

  // ── la foto: se sube primero y lo que se guarda es su id ─────────────
  // El recorte cuadrado lo hace la persona en el picker: la foto se pinta en
  // un círculo y así elige ella qué se pierde, no nosotros.
  const elegirFoto = async (aplicar) => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: true, aspect: [1, 1],
    }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a?.base64) return;
    if (a.base64.length * 0.75 > TOPE_ARCHIVO) { toast(t.grande, 'error'); return; }
    setSubiendo(true);
    try {
      const { id } = await M.subir(a.fileName || 'foto.jpg', 'imagen', a.mimeType || 'image/jpeg', a.base64);
      await aplicar(id);
    } catch { toast(t.noSubio, 'error'); }
    finally { setSubiendo(false); }
  };

  const copiar = async () => { await Clipboard.setStringAsync(enlace); hap(); toast(t.copiado); };
  const compartir = () => {
    hap();
    Share.share({ message: t.invito.replace('{g}', info?.nombre || '') + '\n' + enlace }).catch(() => {});
  };

  // ── crear ────────────────────────────────────────────────────────────
  const alternar = (correo) => {
    hap();
    setElegidos((x) => (x.includes(correo) ? x.filter((c) => c !== correo) : [...x, correo]));
  };

  const crear = async () => {
    const n = nombre.trim();
    if (!n) { toast(t.faltaNombre, 'error'); return; }
    if (ocupado) return;
    setOcupado(true);
    try {
      const d = await M.grupoCrear(n, foto, elegidos);
      hap();
      // A la ficha y no al hilo: recién creado lo primero que hace falta es el
      // enlace para invitar, y desde ahí el hilo está a un botón. El
      // formulario se saca de la pila (back + go sustituyen la pantalla), que
      // volver atrás a un grupo YA creado solo confunde.
      nav.back();
      nav.go('auro-grupo', { id: d.id });
    } catch (e) {
      toast(e.code === 409 ? t.muchos : t.noCrea, 'error');
      setOcupado(false);
    }
  };

  // ── ficha ────────────────────────────────────────────────────────────
  const guardarNombre = async () => {
    const n = nom.trim();
    if (!n || n === info.nombre) return;
    try {
      await M.grupoEditar(params.id, { nombre: n });
      setInfo((i) => ({ ...i, nombre: n })); hap(); toast(t.guardado);
    } catch { toast(t.noGuarda, 'error'); }
  };

  const guardarFoto = () => elegirFoto(async (id) => {
    await M.grupoEditar(params.id, { foto: id });
    setInfo((i) => ({ ...i, foto: id })); hap(); toast(t.guardado);
  });

  const invitar = async () => {
    const c = correoInv.trim().toLowerCase();
    if (!CORREO.test(c)) { toast(t.correoMal, 'error'); return; }
    try {
      const d = await M.grupoInvitar(params.id, [c]);
      // El relevo se salta en silencio a quien no tiene ficha o ya está
      // dentro: la cuenta de añadidos es la única forma de saber si de verdad
      // entró alguien, y decirlo evita creer que invitaste a quien no.
      if (d['añadidos'] > 0) { hap(); setCorreoInv(''); toast(t.invitado); traerFicha(); }
      else toast(t.noEsta, 'error');
    } catch { toast(t.noGuarda, 'error'); }
  };

  const regenerar = () => setPregunta({
    tit: t.regTit, txt: t.regTxt, btn: t.regenerar,
    hacer: async () => {
      try {
        // El relevo devuelve la invitación vigente: repintar el QR con ella
        // ahorra una vuelta a /grupo/info y quita el riesgo de enseñar el
        // enlace viejo un segundo más.
        const d = await M.grupoEditar(params.id, { nuevaInvitacion: true });
        setInfo((i) => ({ ...i, invitacion: d.invitacion || i.invitacion }));
        hap(); toast(t.regenerada);
        if (!d.invitacion) traerFicha();
      } catch { toast(t.noGuarda, 'error'); }
    },
  });

  const salir = () => setPregunta({
    tit: t.salirTit, txt: t.salirTxt + (soyAdmin ? t.salirAdmin : ''), btn: t.salir,
    hacer: async () => {
      try { await M.grupoSalir(params.id); hap(); toast(t.saliste); nav.back(); }
      catch { toast(t.noGuarda, 'error'); }
    },
  });

  // ── invitación ───────────────────────────────────────────────────────
  const unirme = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const d = await M.grupoUnirse(params.inv);
      hap(); toast(t.dentro.replace('{g}', d.nombre || ''));
      nav.go('chat', { con: d.id });
    } catch (e) {
      toast(e.code === 404 ? t.invMala : e.code === 409 ? t.lleno : t.noEntra, 'error');
      setOcupado(false);
    }
  };

  // ════ el candado ═════════════════════════════════════════════════════
  if (puerta !== 'abierta') {
    return (
      <View style={st.screen}>
        <Header title={modo === 'invitacion' ? t.tituloInv : t.tituloGrupo} onBack={nav.back} />
        <View style={st.centro}>
          {puerta === 'mirando' ? (
            <><ActivityIndicator color={C.gold} size="large" /><Text style={st.espera}>{t.mirando}</Text></>
          ) : (
            <View style={st.tarjeta}>
              <Text style={st.tarTit}>{t.gateTit}</Text>
              <Text style={st.tarTxt}>{t.gateTxt}</Text>
              <Button3D title={t.gateBtn} onPress={() => nav.go('kyc')} />
            </View>
          )}
        </View>
      </View>
    );
  }

  const dialogo = (
    <Modal visible={!!pregunta} transparent animationType="fade" onRequestClose={() => setPregunta(null)}>
      <View style={st.velo}>
        <View style={st.dialogo}>
          <Text style={st.dlgTit}>{pregunta?.tit}</Text>
          <Text style={st.dlgTxt}>{pregunta?.txt}</Text>
          <View style={st.dlgFila}>
            <Pressable style={st.dlgNo} onPress={() => setPregunta(null)}>
              <Text style={st.dlgNoTxt}>{t.cancelar}</Text>
            </Pressable>
            <Pressable style={st.dlgSi} onPress={() => { const f = pregunta?.hacer; setPregunta(null); f && f(); }}>
              <Text style={st.dlgSiTxt}>{pregunta?.btn}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ════ me invitaron ═══════════════════════════════════════════════════
  // No se puede enseñar el grupo antes de entrar: el relevo solo cuenta de un
  // grupo a quien ya es miembro. Se dice tal cual en vez de inventar un
  // nombre o de meter a la persona sin preguntar para poder pintarlo.
  if (modo === 'invitacion') {
    return (
      <View style={st.screen}>
        <Header title={t.tituloInv} onBack={nav.back} />
        <View style={st.centro}>
          <View style={st.tarjeta}>
            <Text style={st.invIco}>👥</Text>
            <Text style={st.invTit}>{t.invTit}</Text>
            <Text style={st.tarTxt}>{t.invTxt}</Text>
            <Button3D title={ocupado ? t.entrando : t.unirme} onPress={unirme} disabled={ocupado} />
          </View>
        </View>
      </View>
    );
  }

  // ════ crear ══════════════════════════════════════════════════════════
  if (modo === 'nuevo') {
    const q = busca.trim().toLowerCase();
    const gente = (convos || []).filter((c) => !c.esGrupo);
    const filas = gente.filter((c) => !q || String(c.nombre || '').toLowerCase().includes(q) || c.correo.includes(q));
    return (
      // La lista se queda con el alto que sobra del teclado; el campo del
      // nombre viaja en su cabecera y sube con ella.
      <PantallaConTeclado desplaza={false} style={st.screen}>
        <Header title={t.tituloNuevo} sub={t.subNuevo} onBack={nav.back} />
        <FlatList
          data={filas}
          keyExtractor={(c) => c.correo}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListHeaderComponent={(
            <View>
              <Pressable style={st.fotoCentro} onPress={() => elegirFoto(async (id) => { setFoto(id); hap(); })} disabled={subiendo}>
                {subiendo ? <ActivityIndicator color={C.gold} /> : <Avatar nombre={nombre || '?'} correo={yo} foto={foto} tam={96} />}
                <Text style={st.fotoTxt}>{foto ? t.cambiarFoto : t.anadirFoto}</Text>
              </Pressable>
              <TextInput value={nombre} onChangeText={setNombre} placeholder={t.nombrePh}
                placeholderTextColor={C.txt3} style={st.caja} maxLength={TOPE_NOMBRE} />
              <View style={st.filaTit}>
                <Text style={st.seccion}>{t.deTusChats}</Text>
                {elegidos.length > 0 && (
                  <Text style={st.cuenta}>{t.elegidos.replace('{n}', String(elegidos.length))}</Text>
                )}
              </View>
              <TextInput value={busca} onChangeText={setBusca} placeholder={t.buscaMiembros}
                placeholderTextColor={C.txt3} style={st.caja} autoCapitalize="none" />
            </View>
          )}
          ListEmptyComponent={
            convos === null ? <ActivityIndicator color={C.gold} style={{ marginTop: 22 }} />
              : <Text style={st.vacio}>{q ? t.nadieFiltro : t.sinConvos}</Text>
          }
          renderItem={({ item }) => {
            const puesto = elegidos.includes(item.correo);
            return (
              <Pressable style={st.fila} onPress={() => alternar(item.correo)}>
                <Avatar nombre={item.nombre} correo={item.correo} foto={item.foto} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.nom} numberOfLines={1}>{item.nombre}</Text>
                  <Text style={st.mini} numberOfLines={1}>{item.correo}</Text>
                </View>
                <View style={[st.check, puesto && st.checkOn]}>
                  {puesto && <Text style={st.checkTxt}>✓</Text>}
                </View>
              </Pressable>
            );
          }}
        />
        <View style={st.pie}>
          <Button3D title={ocupado ? t.creando : t.crear} onPress={crear} disabled={ocupado || !nombre.trim()} />
        </View>
      </PantallaConTeclado>
    );
  }

  // ════ la ficha del grupo ═════════════════════════════════════════════
  if (error) {
    return (
      <View style={st.screen}>
        <Header title={t.tituloGrupo} onBack={nav.back} />
        <View style={st.centro}><Text style={st.vacio}>{error}</Text></View>
      </View>
    );
  }
  if (!info) {
    return (
      <View style={st.screen}>
        <Header title={t.tituloGrupo} onBack={nav.back} />
        <View style={st.centro}><ActivityIndicator color={C.gold} size="large" /></View>
      </View>
    );
  }

  const miembros = info.miembros || [];
  const cuantos = miembros.length;
  const lista = todos ? miembros : miembros.slice(0, ASOMO_MIEMBROS);
  const cambiado = soyAdmin && !!nom.trim() && nom.trim() !== info.nombre;
  return (
    <PantallaConTeclado desplaza={false} style={st.screen}>
      <Header title={info.nombre} sub={cuantos === 1 ? t.unMiembro : t.miembrosN.replace('{n}', String(cuantos))} onBack={nav.back} />
      <CuerpoDesplazable contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Pressable style={st.fotoCentro} onPress={soyAdmin ? guardarFoto : undefined} disabled={!soyAdmin || subiendo}>
          {subiendo ? <ActivityIndicator color={C.gold} /> : <Avatar nombre={info.nombre} correo={info.id} foto={info.foto} tam={104} />}
          {soyAdmin && <Text style={st.fotoTxt}>{info.foto ? t.cambiarFoto : t.anadirFoto}</Text>}
        </Pressable>

        {soyAdmin ? (
          <>
            <TextInput value={nom} onChangeText={setNom} style={st.caja} maxLength={TOPE_NOMBRE} />
            {cambiado && (
              <Pressable style={st.btnLinea} onPress={guardarNombre}>
                <Text style={st.btnLineaTxt}>{t.guardar}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={st.soloAdmin}>{t.soloAdmin}</Text>
        )}

        {/* el QR de la invitación: lo que de verdad se comparte */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.enlaceTit}</Text>
          <View style={st.qrBlanco}>
            <QRCode value={enlace} size={224} color="#04211d" backgroundColor="#ffffff" ecl="M" />
          </View>
          <Text style={st.enlace} numberOfLines={2}>{enlace}</Text>
          <Text style={st.tarTxt}>{t.enlaceTxt}</Text>
          <View style={st.dosBtn}>
            <Pressable style={[st.btnLinea, st.mitad]} onPress={copiar}><Text style={st.btnLineaTxt}>{t.copiar}</Text></Pressable>
            <Pressable style={[st.btnLinea, st.mitad]} onPress={compartir}><Text style={st.btnLineaTxt}>{t.compartir}</Text></Pressable>
          </View>
          {soyAdmin && (
            <Pressable style={st.btnSoltar} onPress={regenerar}>
              <Text style={st.btnSoltarTxt}>{t.regenerar}</Text>
            </Pressable>
          )}
        </View>

        {/* invitar por correo: solo entra quien ya está en el relevo */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.invitarTit}</Text>
          <View style={st.filaInv}>
            <TextInput value={correoInv} onChangeText={setCorreoInv} placeholder={t.correoPh}
              placeholderTextColor={C.txt3} style={[st.caja, { flex: 1, marginBottom: 0 }]}
              autoCapitalize="none" keyboardType="email-address" onSubmitEditing={invitar} />
            <Pressable style={st.btnLinea} onPress={invitar}><Text style={st.btnLineaTxt}>{t.invitar}</Text></Pressable>
          </View>
        </View>

        <Text style={st.seccion}>{t.miembrosTit}</Text>
        {lista.map((m) => (
          <View key={m.correo} style={st.fila}>
            <Avatar nombre={m.nombre} correo={m.correo} foto={m.foto} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.nom} numberOfLines={1}>
                {m.nombre}{m.correo === yo ? ' · ' + t.tu : ''}
              </Text>
              <Text style={st.mini} numberOfLines={1}>{m.correo}</Text>
            </View>
            {m.correo === info.admin && <Text style={st.etiqueta}>{t.admin}</Text>}
          </View>
        ))}
        {!todos && cuantos > ASOMO_MIEMBROS && (
          <Pressable style={st.btnLinea} onPress={() => setTodos(true)}>
            <Text style={st.btnLineaTxt}>{t.verTodos.replace('{n}', String(cuantos))}</Text>
          </Pressable>
        )}

        <View style={{ height: 18 }} />
        <Button3D title={t.abrirHilo} onPress={() => nav.go('chat', { con: info.id })} />
        <Pressable style={[st.btnSoltar, { marginTop: 14 }]} onPress={salir}>
          <Text style={[st.btnSoltarTxt, { color: C.down }]}>{t.salir}</Text>
        </Pressable>
      </CuerpoDesplazable>
      {dialogo}
    </PantallaConTeclado>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  centro: { flex: 1, justifyContent: 'center', padding: 20 },
  espera: { color: C.txt3, textAlign: 'center', marginTop: 12 },
  tarjeta: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 18, marginBottom: 16 },
  tarTit: { color: C.goldLt, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  tarTxt: { color: C.txt2, fontSize: 13, lineHeight: 19.5, marginBottom: 14 },
  invIco: { fontSize: 40, textAlign: 'center', marginBottom: 10 },
  invTit: { color: C.goldLt, fontSize: 19, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  fotoCentro: { alignItems: 'center', gap: 9, marginTop: 6, marginBottom: 16 },
  fotoTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4 },
  caja: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14.5, marginBottom: 12 },
  filaTit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  seccion: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginBottom: 10 },
  cuenta: { color: C.gold, fontSize: 11, fontWeight: '700', marginBottom: 10 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 18 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.08)' },
  nom: { color: C.txt, fontSize: 15, fontWeight: '600' },
  mini: { color: C.txt3, fontSize: 11, marginTop: 1 },
  etiqueta: { color: C.gold, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.gold, borderColor: 'transparent' },
  checkTxt: { color: '#3A2C08', fontSize: 13, fontWeight: '900' },
  pie: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },
  qrBlanco: { backgroundColor: '#fff', padding: 16, borderRadius: 18, alignSelf: 'center' },
  enlace: { color: C.goldLt, fontSize: 11.5, textAlign: 'center', marginTop: 12, marginBottom: 10 },
  dosBtn: { flexDirection: 'row', gap: 10 },
  mitad: { flex: 1 },
  btnLinea: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnLineaTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  btnSoltar: { alignItems: 'center', paddingVertical: 12, marginTop: 10 },
  btnSoltarTxt: { color: C.txt3, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  filaInv: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  soloAdmin: { color: C.txt3, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  velo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialogo: { backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 20, width: '100%', maxWidth: 380 },
  dlgTit: { color: C.goldLt, fontSize: 17, fontWeight: '700', marginBottom: 9 },
  dlgTxt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 18 },
  dlgFila: { flexDirection: 'row', gap: 10 },
  dlgNo: { flex: 1, borderWidth: 1, borderColor: C.line2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  dlgNoTxt: { color: C.txt2, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  dlgSi: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(201,169,97,0.12)' },
  dlgSiTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3 },
});
