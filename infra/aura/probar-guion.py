#!/usr/bin/env python3
"""Los caminos guiados de AU-RA.

POR QUE ESTAS PRUEBAS EXISTEN

Un guion mal hecho hace daño de tres formas distintas, y las tres se sienten
del lado de la persona:

  1. ATRAPA. Si lo que no encaja con un botón se queda dando vueltas en el
     menú, AU-RA deja de ser una asistente y pasa a ser una central telefónica.
     La regla es dura: lo que no encaja va al motor, siempre.

  2. SE QUEDA MUDA. WhatsApp corta el título de un botón en 20 caracteres y no
     lo recorta: Meta rechaza el MENSAJE ENTERO. Un título de 21 caracteres no
     se ve feo — desaparece la conversación.

  3. SE VUELVE A CAER EN LO DE SIEMPRE. El guion existe en buena parte porque
     un texto escrito por nosotros no puede alucinar. Si alguien mete en un
     nodo una afirmación sobre licencias o sobre invertir, el guion deja de ser
     la parte segura y se convierte en el sitio donde la mentira queda fija y
     aprobada.
"""

import os
import pathlib
import re
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import guion   # noqa: E402
import guardia  # noqa: E402


# ── RECORRER LOS DOS IDIOMAS ────────────────────────────────────────────────
#
# Desde que el guion habla espanol e ingles, cada regla —el tope del boton, el
# largo del texto, que ningun destino apunte al vacio— tiene que valer en LOS
# DOS. Comprobar solo el espanol dejaria el ingles sin vigilar, que es
# exactamente donde nadie va a mirar.

def cada_nodo():
    """(nombre, idioma, texto, botones) de todos los nodos en los dos idiomas."""
    for nombre in guion.NODOS:
        for idioma in guion.IDIOMAS:
            n = guion.nodo(nombre, idioma)
            yield nombre, idioma, n.get('texto') or '', n.get('botones') or []


def todo_el_texto():
    return ' '.join(t for _, _, t, _ in cada_nodo()).lower()


class NoAtrapaANadie(unittest.TestCase):
    """La regla que separa guiar de atrapar."""

    def test_UNA_PREGUNTA_DE_VERDAD_NO_ENCAJA_Y_VA_AL_MOTOR(self):
        for pregunta in [
            '¿cuánto cuesta mandar plata a mi mamá?',
            'no me llegó mi transferencia de ayer',
            '¿qué cocino hoy?',
            'mi mamá no puede entrar a la app',
            'cuántos ORIGEN tengo',
        ]:
            self.assertIsNone(guion.por_texto(pregunta), f'atrapó: «{pregunta}»')

    def test_estando_dentro_de_un_nodo_tampoco_atrapa(self):
        """Estar en el menú no cambia nada: lo que no es un botón, va al motor."""
        self.assertIsNone(
            guion.por_texto('pero cuánto me cobran por eso', desde='billetera'))

    def test_un_boton_TRANSCRITO_a_mano_si_lleva(self):
        """Mucha gente no toca el botón: copia el texto y lo escribe. Con
        teclados grandes y con gente mayor pasa todo el tiempo."""
        self.assertEqual(guion.por_texto('Mandar plata', desde='que-hago'), 'remesas')
        self.assertEqual(guion.por_texto('mandar plata', desde='que-hago'), 'remesas')
        self.assertEqual(guion.por_texto('MANDAR PLATA', desde='que-hago'), 'remesas')

    def test_pero_solo_los_botones_DE_ESE_nodo(self):
        """Escribir «la billetera» desde otro sitio no salta ahí por su
        cuenta: eso sería adivinar, y adivinar es como se pierde a alguien que
        estaba preguntando otra cosa."""
        self.assertIsNone(guion.por_texto('me gusta eso', desde='llaves'))


class LosAtajos(unittest.TestCase):

    def test_un_saludo_abre_las_puertas(self):
        for saludo in ['hola', 'Hola!', 'buenas', 'buenos días', 'qué tal']:
            self.assertEqual(guion.por_texto(saludo), 'inicio', saludo)

    def test_pero_un_saludo_CON_pregunta_detras_no(self):
        """«hola, cuánto cuesta» es una pregunta, no un saludo. Contestarle el
        menú es no haberla leído."""
        self.assertIsNone(guion.por_texto('hola, cuánto cuesta mandar plata'))

    def test_TODO_LO_DE_INVERTIR_VA_A_UNA_PERSONA(self):
        for dicho in ['quiero invertir', 'soy inversionista', 'cómo invierto',
                      'qué rendimiento da', 'quiero ser accionista']:
            self.assertEqual(guion.por_texto(dicho), 'inversion', dicho)


class LosBotonesCabenEnWhatsApp(unittest.TestCase):

    def test_ningun_titulo_pasa_de_veinte_caracteres(self):
        """Meta rechaza el mensaje ENTERO, no recorta el título. Un carácter de
        más deja la conversación muda."""
        for nombre, idioma, _t, botones in cada_nodo():
            for titulo, _ in botones:
                self.assertLessEqual(
                    len(titulo), guion.TOPE_BOTON,
                    f'«{titulo}» en el nodo «{nombre}» tiene {len(titulo)}')

    def test_nunca_mas_de_tres(self):
        for nombre, idioma, _t, botones in cada_nodo():
            self.assertLessEqual(len(botones), 3, f'{nombre}/{idioma}')

    def test_todos_los_botones_llevan_a_un_nodo_QUE_EXISTE(self):
        """Un botón que apunta a la nada deja a la persona tocando sin que pase
        nada — y sin ninguna señal de que algo se rompió."""
        for nombre, idioma, _t, botones in cada_nodo():
            for titulo, destino in botones:
                # Dos familias de botones NO llevan a un nodo: son la
                # RESPUESTA a la pregunta del nodo donde están. Los del idioma
                # fijan el idioma; los del oficio guardan a qué se dedica.
                if guion.idioma_de_toque(destino):
                    continue
                if str(destino).startswith('of:'):
                    continue
                self.assertIn(destino, guion.NODOS,
                              f'«{titulo}» ({nombre}) lleva a «{destino}», que no existe')

    def test_se_puede_llegar_a_todos_los_nodos(self):
        """Un nodo al que no llega ningún botón ni ningún atajo es texto muerto:
        se mantiene, se revisa, y nadie lo lee nunca."""
        alcanzables = {'inicio'}
        for _n, _i, _t, botones in cada_nodo():
            for _, d in botones:
                alcanzables.add(d)
        for _, d in guion.ATAJOS:
            alcanzables.add(d)
        # Los tres primeros pasos no los apunta ningún botón: son el embudo de
        # entrada, y se encadenan solos. `idioma` es la puerta, `nombre` viene
        # de elegir idioma (TRAS_ELEGIR_IDIOMA) y `saludo` viene de contestar
        # el nombre. Exigirles un botón sería pedir que la entrada tenga
        # entrada.
        # Los del embudo de entrada y los del camino del equipo: se
        # encadenan solos desde `atender`, ningún botón los apunta.
        entrada = {'idioma', 'nombre', 'oficio', 'oficio-otro', 'saludo',
                   'equipo-otro', 'equipo-pais', 'equipo-listo'}
        huerfanos = set(guion.NODOS) - alcanzables - entrada
        self.assertEqual(huerfanos, set(), f'no se llega a: {huerfanos}')


