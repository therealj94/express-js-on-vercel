package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.radio.SignalQuality
import org.junit.Assert.assertTrue
import org.junit.Test

class SignalQualityTest {

    /** El caso que las barras esconden: llena de rayitas y navegando fatal. */
    @Test
    fun `senal fuerte pero sucia se lee como celda saturada, no como distancia`() {
        val text = SignalQuality.verdict(rsrp = -80, sinr = 2)
        assertTrue("no menciona la saturación: $text", text.contains("saturada"))
        assertTrue("debería desaconsejar moverse: $text", text.contains("no lo va a arreglar"))
    }

    @Test
    fun `senal debil y limpia manda a moverse`() {
        val text = SignalQuality.verdict(rsrp = -112, sinr = 15)
        assertTrue("no aconseja moverse: $text", text.contains("ayuda moverte"))
    }

    @Test
    fun `con la radio bien, no culpa a la senal`() {
        val text = SignalQuality.verdict(rsrp = -80, sinr = 22)
        assertTrue("sigue culpando a la radio: $text", text.contains("no es la señal"))
    }

    @Test
    fun `sin permiso lo dice en vez de inventarse un diagnostico`() {
        val text = SignalQuality.verdict(rsrp = null, sinr = null)
        assertTrue("no explica el permiso: $text", text.contains("ubicación"))
    }

    @Test
    fun `las etiquetas cubren todo el rango sin huecos`() {
        val valores = listOf(-70, -85, -90, -95, -100, -105, -110, -115, -130)
        val etiquetas = valores.map { SignalQuality.rsrpLabel(it) }
        assertTrue("alguna etiqueta salió vacía", etiquetas.none { it.isBlank() })
        assertTrue("no distingue extremos", etiquetas.first() != etiquetas.last())
    }
}
