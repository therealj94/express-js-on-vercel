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

    private enum class Strength { FUERTE, MEDIA, DEBIL }

    private fun strength(rsrp: Int) = when {
        rsrp >= -95 -> Strength.FUERTE
        rsrp >= -105 -> Strength.MEDIA
        else -> Strength.DEBIL
    }

    /**
     * Qué hacer, en una frase, según lo que digan los dos números.
     *
     * Con tres niveles de potencia y no dos. Tratando como «fuerte» todo lo
     * que no fuera pésimo, un −104 dBm —que la propia ficha llama «regular»—
     * salía descrito como señal fuerte y con el consejo de no moverse. Justo
     * al revés de lo que tocaba.
     */
    fun verdict(rsrp: Int?, sinr: Int?): String {
        if (rsrp == null) {
            return "El teléfono no da los datos de la radio. Concede el permiso " +
                "de ubicación: Android lo exige para leer la información de la celda."
        }

        val dirty = sinr != null && sinr < 5
        val mediocre = sinr != null && sinr < 13

        return when (strength(rsrp)) {
            Strength.DEBIL -> if (dirty) {
                "Señal débil Y sucia: es la peor combinación. Muévete hacia una " +
                    "ventana o a una planta alta y mira si sube la potencia; aquí " +
                    "es donde más se nota cambiar de sitio."
            } else {
                "Señal débil pero limpia: estás lejos de la antena o hay paredes " +
                    "en medio. Aquí SÍ ayuda moverte — ventana, planta alta, lejos " +
                    "del hormigón y del metal."
            }

            Strength.MEDIA -> if (dirty) {
                "Ni la potencia ni la calidad acompañan: con esta calidad, el LTE " +
                    "da unos pocos Mbps aunque el plan sea ilimitado. Prueba a " +
                    "moverte y vigila el mejor punto visto; si no sube, es la celda " +
                    "y solo queda probar a otra hora."
            } else {
                "Potencia justita pero limpia. Moverte puede ganar algo; mira si " +
                    "el mejor punto visto sube respecto al de ahora."
            }

            Strength.FUERTE -> when {
                dirty ->
                    "Llega fuerte pero sucia: eso es celda saturada o interferencia, " +
                        "no distancia. Moverte no lo va a arreglar. Prueba a otra hora: " +
                        "si de madrugada mejora, era saturación y no hay nada que hacer."
                mediocre ->
                    "Buena potencia y calidad aceptable. Da para navegar; si va lento, " +
                        "el techo no está en la radio."
                else ->
                    "La radio está bien. Si aun así va lento, el techo no es la señal: " +
                        "mira la cuota de tu plan o mide con el botón de arriba."
            }
        }
    }

    /** Frase corta para la ficha, con los dos números y su lectura. */
    fun summary(rsrp: Int?, sinr: Int?): String {
        val potencia = rsrp?.let { "$it dBm (${rsrpLabel(it)})" } ?: "sin dato"
        val calidad = sinr?.let { "$it dB (${sinrLabel(it)})" } ?: "sin dato"
        return "Potencia: $potencia\nCalidad: $calidad"
    }
}
