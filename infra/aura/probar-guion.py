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
                if guion.idioma_de_toque(destino):
                    continue      # los de la puerta fijan idioma, no van a un nodo
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
        entrada = {'idioma', guion.TRAS_ELEGIR_IDIOMA, 'saludo'}
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
        self.assertEqual(guion.como_texto('persona'),
                         guion.nodo('persona', 'es')['texto'])

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
        self.assertIn("p['nodo'], p['saludado'] = 'idioma'", b[i:i + 260])

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
        self.assertIn('Mucho gusto.', t)
        self.assertIn('¿Qué te trajo hasta acá?', t)

    def test_las_tres_puertas_son_lo_que_LE_DUELE_no_productos(self):
        """Elegir una ya es contar algo de sí misma."""
        botones = [b[0] for b in guion.nodo('saludo', 'es', '')['botones']]
        self.assertEqual(len(botones), 3)
        for b in botones:
            for producto in ['ORIGEN', 'Veta', 'Genesis', 'AUKA', 'ONDK']:
                self.assertNotIn(producto, b, f'el botón «{b}» es un producto')


if __name__ == '__main__':
    unittest.main(verbosity=2)
