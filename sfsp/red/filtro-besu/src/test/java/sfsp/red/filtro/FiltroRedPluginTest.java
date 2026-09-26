package sfsp.red.filtro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static sfsp.red.filtro.BesuFalso.CONTRATO;
import static sfsp.red.filtro.BesuFalso.CONTRATO_HEX;
import static sfsp.red.filtro.BesuFalso.DESTINO;
import static sfsp.red.filtro.BesuFalso.relleno;
import static sfsp.red.filtro.BesuFalso.tx;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.apache.tuweni.bytes.Bytes;
import org.hyperledger.besu.datatypes.Transaction;
import org.junit.jupiter.api.Test;

/**
 * Pruebas del complemento contra el Besu de mentira. Sólo usan lo que ya existía en la
 * versión 0.1.0 (register, start, isPermitted, calldata, llamada), así que también corren
 * contra ella: las de gas, caché y autoprueba FALLAN allí y pasan con la corrección.
 */
class FiltroRedPluginTest {

  // ------------------------------------------------------------------ gas de la consulta

  /** Tamaños de initcode medidos en los artifacts (B) y el límite de EIP-3860. */
  static final int[] TAMANOS = {0, 666, 9_991, 11_100, 12_040, 14_626, 22_603, 49_152};

  @Test
  void elGasDeLaConsultaCubreElCalldataEnteroConLasReglasDeShanghaiYPrague() {
    for (final int n : TAMANOS) {
      final Bytes datos = FiltroRedPlugin.calldata(tx(1, null, relleno(n, (byte) 0x5a)));
      long ceros = 0;
      for (int i = 0; i < datos.size(); i++) if (datos.get(i) == 0) ceros++;
      final long noCeros = datos.size() - ceros;
      final long shanghai = 21_000 + 16 * noCeros + 4 * ceros;
      final long prague = 21_000 + 40 * noCeros + 10 * ceros; // suelo EIP-7623
      final long gas = FiltroRedPlugin.llamada(CONTRATO, datos).getGas().getAsLong();
      assertTrue(
          gas >= Math.max(shanghai, prague) + 7_740,
          "payload de " + n + " B: gas " + gas + " < intrínseco " + Math.max(shanghai, prague) + " + ejecución");
    }
  }

  @Test
  void unaConsultaPequenaPideLoMismoQueAntesYUnaEnormeQuedaTopada() {
    assertEquals(200_000L, FiltroRedPlugin.llamada(CONTRATO, FiltroRedPlugin.calldata(tx(1, DESTINO, Bytes.EMPTY))).getGas().getAsLong());
    assertEquals(100_000_000L, FiltroRedPlugin.llamada(CONTRATO, relleno(3_000_000, (byte) 1)).getGas().getAsLong());
  }

