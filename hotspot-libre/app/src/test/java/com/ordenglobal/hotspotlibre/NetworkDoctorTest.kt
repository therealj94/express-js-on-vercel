package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.core.Incident
import com.ordenglobal.hotspotlibre.core.IncidentKind
import com.ordenglobal.hotspotlibre.net.Checks
import com.ordenglobal.hotspotlibre.net.Layer
import com.ordenglobal.hotspotlibre.net.NetworkDoctor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkDoctorTest {

    /**
     * El caso que motivó todo esto: el Wi-Fi aparece conectado, hay internet,
     * y aun así no carga ninguna página. Desde la pantalla es idéntico a un
     * router apagado, y por eso se acaba tocando cosas al azar.
     */
    @Test
    fun `wifi conectado con internet pero sin nombres senala al DNS`() {
        val d = NetworkDoctor.diagnose(
            Checks(wifiConnected = true, gatewayReachable = true, internetByIp = true, dnsResolves = false),
        )
        assertEquals(Layer.DNS, d.layer)
        assertTrue("no propone DNS fijos: ${d.fix}", d.fix.contains("1.1.1.1"))
    }

    @Test
    fun `se detiene en el primer eslabon roto, no en el ultimo`() {
        // Sin router no tiene sentido culpar al DNS, aunque también falle.
        val d = NetworkDoctor.diagnose(
            Checks(wifiConnected = true, gatewayReachable = false, internetByIp = false, dnsResolves = false),
        )
        assertEquals(Layer.PUERTA, d.layer)
    }

    @Test
    fun `router bien pero sin salida acusa al proveedor`() {
        val d = NetworkDoctor.diagnose(
            Checks(wifiConnected = true, gatewayReachable = true, internetByIp = false, dnsResolves = false),
        )
        assertEquals(Layer.INTERNET, d.layer)
        assertTrue("no manda a mirar el módem: ${d.fix}", d.fix.contains("luces"))
    }

    @Test
    fun `sin wifi no culpa a internet`() {
        val d = NetworkDoctor.diagnose(
            Checks(wifiConnected = false, gatewayReachable = false, internetByIp = false, dnsResolves = false),
        )
        assertEquals(Layer.WIFI, d.layer)
        assertTrue("no menciona el DFS: ${d.fix}", d.fix.contains("DFS"))
    }

    @Test
    fun `con todo bien no inventa un problema`() {
        val d = NetworkDoctor.diagnose(
            Checks(wifiConnected = true, gatewayReachable = true, internetByIp = true, dnsResolves = true),
        )
        assertEquals(Layer.OK, d.layer)
    }

    @Test
    fun `traduce frecuencias a canales y marca los de radar`() {
        assertEquals(44, NetworkDoctor.channelFor(5220))
        assertEquals(100, NetworkDoctor.channelFor(5500))
        assertEquals(149, NetworkDoctor.channelFor(5745))
        assertEquals(6, NetworkDoctor.channelFor(2437))

        assertTrue("el 100 es DFS", NetworkDoctor.isDfs(100))
        assertTrue("el 44 no es DFS", !NetworkDoctor.isDfs(44))
        assertTrue("el 149 no es DFS", !NetworkDoctor.isDfs(149))
    }

    /**
     * Lo que hace útil el historial: un corte a secas no explica nada, pero un
     * corte en el que además saltó el canal delata al radar. Si las dos mitades
     * de la comparación fueran el mismo valor, esta explicación no saldría nunca.
     */
    @Test
    fun `un corte con salto de canal DFS se explica solo`() {
        val incidente = Incident(
            at = System.currentTimeMillis(),
            kind = IncidentKind.CAIDA,
            ssid = "ULTRON WIFI-5G",
            bssid = "aa:bb:cc:dd:ee:ff",
            channel = 100,
            rssi = -55,
            previousChannel = 52,
        )
        val texto = incidente.explain()
        assertTrue("no dice que cambió el canal: $texto", texto.contains("cambió de 52 a 100"))
        assertTrue("no señala el radar: $texto", texto.contains("DFS"))
    }

    @Test
    fun `un corte con senal por los suelos se atribuye a cobertura`() {
        val incidente = Incident(
            at = System.currentTimeMillis(),
            kind = IncidentKind.CAIDA,
            ssid = "casa",
            bssid = "",
            channel = 44,
            rssi = -88,
            previousChannel = 44,
        )
        assertTrue("no menciona la cobertura", incidente.explain().contains("cobertura"))
    }

    @Test
    fun `wifi en pie sin internet no se confunde con una caida`() {
        val incidente = Incident(
            at = System.currentTimeMillis(),
            kind = IncidentKind.SIN_INTERNET,
            ssid = "casa",
            bssid = "",
            channel = 44,
            rssi = -55,
            previousChannel = 44,
        )
        val texto = incidente.explain()
        assertTrue("no distingue el caso: $texto", texto.contains("sin internet"))
        assertTrue("no orienta a DNS o proveedor: $texto", texto.contains("DNS"))
    }
}
