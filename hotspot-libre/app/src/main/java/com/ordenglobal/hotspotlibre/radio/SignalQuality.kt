package com.ordenglobal.hotspotlibre.radio

/**
 * Interpreta los números de la radio.
 *
 * Las barras de la pantalla solo miran la potencia, y por eso engañan: se
 * puede tener cuatro barras y navegar fatal. Hacen falta dos medidas para
 * entender qué pasa:
 *
 * - **RSRP** (dBm): cuánta señal llega. Depende de la distancia y de lo que
 *   haya en medio. Es lo único que mejora moviéndose.
 * - **SINR** (dB): cuán limpia llega. Si hay mucha señal pero sucia, el
 *   problema es la celda saturada o la interferencia, y cambiarte de sitio
 *   no arregla nada.
 *
 * Separar esas dos es la diferencia entre buscar una ventana y dejar de
 * perder el tiempo buscándola.
 */
object SignalQuality {

    fun rsrpLabel(rsrp: Int?): String = when {
        rsrp == null -> "sin dato"
        rsrp >= -85 -> "excelente"
        rsrp >= -95 -> "buena"
        rsrp >= -105 -> "regular"
        rsrp >= -115 -> "débil"
        else -> "casi sin señal"
    }

    fun sinrLabel(sinr: Int?): String = when {
        sinr == null -> "sin dato"
        sinr >= 20 -> "muy limpia"
        sinr >= 13 -> "limpia"
        sinr >= 5 -> "con ruido"
        sinr >= 0 -> "muy sucia"
        else -> "inservible"
    }

    /** Qué hacer, en una frase, según lo que digan los dos números. */
    fun verdict(rsrp: Int?, sinr: Int?): String {
        if (rsrp == null) {
            return "El teléfono no da los datos de la radio. Concede el permiso " +
                "de ubicación: Android lo exige para leer la información de la celda."
        }

        val weak = rsrp < -105
        val dirty = sinr != null && sinr < 5

        return when {
            weak && dirty ->
                "Señal débil Y sucia: estás lejos de la antena y además hay ruido. " +
                    "Muévete hacia una ventana y prueba de nuevo; es el caso donde " +
                    "cambiar de sitio más se nota."
            weak ->
                "Señal débil pero limpia: estás lejos de la antena o hay paredes " +
                    "en medio. Aquí SÍ ayuda moverte — ventana, planta alta, lejos " +
                    "del hormigón y del metal."
            dirty ->
                "Llega fuerte pero sucia: eso es celda saturada o interferencia, " +
                    "no distancia. Moverte no lo va a arreglar. Prueba a otra hora: " +
                    "si de madrugada mejora, era saturación y no hay nada que hacer."
            else ->
                "La radio está bien. Si aun así va lento, el techo no es la señal: " +
                    "mira la cuota de tu plan o mide con el botón de arriba."
        }
    }

    /** Frase corta para la ficha, con los dos números y su lectura. */
    fun summary(rsrp: Int?, sinr: Int?): String {
        val potencia = rsrp?.let { "$it dBm (${rsrpLabel(it)})" } ?: "sin dato"
        val calidad = sinr?.let { "$it dB (${sinrLabel(it)})" } ?: "sin dato"
        return "Potencia: $potencia\nCalidad: $calidad"
    }
}
