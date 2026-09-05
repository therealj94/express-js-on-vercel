package com.ordenglobal.hotspotlibre.net

/** Capa donde se rompió la conexión. El orden es el del recorrido de un paquete. */
enum class Layer { WIFI, PUERTA, INTERNET, DNS, OK }

/** Lo que se pudo comprobar. Separado del veredicto para poder probarlo. */
data class Checks(
    val wifiConnected: Boolean,
    val gatewayReachable: Boolean,
    val internetByIp: Boolean,
    val dnsResolves: Boolean,
)

data class Diagnosis(
    val layer: Layer,
    val title: String,
    val detail: String,
    val fix: String,
)

/**
 * Diagnostica una caída siguiendo el camino que recorre un paquete, y se
 * detiene en el primer eslabón roto.
 *
 * El orden importa: sin él, un fallo de DNS y un router apagado se parecen
 * desde la pantalla —«no carga nada»— y llevan a tocar cosas al azar. Probando
 * puerta de enlace, luego una IP desnuda y solo después un nombre, cada fallo
 * queda atribuido a un único responsable.
 */
object NetworkDoctor {

    fun diagnose(checks: Checks): Diagnosis = when {
        !checks.wifiConnected -> Diagnosis(
            Layer.WIFI,
            "El Wi-Fi está desconectado",
            "El teléfono no está enganchado a ninguna red. No es un problema de " +
                "internet: es del enlace con el router.",
            "Si se cayó solo, mira el historial de abajo: si el canal cambió al " +
                "caerse, tu router huyó de un radar (DFS) y hay que fijarlo en un " +
                "canal 36-48. Si la señal venía bajando, es cobertura.",
        )

        !checks.gatewayReachable -> Diagnosis(
            Layer.PUERTA,
            "El router no responde",
            "Hay Wi-Fi, pero el router no contesta. El problema está entre este " +
                "dispositivo y el router — no en tu proveedor de internet.",
            "Reinicia el router. Si se repite, prueba a acercarte: una señal muy " +
                "débil deja la conexión en pie pero sin poder hablar con el router.",
        )

        !checks.internetByIp -> Diagnosis(
            Layer.INTERNET,
            "El router responde, pero no hay salida a internet",
            "Se llega al router y ahí se acaba el camino. La fibra o el enlace del " +
                "proveedor está caído.",
            "Mira las luces del módem de fibra. Si la de internet está roja o " +
                "apagada, es corte del proveedor y no hay nada que hacer desde aquí.",
        )

        !checks.dnsResolves -> Diagnosis(
            Layer.DNS,
            "Hay internet, pero no resuelve los nombres",
            "Se llega a internet por dirección IP, pero no se pueden traducir los " +
                "nombres de las webs. Es el fallo de DNS: por eso el Wi-Fi aparece " +
                "conectado y aun así no carga ninguna página.",
            "En el router, pon servidores DNS fijos: 1.1.1.1 y 8.8.8.8. Es " +
                "frecuente cuando hay dos routers encadenados y el primero hace de " +
                "intermediario de DNS.",
        )

        else -> Diagnosis(
            Layer.OK,
            "Todo responde",
            "Wi-Fi, router, salida a internet y resolución de nombres funcionan.",
            "Si aun así notaste un corte, fue pasajero. El historial de abajo " +
                "guarda lo que pasó en ese momento.",
        )
    }

    /** Canal Wi-Fi a partir de la frecuencia en MHz. */
    fun channelFor(frequencyMhz: Int): Int = when {
        frequencyMhz in 2412..2484 -> (frequencyMhz - 2407) / 5
        frequencyMhz in 5000..5999 -> (frequencyMhz - 5000) / 5
        frequencyMhz in 5955..7115 -> (frequencyMhz - 5950) / 5
        else -> 0
    }

    /**
     * Canales que comparten frecuencia con radares. En ellos el router está
     * obligado a marcharse sin avisar si detecta uno, y eso tira a todos los
     * dispositivos a la vez.
     */
    fun isDfs(channel: Int): Boolean = channel in 52..144
}