  @Test
  void unDespliegueGrandeDeUnDesplegadorAutorizadoSeAdmite() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(200);
    final FiltroRedPlugin f = b.plugin(true, 100, CONTRATO_HEX);
    f.start();
    long id = 10;
    for (final int n : TAMANOS) {
      assertTrue(f.isPermitted(tx(id++, null, relleno(n, (byte) 0x60))), "despliegue de " + n + " B rechazado");
    }
    // Y el contrato sigue mandando: si dice que no, es que no, sea cual sea el tamaño.
    b.admite = x -> false;
    assertFalse(f.isPermitted(tx(id++, null, relleno(22_603, (byte) 0x60))));
    assertFalse(f.isPermitted(tx(id++, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
  }

  // ------------------------------------------------------------------ caché y cabeza

  @Test
  void unaRespuestaCalculadaConLaCabezaViejaNoSeSirveParaLaNueva() throws Exception {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(99);
    // Una orden de alta en el bloque 100 admite DESTINO: la respuesta es «sí» cuando se
    // simula sobre el estado posterior al 100, es decir, con el bloque pendiente ≥ 101.
    b.admite = n -> n >= 101;
    final FiltroRedPlugin f = b.plugin(true, 1, CONTRATO_HEX);
    f.start();
    final Transaction t = tx(0xaa, DESTINO, Bytes.EMPTY);

    // 1) Un hilo del pool empieza a consultar T con la cabeza 99 y se queda simulando.
    b.hiloFrenado = "pool";
    final AtomicBoolean resPool = new AtomicBoolean(true);
    final Thread pool = new Thread(() -> resPool.set(f.isPermitted(t)), "pool");
    pool.start();
    assertTrue(b.dentro.await(10, TimeUnit.SECONDS), "el hilo del pool no llegó a simular");
    // 2) Mientras tanto se importa el bloque 100 y otro hilo consulta otra transacción.
    b.cabeza.set(100);
    f.isPermitted(tx(0xbb, DESTINO, Bytes.EMPTY));
    // 3) El hilo del pool termina y guarda su respuesta.
    b.soltar.countDown();
    pool.join(10_000);
    b.hiloFrenado = null;
    assertFalse(resPool.get(), "con la cabeza 99 la respuesta correcta es «no»");

    // 4) Con la cabeza 100 la respuesta tiene que ser la de un nodo sin la carrera: «sí».
    assertTrue(f.isPermitted(t), "la respuesta de la cabeza 99 se sirvió para la cabeza 100");
    for (int i = 0; i < 100; i++) assertTrue(f.isPermitted(t));
  }

  @Test
  void dentroDeLaMismaCabezaLaCacheEvitaRepetirLaSimulacion() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(500);
    final FiltroRedPlugin f = b.plugin(true, 100, CONTRATO_HEX);
    f.start();
    final Transaction t = tx(0xcc, DESTINO, Bytes.EMPTY);
    final int antes = b.simulaciones.get();
    for (int i = 0; i < 50; i++) assertTrue(f.isPermitted(t));
    assertEquals(antes + 1, b.simulaciones.get());
    b.cabeza.set(501); // cabeza nueva: se vuelve a preguntar
    assertTrue(f.isPermitted(t));
    assertEquals(antes + 2, b.simulaciones.get());
  }

  // ------------------------------------------------------------------ fuera de la ventana

  @Test
  void apagadoAdmiteTodoSinSimularNada() {
    final BesuFalso b = new BesuFalso();
    b.contratoConCodigo = false;
    final FiltroRedPlugin f = b.plugin(false, 1, null);
    f.start();
    assertTrue(f.isPermitted(tx(1, null, relleno(30_000, (byte) 1))));
    assertTrue(f.isPermitted(tx(2, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
    assertEquals(0, b.simulaciones.get());
  }

  @Test
  void antesDeLaActivacionYDesdeElFinAdmiteTodoSinSimular() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(99);
    b.admite = n -> false;
    final FiltroRedPlugin f = b.plugin(true, 1_000, CONTRATO_HEX);
    ((FiltroRedPlugin.Opciones) b.opciones).bloqueFin = 2_000;
    f.start();
    final int antes = b.simulaciones.get();
    assertTrue(f.isPermitted(tx(1, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
    b.cabeza.set(998); // pendiente 999: todavía no rige
    assertTrue(f.isPermitted(tx(2, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
    assertEquals(antes, b.simulaciones.get());
    b.cabeza.set(999); // pendiente 1.000: rige
    assertFalse(f.isPermitted(tx(3, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
    b.cabeza.set(1_999); // pendiente 2.000: ya no rige
    assertTrue(f.isPermitted(tx(4, DESTINO, Bytes.fromHexString("0xa9059cbb"))));
  }

  // ------------------------------------------------------------------ autoprueba al arrancar

  @Test
  void conElFiltroVigenteUnaDireccionSinCodigoNoArranca() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(500);
    b.contratoConCodigo = false;
    final FiltroRedPlugin f = b.plugin(true, 100, CONTRATO_HEX);
    final IllegalStateException e = assertThrows(IllegalStateException.class, f::start);
    assertTrue(e.getMessage().contains("AUTOPRUEBA FALLIDA"), e.getMessage());
  }

  @Test
  void conElFiltroVigenteUnaErrataEnLaDireccionNoArranca() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(500);
    // Un dígito cambiado: esa dirección no es la lista (no tiene código).
    final FiltroRedPlugin f = b.plugin(true, 100, "0x3333333333333333333333333333333333333334");
    final IllegalStateException e = assertThrows(IllegalStateException.class, f::start);
    assertTrue(e.getMessage().contains("AUTOPRUEBA FALLIDA"), e.getMessage());
  }

  @Test
  void lejosDeLaActivacionUnaAutopruebaFallidaSoloAvisa() {
    // Un nodo que sincroniza desde el génesis todavía no tiene el contrato.
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(5);
    b.contratoConCodigo = false;
    final FiltroRedPlugin f = b.plugin(true, 1_000_000, CONTRATO_HEX);
    f.start();
    assertTrue(f.isPermitted(tx(1, DESTINO, Bytes.EMPTY)));
  }

  @Test
  void conElContratoBienArrancaDentroYFueraDeLaVentana() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(500);
    b.plugin(true, 100, CONTRATO_HEX).start();
    b.cabeza.set(5);
    b.plugin(true, 1_000_000, CONTRATO_HEX).start();
  }

  @Test
  void unaDireccionConMayusculasQueNoPasaElChecksumEip55NoArranca() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(5);
    // Vector de EIP-55 con la última letra cambiada de caja.
    assertThrows(
        IllegalArgumentException.class,
        b.plugin(true, 1_000_000, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD")::start);
    b.plugin(true, 1_000_000, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed").start();
    b.plugin(true, 1_000_000, "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed").start();
  }
}