class ElGuionNoPuedeDECIRLoQueElGuardiaCORTA(unittest.TestCase):
    """La prueba que cierra el círculo del día.

    El guion existe en buena parte porque un texto escrito por nosotros no
    puede alucinar. Si alguien mete en un nodo una afirmación sobre licencias o
    sobre invertir, el guion deja de ser la parte segura y se convierte en el
    sitio donde la mentira queda fija, escrita y repetida a todo el mundo.
    """

    def test_NINGUN_NODO_DICE_ALGO_QUE_EL_GUARDIA_CORTARIA(self):
        for nombre, idioma, texto, _b in cada_nodo():
            _, motivo = guardia.revisar(texto)
            self.assertIsNone(
                motivo, f'el nodo «{nombre}» dice algo que el guardia corta ({motivo})')

    def test_ni_los_titulos_de_los_botones(self):
        for nombre, idioma, _t, botones in cada_nodo():
            for titulo, _ in botones:
                self.assertIsNone(guardia.revisar(titulo)[1], f'{nombre}: «{titulo}»')

    def test_el_camino_del_inversionista_NO_le_cuenta_la_oportunidad(self):
        """Orden Global no tiene ninguna licencia emitida. Un camino automático
        que le hable de invertir a alguien es exactamente donde ocurre una
        tergiversación de valores."""
        t = ' '.join(guion.nodo('inversion', i)['texto']
                     for i in guion.IDIOMAS).lower()
        self.assertIn('info@ordenglobal.org', t)
        for prohibido in ['rendimiento', 'ganancia', 'rentabilidad', 'oportunidad',
                          'te conviene', 'seguro que', 'garantiza']:
            self.assertNotIn(prohibido, t, f'el camino de inversión dice «{prohibido}»')

    def test_ni_uno_solo_promete_nada_del_dinero_de_nadie(self):
        for nombre, idioma, texto, _b in cada_nodo():
            t = texto.lower()
            for prohibido in ['garantiza', 'sin riesgo', 'seguro que vas a',
                              'te vas a hacer', 'rentabilidad']:
                self.assertNotIn(prohibido, t, f'{nombre}: «{prohibido}»')


class ComoSuena(unittest.TestCase):
    """«Que no se sienta robot» es un requisito, así que se comprueba."""

    def test_ningun_boton_es_una_categoria_de_empresa(self):
        """«Productos», «Servicios», «FAQ» son cómo piensa la empresa, no cómo
        habla la persona."""
        feos = {'productos', 'servicios', 'faq', 'soporte', 'menu', 'opciones',
                'informacion', 'more info', 'salir'}
        for nombre, idioma, _t, botones in cada_nodo():
            for titulo, _ in botones:
                self.assertNotIn(guion._llano(titulo), feos,
                                 f'«{titulo}» en {nombre} suena a central telefónica')

    def test_no_hay_numeros_de_menu(self):
        """«1) Billetera 2) Identidad» es exactamente lo que no se quería."""
        for nombre, idioma, texto, _b in cada_nodo():
            self.assertIsNone(re.match(r'^\s*\d[\).]', texto), f'{nombre}/{idioma}')
            for titulo, _ in _b:
                self.assertIsNone(re.match(r'^\s*\d[\).]?\s', titulo), titulo)

    def test_los_textos_se_leen_de_pie_y_con_una_mano(self):
        """Lo que no entra en pocas líneas no se lee en un teléfono."""
        for nombre, n in guion.NODOS.items():
            self.assertLessEqual(len(n['texto']), 480,
                                 f'el nodo «{nombre}» tiene {len(n["texto"])} caracteres')

    def test_habla_de_vos_como_toda_la_casa(self):
        """Solo el español: el voseo no tiene equivalente en inglés, y exigirlo
        allá sería una regla inventada."""
        junto = ' '.join(t for _n, i, t, _b in cada_nodo() if i == 'es').lower()
        self.assertNotIn(' tú ', junto)
        self.assertNotIn('puedes', junto)
        self.assertIn('podés', junto)


class ElCanalSinBotones(unittest.TestCase):
    """El chat de la casa no tiene botones. Un guion que solo funciona en
    WhatsApp serían dos productos manteniéndose por separado."""

    def test_las_opciones_salen_como_texto(self):
        t = guion.como_texto('que-hago')
        self.assertIn('Mandar plata', t)
        self.assertIn('·', t, 'las opciones tienen que verse como opciones')

    def test_un_nodo_sin_botones_sale_tal_cual(self):
        # `nombre` no tiene botones: espera que la persona escriba.
        self.assertEqual(guion.como_texto('nombre'),
                         guion.nodo('nombre', 'es')['texto'])

    def test_un_nodo_que_no_existe_no_revienta(self):
        self.assertIsNone(guion.como_texto('inventado'))


class ElToque(unittest.TestCase):

    def test_un_boton_conocido_lleva_a_su_nodo(self):
        self.assertEqual(guion.por_toque('billetera'), 'billetera')

    def test_UN_BOTON_DE_OTRA_EPOCA_NO_LLEVA_A_NINGUN_LADO(self):
        """Alguien toca un botón de un menú viejo que quedó en su historial. Si
        eso llevara a la nada y reventara, la conversación se rompe por un
        mensaje de hace un mes."""
        self.assertIsNone(guion.por_toque('un-nodo-que-ya-no-existe'))
        self.assertIsNone(guion.por_toque(None))
        self.assertIsNone(guion.por_toque(''))


