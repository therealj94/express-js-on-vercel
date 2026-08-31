package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.net.DialError
import com.ordenglobal.hotspotlibre.net.Outbound
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * El caso que rompía la navegación: un nombre con dos familias donde la
 * primera está anunciada pero no encamina. No rechaza — se queda callada
 * hasta que expira el temporizador. Probándolas en fila, eso son diez
 * segundos de espera antes de cada dominio con doble familia.
 *
 * El conector se inyecta porque un agujero negro de verdad no se puede
 * montar dentro de una prueba: en muchas redes esa IP se rechaza al
 * instante y la prueba pasaría sola, sin demostrar nada.
 */
class HappyEyeballsTest {

    private val blackholeDelayMs = 5_000L

    @Test
    fun `gana la direccion que responde, sin esperar a la callada`() {
        val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        thread(isDaemon = true) {
            while (!server.isClosed) {
                runCatching { server.accept().close() }.getOrNull() ?: break
            }
        }

        val blackhole = InetAddress.getByName("192.0.2.1")
        val good = InetAddress.getByName("127.0.0.1")

        val started = System.nanoTime()
        val result = Outbound.dialAddresses(listOf(blackhole, good), server.localPort) { address, port ->
            if (address == blackhole) {
                Thread.sleep(blackholeDelayMs)
                Outbound.Attempt.Failed(DialError.Timeout)
            } else {
                Outbound.Attempt.Ok(Socket(address, port))
            }
        }
        val seconds = (System.nanoTime() - started) / 1e9

        assertNotNull("no llegó a la dirección que sí responde", result.socket)
        assertTrue(
            "tardó ${"%.1f".format(seconds)} s: sigue esperando a la callada",
            seconds < 2.0,
        )

        result.socket?.close()
        server.close()
    }

    @Test
    fun `si todas fallan devuelve el motivo, no se cuelga`() {
        val started = System.nanoTime()
        val result = Outbound.dialAddresses(
            listOf(InetAddress.getByName("192.0.2.1"), InetAddress.getByName("192.0.2.2")),
            80,
        ) { _, _ -> Outbound.Attempt.Failed(DialError.Refused) }
        val seconds = (System.nanoTime() - started) / 1e9

        assertTrue("devolvió un socket que no debería existir", result.socket == null)
        assertTrue("tardó ${"%.1f".format(seconds)} s en rendirse", seconds < 2.0)
    }
}