class ElAsistenteLoUsaANTESDelMotor(unittest.TestCase):
    """De nada sirve el guion si `atender` lo consulta después de gastar la
    GPU. La mitad del punto era no gastarla."""

    def test_el_guion_se_consulta_antes_de_preguntar_al_motor(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('def atender(rel, sistema, p, de, dicho, mensaje=None):')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        pos_guion = cuerpo.index('guion.por_texto')
        pos_motor = cuerpo.index('preguntar_motor')
        self.assertLess(pos_guion, pos_motor,
                        'se llama al motor antes de mirar el guion')

    def test_y_se_marca_por_donde_va_la_persona(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        self.assertIn("p['nodo'] = destino", fuente,
                      'sin recordar el nodo, escribir el título de un botón no funciona')



class UnaPreguntaSINSignoSigueSiendoUnaPregunta(unittest.TestCase):
    """En WhatsApp casi nadie pone «¿». Si el guion se fía del signo, atrapa a
    todo el mundo — y lo hizo: «cuántos ORIGEN tengo» caía en el nodo de ORIGEN
    en vez de ir a mirar el saldo de esa persona."""

    def test_preguntas_cortas_y_sin_signo_van_al_motor(self):
        for p in ['cuántos ORIGEN tengo', 'qué es AUKA', 'cómo cobro',
                  'cuánto cuesta', 'dónde bajo la app', 'tengo un problema',
                  'necesito ayuda con remesas', 'puedo cobrar con QR']:
            self.assertIsNone(guion.por_texto(p), f'atrapó: «{p}»')

    def test_pero_el_tema_a_secas_si_abre_su_puerta(self):
        """Quien escribe «remesas» está nombrando de qué quiere hablar."""
        self.assertEqual(guion.por_texto('remesas'), 'remesas')
        self.assertEqual(guion.por_texto('mi negocio'), 'negocio')
        self.assertEqual(guion.por_texto('genesis id'), 'genesis')
        self.assertEqual(guion.por_texto('AUKA'), 'monedas')

    def test_una_frase_larga_nunca_es_un_tema(self):
        self.assertIsNone(
            guion.por_texto('quisiera ver lo de las remesas para mi familia'))

class LoQueELGUIONNOPUEDEDECIR(unittest.TestCase):
    """La terminología del expediente de la Junta (14/08/2026), aplicada.

    «La figura es REFERENCIADO, nunca respaldado: terminología no negociable en
    todos los documentos. No existe oro físico extraído ni custodiado en bóveda;
    el oro está en etapa de recurso o potencial minero dentro de concesiones sin
    formalizar.»

    Esto va como prueba y no como comentario porque la presión para escribirlo
    es real y vuelve: «cuando miran que dicen no hay respaldo se asustan». Es
    verdad que asusta — y la salida es contar mejor lo que SÍ es, no afirmar una
    bóveda que la propia Junta dice que no está firmada."""

    TEXTOS = todo_el_texto()

    def test_NO_promete_oro_en_boveda(self):
        for f in ["oro en bóveda", "oro en boveda", "en bóveda", "custodiad",
                  "barras de oro", "lingote"]:
            self.assertNotIn(f, self.TEXTOS, f"promete «{f}»")

    def test_NO_dice_que_ORIGEN_AUKA_o_AGKA_estan_respaldadas(self):
        """ONDK sí puede: es la única excepción del ecosistema y está aprobada
        en dos fichas. Las otras tres, no."""
        for moneda in ["origen", "auka", "agka"]:
            for verbo in ["respaldad", "respaldo en oro", "garantizad"]:
                self.assertFalse(
                    f"{moneda} está {verbo}" in self.TEXTOS
                    or f"{moneda} sí está {verbo}" in self.TEXTOS,
                    f"dice que {moneda.upper()} está {verbo}")

    def test_NO_inventa_certificaciones(self):
        """La NI 43-101 es un estándar de reporte de recursos mineros, NO una
        certificación de barras en bóveda — eso lo hace LBMA. Nombrar cualquiera
        de las dos hoy sería inventar un papel que no existe."""
        for f in ["ni 43-101", "lbma", "certificado internacional",
                  "certificación internacional", "auditoría externa",
                  "auditoria externa"]:
            self.assertNotIn(f, self.TEXTOS, f"nombra «{f}»")

    def test_ONDK_se_nombra_SIN_precio_y_SIN_insinuar_ganancia(self):
        """Es un valor negociable. Se puede decir qué es; no se puede vender.

        Se mira SOLO el nodo donde se lo nombra: buscar estas palabras en todo
        el guion daba falsos —«no es por lo que ganás» abre la conversación y
        habla del sueldo de la persona, no de un token."""
        donde = " ".join(t for _n, _i, t, _b in cada_nodo() if "ONDK" in t).lower()
        self.assertTrue(donde, "ONDK no aparece en ningún nodo")
        for f in ["apreciación", "apreciacion", "recompra", "ganás", "rendimiento",
                  "va a subir", "invertí", "precio de ondk", "vale ", "oportunidad"]:
            self.assertNotIn(f, donde, f"vende ONDK con «{f}»")

    def test_pero_SI_cuenta_lo_que_de_verdad_respalda_a_ONDK(self):
        """Es el mejor argumento que hay y es cierto: no dejarlo sin decir."""
        self.assertIn("ondk", self.TEXTOS, "no nombra ONDK en ningún lado")
        self.assertIn("respaldado", self.TEXTOS)
        for parte in ["minería", "compañías"]:
            self.assertIn(parte, self.TEXTOS, f"no dice que lo respalda {parte}")

    def test_sigue_diciendo_la_parte_incomoda(self):
        """El nodo vende PORQUE no vende. Suavizarlo hasta que desaparezca la
        parte incómoda sería perder lo único que lo hace creíble."""
        es = " ".join(t for _n, i, t, _b in cada_nodo() if i == "es").lower()
        en = " ".join(t for _n, i, t, _b in cada_nodo() if i == "en").lower()
        # Que las de metal no entregan metal, en los dos idiomas.
        self.assertIn("no te lo entregan", es)
        self.assertIn("do not hand you the metal", en)
        # Y que el oro baja, dicho antes de que lo pregunten.
        self.assertIn("sube y baja", es)
        self.assertIn("up and down", en)


class LaPuertaDelIdiomaVAPRIMERO(unittest.TestCase):
    """El fallo del 30-ago a las 18:14, puesto como prueba.

    José escribió «Hola» y AU-RA le contestó el argumento de ORIGEN de una,
    sin preguntarle el idioma ni nada de él. La causa: «hola» es un ATAJO que
    lleva a `inicio`, y los atajos se resolvían antes de mirar si la persona
    ya había elegido idioma. Como casi todo el mundo empieza con «hola», la
    puerta estaba construida y muerta.

    Estas pruebas miran el ORDEN dentro de `atender`, que es donde vivía el
    error: qué se comprueba antes que qué."""

    FUENTE = (AQUI / 'asistente.py').read_text(encoding='utf8')

    def _bloque(self):
        """Desde el marcador hasta donde se resuelve el destino: ahí vivía el
        error, y ahí tiene que seguir mirándose."""
        i = self.FUENTE.index('LA PUERTA DEL IDIOMA VA PRIMERO')
        j = self.FUENTE.index('if not destino and not', i)
        return self.FUENTE[i:j]

    def test_el_idioma_se_comprueba_ANTES_que_los_atajos(self):
        b = self._bloque()
        corte = b.index("if not p.get('idioma')")
        despues = b[corte:]
        self.assertIn('por_texto', despues,
                      'los atajos se resuelven antes que la puerta del idioma')
        self.assertNotIn('por_texto', b[:corte],
                         'hay un por_texto ANTES de la puerta: el bug de las 18:14')

    def test_quien_no_eligio_idioma_va_a_la_puerta_escriba_lo_que_escriba(self):
        b = self._bloque()
        i = b.index("if not p.get('idioma')")
        self.assertIn("p['nodo'], p['saludado'] = 'idioma'", b[i:i + 1400])

    def test_HOLA_sigue_siendo_un_atajo_valido(self):
        """No se arregló quitando el atajo: se arregló poniéndolo después. Un
        «hola» de alguien que YA eligió idioma tiene que seguir funcionando."""
        self.assertEqual(guion.por_texto('hola'), 'inicio')

    def test_tras_elegir_idioma_se_va_al_nombre_no_al_argumento(self):
        self.assertEqual(guion.TRAS_ELEGIR_IDIOMA, 'nombre')
        self.assertEqual(guion.nodo('nombre', 'es')['espera'], 'nombre')


class EsPersonalANTESDeSerInformativo(unittest.TestCase):
    """«necesito sea bien personal, que preguntes más de la persona» — José,
    30-ago, después de probarlo. El arranque tiraba el argumento de ORIGEN en
    el primer mensaje: información a alguien que no dijo ni cómo se llama."""

    def test_el_saludo_PREGUNTA_en_vez_de_explicar(self):
        for idioma in guion.IDIOMAS:
            t = guion.nodo('saludo', idioma, 'Ana')['texto']
            self.assertIn('?', t, f'{idioma}: el saludo no pregunta nada')
            for producto in ['ORIGEN', 'Veta Wallet', 'Genesis ID', 'gramo']:
                self.assertNotIn(producto, t,
                                 f'{idioma}: vende «{producto}» antes de escuchar')

    def test_usa_el_nombre_cuando_lo_sabe(self):
        for idioma in guion.IDIOMAS:
            t = guion.nodo('saludo', idioma, 'Ana')['texto']
            self.assertIn('Ana', t, f'{idioma}: sabe el nombre y no lo usa')

    def test_y_NO_deja_el_hueco_crudo_cuando_no_lo_sabe(self):
        """«Mucho gusto, {nombre}» en pantalla es peor que no saludar."""
        for nodo in guion.NODOS:
            for idioma in guion.IDIOMAS:
                t = guion.nodo(nodo, idioma, '')['texto']
                self.assertNotIn('{nombre}', t, f'{nodo}/{idioma}')
                self.assertNotIn(' ,', t, f'{nodo}/{idioma}: coma huérfana')
                self.assertNotIn('..', t, f'{nodo}/{idioma}')

    def test_sin_nombre_la_frase_sigue_cerrando_bien(self):
        t = guion.nodo('saludo', 'es', '')['texto']
        self.assertIn('Gracias.', t)
        self.assertIn('¿qué te trajo hasta acá?', t)

    def test_las_tres_puertas_son_lo_que_LE_DUELE_no_productos(self):
        """Elegir una ya es contar algo de sí misma."""
        botones = [b[0] for b in guion.nodo('saludo', 'es', '')['botones']]
        self.assertEqual(len(botones), 3)
        for b in botones:
            for producto in ['ORIGEN', 'Veta', 'Genesis', 'AUKA', 'ONDK']:
                self.assertNotIn(producto, b, f'el botón «{b}» es un producto')


class ElEMBUDONOSEREPITE(unittest.TestCase):
    """Nueve veces, 30-ago 18:21:48 → 18:22:55.

    Al arrancar con los perfiles vacíos, AU-RA encontró nueve mensajes de José
    sin atender y, como ninguno traía idioma, contestó la puerta NUEVE VECES en
    sesenta y siete segundos.

    No fue cosa del borrado: pasa igual cuando alguien escribe tres mensajes
    seguidos antes de que conteste. Una pregunta repetida a los cuatro segundos
    no es un bot torpe — es spam, y en WhatsApp se paga con un bloqueo."""

    FUENTE = (AQUI / 'asistente.py').read_text(encoding='utf8')

    def test_si_la_puerta_YA_esta_en_pantalla_no_se_manda_otra_vez(self):
        i = self.FUENTE.index("if not p.get('idioma')")
        bloque = self.FUENTE[i:i + 1500]
        self.assertIn("ya_esta = p.get('nodo') == 'idioma'", bloque)
        # y el return va ANTES de cualquier envío
        corte = bloque.index('if ya_esta:')
        self.assertIn('return', bloque[corte:corte + 60])
        self.assertNotIn('rel.con_botones', bloque[:corte],
                         'manda la puerta antes de comprobar si ya está')

    def test_el_mensaje_se_consume_igual(self):
        """Volver sin mandar nada no puede dejar el mensaje sin atender: si no,
        el tope no avanza y vuelve a entrar en la vuelta siguiente, para
        siempre."""
        i = self.FUENTE.index("ya_esta = p.get('nodo') == 'idioma'")
        bloque = self.FUENTE[i:i + 300]
        self.assertIn("p['visto']", bloque, 'no marca que lo vio')


class LasTresPreguntasDeEntrada(unittest.TestCase):
    """«pregunta eso de qué país, qué se dedica» — José, 30-ago."""

    def test_la_cadena_va_completa_y_en_orden(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('SIGUIENTE = {')
        self.assertIn("'nombre': 'oficio', 'oficio': 'saludo'", fuente[i:i + 90])

    def test_cada_paso_espera_su_dato(self):
        for nodo, dato in [('nombre', 'nombre'), ('oficio', 'oficio'),
                           ('oficio-otro', 'oficio')]:
            for idioma in guion.IDIOMAS:
                self.assertEqual(guion.nodo(nodo, idioma)['espera'], dato,
                                 f'{nodo}/{idioma}')

    def test_el_pais_sirve_para_NOMBRARLE_SU_MONEDA(self):
        """Es toda la razón de preguntarlo: «guardás en lempiras» le habla a
        ella; «la moneda de tu país» es un folleto."""
        t = guion.nodo('ahorro', 'es', 'Ana', 'Honduras')['texto']
        self.assertIn('lempiras', t)
        self.assertNotIn('la moneda de tu país', t)

    def test_un_pais_que_no_conocemos_NO_inventa_una_moneda(self):
        t = guion.nodo('ahorro', 'es', 'Ana', 'Estados Unidos')['texto']
        self.assertIn('la moneda de tu país', t)
        self.assertNotIn('{moneda}', t)

    def test_ni_sin_pais(self):
        for idioma in guion.IDIOMAS:
            for nodo in guion.NODOS:
                t = guion.nodo(nodo, idioma, '', '')['texto']
                self.assertNotIn('{moneda}', t, f'{nodo}/{idioma}')

    def test_el_dolar_NO_esta_en_la_tabla_y_es_a_proposito(self):
        """A quien ahorra en dólares no se le puede decir que su moneda se
        achica todos los años: sería mentira, y además la notaría."""
        for falso in ['estados unidos', 'usa', 'panama', 'ecuador',
                      'el salvador', 'españa']:
            self.assertNotIn(falso, guion.MONEDAS)

    def test_las_monedas_se_escriben_como_las_dice_la_gente(self):
        """Nadie dice «guardo en HNL»."""
        for pais, moneda in guion.MONEDAS.items():
            self.assertTrue(moneda.islower(), f'{pais}: {moneda}')
            self.assertGreater(len(moneda), 4, f'{pais}: parece un código ISO')

    def test_preguntar_el_pais_y_el_oficio_NO_es_un_interrogatorio(self):
        """Cada pregunta va sola y dice para qué sirve. Un nodo que pregunta
        tres cosas a la vez se contesta a medias o no se contesta."""
        for nodo in ('nombre', 'oficio', 'oficio-otro'):
            for idioma in guion.IDIOMAS:
                t = guion.nodo(nodo, idioma, 'Ana')['texto']
                self.assertLessEqual(t.count('?'), 2, f'{nodo}/{idioma}')


class UnaSolaPreguntaYELOTRODEJAESCRIBIR(unittest.TestCase):
    """«junta país y oficio en una sola, usar más opciones o poner otro y
    especificar» — José, 30-ago."""

    def test_el_pais_ya_no_se_pregunta(self):
        """Sale del prefijo del número: preguntarlo gastaba un mensaje del
        embudo para averiguar algo que viene en cada mensaje que manda."""
        self.assertNotIn('pais', guion.NODOS)

    def test_y_se_deduce_bien_de_los_numeros_de_la_region(self):
        for numero, esperado in [('50432136457', 'honduras'),
                                 ('5215512345678', 'mexico'),
                                 ('573001234567', 'colombia'),
                                 ('18091234567', 'republica dominicana')]:
            self.assertEqual(guion.pais_de_numero(numero), esperado, numero)

    def test_el_mas_largo_gana_o_Estados_Unidos_se_come_a_Dominicana(self):
        self.assertEqual(guion.pais_de_numero('18091234567'),
                         'republica dominicana')
        self.assertEqual(guion.pais_de_numero('12125550100'), '')

    def test_un_numero_desconocido_NO_inventa_pais(self):
        for n in ('12125550100', '50712345678', '441234567890', '', 'hola'):
            self.assertEqual(guion.pais_de_numero(n), '', n)

    def test_los_botones_del_oficio_son_RESPUESTAS_no_destinos(self):
        for id_boton, esperado in [('of:negocio', 'tengo un negocio'),
                                   ('of:asalariado', 'trabajo asalariado')]:
            oficio, pide_mas = guion.oficio_de_toque(id_boton)
            self.assertEqual(oficio, esperado)
            self.assertFalse(pide_mas)

    def test_OTRO_no_se_guarda_como_oficio_sino_que_abre_el_turno(self):
        """«Otro» no es un oficio: es alguien pidiendo escribir. Guardarlo
        dejaría a media docena de personas con «otro» de ocupación."""
        oficio, pide_mas = guion.oficio_de_toque('of:otro')
        self.assertIsNone(oficio)
        self.assertTrue(pide_mas)
        self.assertEqual(guion.nodo('oficio-otro', 'es')['espera'], 'oficio')

    def test_la_pregunta_INVITA_a_escribir_ademas_de_la_lista(self):
        """Ninguna lista cubre a todo el mundo, y quien escribe «enfermera»
        nos dice más que cualquier fila nuestra."""
        for idioma, frase in (('es', 'con tus palabras'),
                              ('en', 'in your own words')):
            self.assertIn(frase, guion.nodo('oficio', idioma, 'Ana')['texto'])

    def test_la_lista_da_SIETE_opciones_y_cabe_en_whatsapp(self):
        import whatsapp
        for idioma in guion.IDIOMAS:
            boton, filas = guion.nodo('oficio', idioma)['lista']
            self.assertEqual(len(filas), 7, idioma)
            self.assertLessEqual(len(filas), whatsapp.RelevoWhatsApp.TOPE_FILAS)
            self.assertLessEqual(len(boton), 20, boton)
            for fila in filas:
                self.assertLessEqual(len(fila[1]),
                                     whatsapp.RelevoWhatsApp.TOPE_FILA, fila[1])

    def test_las_opciones_NO_llevan_ejemplos(self):
        """Lo pidió José, y tiene razón: un ejemplo ACOTA en vez de abrir.
        Quien lee «Tengo un negocio / Pulpería, taller, tienda» y tiene una
        barbería duda de si cuenta."""
        for idioma in guion.IDIOMAS:
            for fila in guion.nodo('oficio', idioma)['lista'][1]:
                self.assertEqual(len(fila), 2,
                                 f'«{fila[1]}» lleva ejemplo: {fila[2:]}')


class NADASALEENUNSOLOIDIOMA(unittest.TestCase):
    """«probando en inglés se cruzan palabras en español» — José, 30-ago.

    La causa de fondo no era el guion —que ya estaba traducido— sino que el
    MOTOR pensaba con las fichas en español, y que los mensajes de fuera del
    guion nunca se tradujeron. Quien elegía English jugaba en inglés y de
    golpe leía «Anotado. Tu ORIGEN sale hacia esa billetera», justo en el
    momento del premio: el que decide si se queda."""

    def test_cada_nodo_tiene_los_dos_idiomas(self):
        for nombre, n in guion.NODOS.items():
            for campo in ('texto', 'botones', 'lista'):
                v = n.get(campo)
                if isinstance(v, dict):
                    for idioma in guion.IDIOMAS:
                        self.assertIn(idioma, v, f'{nombre}.{campo}')
                        self.assertTrue(v[idioma], f'{nombre}.{campo}/{idioma}')

    def test_y_el_ingles_NO_es_el_español_copiado(self):
        """Una traducción olvidada se ve como texto idéntico en los dos."""
        for nombre, n in guion.NODOS.items():
            if nombre == 'idioma':
                continue          # la puerta es bilingüe a propósito
            es = guion.nodo(nombre, 'es', 'Ana')['texto']
            en = guion.nodo(nombre, 'en', 'Ana')['texto']
            self.assertNotEqual(es, en, f'{nombre}: el inglés es el español')

    def test_cada_FRASE_suelta_tiene_los_dos(self):
        for clave, t in guion.FRASES.items():
            for idioma in guion.IDIOMAS:
                self.assertIn(idioma, t, f'FRASES[{clave}]')
                self.assertTrue(t[idioma].strip(), f'FRASES[{clave}]/{idioma}')
            self.assertNotEqual(t['es'], t['en'], clave)

    def test_ningun_mensaje_suelto_quedo_escrito_a_mano_en_asistente(self):
        """Un literal en medio del código es un literal que nadie traduce.
        Los que salen a la persona van por `guion.frase`."""
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        sospechosos = re.findall(r"rel\.enviar\(de, *'([^']{25,})", fuente)
        self.assertEqual(sospechosos, [],
                         f'mensajes a mano en vez de guion.frase: {sospechosos}')

    def test_el_motor_recibe_el_saber_EN_SU_IDIOMA(self):
        """Era la causa raíz: `todo_el_saber` leía siempre `f['es']`, así que
        el modelo tenía toda su memoria en español."""
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('def todo_el_saber')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        self.assertIn("f.get(idioma)", cuerpo)
        # y se arma un sistema por idioma
        j = fuente.index("sistema = {")
        self.assertIn("todo_el_saber(saber, 'en')", fuente[j:j + 600])

    def test_las_fichas_de_verdad_tienen_las_dos_versiones(self):
        import json
        d = json.loads((AQUI / '..' / 'cerebro' / 'conocimiento' /
                        'saber.json').read_text(encoding='utf8'))
        sin_ingles = [f['id'] for f in d['fichas']
                      if f.get('publico') and not (f.get('en') or '').strip()]
        self.assertEqual(sin_ingles, [],
                         f'fichas públicas sin inglés: {sin_ingles}')


class UnBotonDeOtraPantallaNOESUNNOMBRE(unittest.TestCase):
    """30-ago 18:41. José tenía en pantalla la pregunta del nombre y también
    una lista anterior. Tocó «Tengo un negocio» de la lista vieja —WhatsApp
    deja tocar botones de mensajes de más arriba— y el título entró como su
    nombre: «Thanks, Tengo»."""

    def test_los_titulos_de_las_opciones_se_reconocen_como_tales(self):
        for t in ['Tengo un negocio', 'Otra cosa', 'Something else',
                  'Cuidar mis ahorros', 'Volver', 'I have a job']:
            self.assertTrue(guion.es_titulo_de_opcion(t), t)

    def test_pero_un_nombre_de_verdad_no(self):
        for t in ['José', 'Melany', 'Ana María', 'Sarah', '']:
            self.assertFalse(guion.es_titulo_de_opcion(t), t)

    def test_se_calcula_del_guion_no_de_una_lista_aparte(self):
        """Una opción nueva queda cubierta sin que nadie la anote dos veces."""
        fuente = (AQUI / 'guion.py').read_text(encoding='utf8')
        i = fuente.index('def es_titulo_de_opcion')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        self.assertIn('NODOS.values()', cuerpo)

    def test_y_el_asistente_ignora_el_toque_en_el_nodo_del_nombre(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index("if espera == 'nombre':")
        self.assertIn('None if toco else _leer_nombre(dicho)',
                      fuente[i:i + 1200])


class VENDEPEROSINPROMETERNADA(unittest.TestCase):
    """«sepamos vendernos desde el saludo… este es el momento para entrar
    antes que Orden Global se expanda mundialmente, ser parte de la familia»
    — José, 30-ago.

    La línea es fina y hay que sostenerla: se vende la PERTENENCIA, jamás el
    rendimiento. «Entrá ahora que va a subir» sería promoción de valores en un
    WhatsApp abierto — lo mismo que ya costó caro con lo de la SEC. «Estamos
    empezando y podés ser de los primeros» es cierto, es atractivo, y no
    promete un centavo."""

    VENTA = ('idioma', 'nombre', 'saludo', 'quien-soy', 'familia', 'comprobar')

    def test_el_arranque_dice_que_AURA_es_de_la_casa(self):
        for idioma in guion.IDIOMAS:
            t = guion.nodo('idioma', idioma)['texto'].lower()
            self.assertTrue('propia' in t or 'own' in t,
                            f'{idioma}: no dice que la IA es nuestra')

    def test_se_presenta_como_modelo_1_y_dice_que_acompaña(self):
        for idioma in guion.IDIOMAS:
            t = guion.nodo('nombre', idioma)['texto'].lower()
            self.assertIn('1', t, f'{idioma}: no dice qué modelo es')
            self.assertTrue('acuerdo de vos' in t or 'remember you' in t,
                            f'{idioma}: no dice que se acuerda de la persona')

    def test_lo_que_la_distingue_es_que_NO_TOCA_EL_DINERO(self):
        """Es lo que más tranquiliza y lo que ninguna AI grande puede decir,
        porque ninguna vive dentro de una billetera."""
        for idioma in guion.IDIOMAS:
            t = guion.nodo('quien-soy', idioma)['texto'].lower()
            self.assertTrue('nunca toco tu dinero' in t or
                            'never touch your money' in t, idioma)

    def test_NINGUNO_de_los_nodos_de_venta_promete_ganancia(self):
        for nodo in self.VENTA:
            for idioma in guion.IDIOMAS:
                t = guion.nodo(nodo, idioma, 'Ana').get('texto', '').lower()
                for prohibido in ['va a subir', 'will go up', 'ganancia',
                                  'rendimiento', 'rentabilidad', 'profit',
                                  'return', 'invertí', 'invest', 'oportunidad',
                                  'oportunity', 'multiplic', 'garantiz',
                                  'guarantee', 'precio', 'price']:
                    self.assertNotIn(prohibido, t, f'{nodo}/{idioma}: «{prohibido}»')

    def test_el_gancho_es_SER_DE_LOS_PRIMEROS_no_ganar_dinero(self):
        for idioma, frase in (('es', 'de los primeros'), ('en', 'the first')):
            t = guion.nodo('saludo', idioma, 'Ana')['texto'].lower()
            self.assertIn(frase, t, idioma)

    def test_y_el_de_pertenencia_no_pone_fecha_a_nada(self):
        """Una fecha es una promesa. «Está empezando» es un hecho."""
        for idioma in guion.IDIOMAS:
            t = guion.nodo('familia', idioma)['texto'].lower()
            self.assertNotIn('2026', t)
            self.assertNotIn('2027', t)
            for f in ['pronto vamos a', 'en unos meses', 'coming soon',
                      'next year', 'el año que viene']:
                self.assertNotIn(f, t, f'{idioma}: pone fecha con «{f}»')

    def test_comprobar_da_las_TRES_fuentes_que_no_controlamos(self):
        for idioma in guion.IDIOMAS:
            t = guion.nodo('comprobar', idioma)['texto']
            for fuente in ['chainlist.org/chain/5550', 'gleif.org',
                           'ordenscan.com']:
                self.assertIn(fuente, t, f'{idioma}: falta {fuente}')

    def test_las_tres_preguntas_que_venden_NO_van_al_motor(self):
        """Iban al motor, que las contestaba distinto cada vez y una acababa
        mandando a la persona a un correo."""
        for dicho, destino in [
                ('quién sos', 'quien-soy'), ('who are you', 'quien-soy'),
                ('sos una IA', 'quien-soy'),
                ('¿esto es estafa?', 'comprobar'),
                ('is this a scam', 'comprobar'),
                ('¿cómo sé que son de verdad?', 'comprobar'),
                ('qué es orden global', 'familia'),
                ('de qué se trata', 'familia')]:
            self.assertEqual(guion.por_texto(dicho), destino, dicho)

    def test_pero_no_atrapan_frases_normales(self):
        """«de verdad» a secas atraparía «de verdad necesito ayuda»."""
        for dicho in ['de verdad necesito ayuda con las remesas',
                      '¿cuánto me cobran?', 'quiero saber de mi saldo',
                      'me estafaron en otro lado, ayudame']:
            self.assertIsNone(guion.por_texto(dicho), f'atrapó: «{dicho}»')

    def test_y_el_guardia_no_corta_ninguno(self):
        for nodo in self.VENTA:
            for idioma in guion.IDIOMAS:
                t = guion.nodo(nodo, idioma, 'Ana')['texto']
                self.assertIsNone(guardia.revisar(t)[1], f'{nodo}/{idioma}')


class HABLARCONELEQUIPO(unittest.TestCase):
    """«poner la opción quiero hablar con el equipo y ahí hacer preguntas
    quién es, qué país y qué ocupa saber para dirigirlo; y puede poner quiero
    invertir y lo diriges a mi whatsapp» — José, 30-ago.

    La mitad del valor de este camino no la ve quien escribe: es el aviso que
    le llega a José ANTES de que la persona le escriba. Sin eso le llega un
    «hola» de un número desconocido y tiene que empezar preguntando lo que la
    persona ya contó — que es exactamente la sensación de ser un número."""

    def test_se_llega_por_boton_y_escribiendo_en_los_dos_idiomas(self):
        for t in ['quiero hablar con el equipo', 'hablar con alguien',
                  'quiero contactar', 'talk to the team', 'talk to a person']:
            self.assertEqual(guion.por_texto(t), 'equipo', t)

    def test_quiero_invertir_lleva_al_camino_de_una_persona(self):
        for t in ['quiero invertir', 'I want to invest', 'can I invest',
                  'soy inversionista', 'investor']:
            self.assertEqual(guion.por_texto(t), 'inversion', t)

    def test_y_ese_camino_da_el_WHATSAPP_de_jose(self):
        """Un «hablá con una persona» que no da un número no es hablar con
        nadie. Y quien pregunta por invertir quiere hablar YA: un correo es
        donde esa persona se pierde."""
        t = guion.nodo('equipo-listo', 'es', 'Ana')['texto']
        self.assertIn('wa.me/50432136457', t)
        self.assertIn('info@ordenglobal.org', t, 'sin salida por correo')

    def test_pregunta_el_MOTIVO_con_seis_opciones(self):
        for idioma in guion.IDIOMAS:
            _boton, filas = guion.nodo('equipo', idioma)['lista']
            self.assertEqual(len(filas), 6, idioma)
            ids = [f[0] for f in filas]
            self.assertIn('eq:invertir', ids, 'falta la opción de invertir')
            self.assertIn('eq:otro', ids, 'no deja escribir')

    def test_NO_vuelve_a_preguntar_lo_que_ya_sabe(self):
        """Nombre y oficio ya vienen del embudo. Preguntar de nuevo lo que la
        persona ya dijo es la forma más rápida de que se sienta un número."""
        for idioma in guion.IDIOMAS:
            t = guion.nodo('equipo', idioma, 'Ana')['texto'].lower()
            for otra_vez in ['cómo te llamás', 'what is your name',
                             'a qué te dedicás', 'what do you do']:
                self.assertNotIn(otra_vez, t, f'{idioma}: repregunta «{otra_vez}»')

    def test_el_pais_solo_se_pregunta_si_el_prefijo_no_lo_dijo(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index("elif espera == 'motivo':")
        self.assertIn("'equipo-pais' if not p.get('pais') else 'equipo-listo'",
                      fuente[i:i + 1400])

    def test_OTRA_COSA_abre_el_texto_libre_y_no_se_guarda(self):
        motivo, pide_mas = guion.motivo_de_toque('eq:otro')
        self.assertIsNone(motivo)
        self.assertTrue(pide_mas)
        self.assertEqual(guion.nodo('equipo-otro', 'es')['espera'], 'motivo')

    def test_cada_motivo_se_lee_como_una_frase_para_jose(self):
        for id_boton in guion.MOTIVOS:
            for idioma in guion.IDIOMAS:
                m, _ = guion.motivo_de_toque(id_boton, idioma)
                self.assertTrue(m and m[0].islower(),
                                f'{id_boton}/{idioma}: no encaja en «Ana {m}»')


class ELAVISOQUELELLEGAAJOSE(unittest.TestCase):
    """Lo que hace útil todo el camino: José sabe quién es antes de que le
    escriba."""

    FICHA = {'nombre': 'Ana', 'pais': 'guatemala', 'oficio': 'tengo un negocio',
             'motivo': 'quiere invertir', 'idioma': 'es'}

    def test_lleva_nombre_numero_pais_oficio_y_motivo(self):
        a = guion.aviso_para_el_equipo(self.FICHA, '50255551234')
        for dato in ['Ana', '50255551234', 'Guatemala', 'tengo un negocio',
                     'quiere invertir']:
            self.assertIn(dato, a, f'al aviso le falta {dato}')

    def test_avisa_si_la_persona_habla_ingles(self):
        """José tiene que saber en qué idioma contestarle antes de escribir."""
        a = guion.aviso_para_el_equipo({**self.FICHA, 'idioma': 'en'}, '1555')
        self.assertIn('inglés', a)
        self.assertNotIn('inglés', guion.aviso_para_el_equipo(self.FICHA, '1555'))

    def test_va_en_espanol_aunque_la_persona_hable_ingles(self):
        """Lo lee José, no la persona."""
        a = guion.aviso_para_el_equipo({**self.FICHA, 'idioma': 'en'}, '1555')
        self.assertIn('quiere hablar con vos', a)

    def test_sin_datos_no_revienta_ni_deja_huecos(self):
        a = guion.aviso_para_el_equipo({}, '50499999999')
        self.assertIn('Alguien', a)
        self.assertNotIn('None', a)
        self.assertNotIn('· ·', a)

    def test_se_manda_ANTES_de_darle_el_whatsapp(self):
        """Si se mandara después y fallara, José recibiría el «hola» sin
        contexto — que es justo lo que este camino vino a evitar."""
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index("elif espera == 'motivo':")
        bloque = fuente[i:i + 1600]
        self.assertLess(bloque.index('_derivar_al_equipo'),
                        bloque.index("_mandar_nodo(destino)"))

    def test_si_el_aviso_falla_la_persona_igual_recibe_el_whatsapp(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('def _derivar_al_equipo')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        self.assertIn('except Exception', cuerpo,
                      'un aviso caído tumbaría la derivación')


class UNSOLOCAMINODESALIDA(unittest.TestCase):
    """Un nodo con LISTA salía sin sus opciones: «¿De qué querés hablar?» y
    ninguna puerta debajo.

    El bloque general de `atender` mandaba botones y, si no había, texto pelado
    — no sabía de listas. `_mandar_nodo` existía justo para esto y ese sitio no
    lo usaba. Se vio simulando la charla entera contra el código desplegado, no
    leyéndolo: es el tipo de fallo que se lee bien y se vive mal."""

    FUENTE = (AQUI / 'asistente.py').read_text(encoding='utf8')

    def test_nadie_manda_un_nodo_a_mano(self):
        """`con_botones` y `como_texto` solo pueden aparecer DENTRO de
        `_mandar_nodo`. Fuera de ahí es un camino que se olvidará del próximo
        formato — como se olvidó de las listas."""
        i = self.FUENTE.index('def _mandar_nodo')
        j = self.FUENTE.index('\n    # Dos preguntas y ya', i)
        dentro = self.FUENTE[i:j]
        fuera = self.FUENTE[:i] + self.FUENTE[j:]
        for camino in ('rel.con_botones(', 'rel.con_lista(', 'guion.como_texto('):
            self.assertIn(camino, dentro, f'{camino} no está en _mandar_nodo')
            self.assertNotIn(camino, fuera,
                             f'{camino} se usa fuera de _mandar_nodo: ese '
                             f'camino se va a olvidar del próximo formato')

    def test_y_mandar_nodo_prueba_la_lista_ANTES_que_los_botones(self):
        """Si un nodo tuviera las dos, la lista gana: es la que cabe más."""
        i = self.FUENTE.index('def _mandar_nodo')
        bloque = self.FUENTE[i:i + 900]
        self.assertLess(bloque.index("n.get('lista')"), bloque.index("n.get('botones')"))

    def test_ningun_nodo_con_lista_se_queda_sin_camino(self):
        """Si un nodo tiene lista, `nodo()` tiene que devolverla — si no, sale
        el texto solo y la persona no ve ninguna opción."""
        con_lista = [n for n, v in guion.NODOS.items() if v.get('lista')]
        self.assertTrue(con_lista, 'ningún nodo usa listas: ¿se perdieron?')
        for nombre in con_lista:
            for idioma in guion.IDIOMAS:
                l = guion.nodo(nombre, idioma)['lista']
                self.assertTrue(l and l[0] and l[1], f'{nombre}/{idioma}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
