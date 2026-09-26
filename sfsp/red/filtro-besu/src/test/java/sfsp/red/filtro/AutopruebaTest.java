package sfsp.red.filtro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static sfsp.red.filtro.BesuFalso.CONTRATO_HEX;
import static sfsp.red.filtro.BesuFalso.relleno;
import static sfsp.red.filtro.BesuFalso.tx;

import java.util.Optional;
import java.util.function.BooleanSupplier;

import org.apache.tuweni.bytes.Bytes;
import org.hyperledger.besu.datatypes.Address;
import org.junit.jupiter.api.Test;

/** Autoprueba periódica, checksum EIP-55 y motivos de rechazo (piezas nuevas). */
class AutopruebaTest {

  static void esperar(final BooleanSupplier cond, final String que) throws InterruptedException {
    esperar(null, 0, cond, que);
  }

  /**
   * Espera a que se cumpla `cond`, avisando del bloque `n` una y otra vez (como la cadena,
   * que sigue añadiendo bloques): mientras hay una autoprueba en curso, las nuevas se saltan.
   */
  static void esperar(final BesuFalso b, final long n, final BooleanSupplier cond, final String que)
      throws InterruptedException {
    final long fin = System.currentTimeMillis() + 10_000;
    while (!cond.getAsBoolean()) {
      if (System.currentTimeMillis() > fin) throw new AssertionError("no pasó: " + que);
      if (b != null) b.anadirBloque(n);
      Thread.sleep(10);
    }
  }

  @Test
  void laAutopruebaSeRepiteCadaPeriodoDentroDeLaVentanaYEnLaActivacion() throws Exception {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(50);
    final FiltroRedPlugin f = b.plugin(true, 1_050, CONTRATO_HEX);
    f.start();
    assertEquals(Boolean.TRUE, f.autopruebaOk);
    assertNotNull(b.oyente, "sin oyente de bloques");

    // El contrato «desaparece» (p. ej. la dirección configurada no era la buena).
    b.contratoConCodigo = false;
    final int antes = b.autopruebas.get();
    b.anadirBloque(97); // pendiente 98: no toca
    Thread.sleep(100);
    assertEquals(antes, b.autopruebas.get());
    esperar(b, 99, () -> Boolean.FALSE.equals(f.autopruebaOk), "autoprueba fallida en el bloque 100");

    b.contratoConCodigo = true;
    esperar(b, 199, () -> Boolean.TRUE.equals(f.autopruebaOk), "autoprueba OK de nuevo en el bloque 200");

    // Justo en la activación (1.050, que no es múltiplo del período) también se prueba.
    b.contratoConCodigo = false;
    esperar(b, 1_049, () -> Boolean.FALSE.equals(f.autopruebaOk), "autoprueba en el bloque de activación");

    f.stop();
    assertNull(b.oyente, "stop() no quitó el oyente");
  }

  @Test
  void fueraDeLaVentanaNoSeHaceAutoprueba() throws Exception {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(50);
    final FiltroRedPlugin f = b.plugin(true, 1_000_000, CONTRATO_HEX);
    ((FiltroRedPlugin.Opciones) b.opciones).bloqueFin = 2_000_000;
    f.start();
    final int antes = b.autopruebas.get();
    b.anadirBloque(99); // pendiente 100: muy antes de la ventana
    b.anadirBloque(2_000_099); // pendiente después del fin
    Thread.sleep(200);
    assertEquals(antes, b.autopruebas.get());
    b.anadirBloque(1_000_000 - FiltroRedPlugin.VENTANA_AUTOPRUEBA - 1); // primer bloque de la ventana
    esperar(() -> b.autopruebas.get() == antes + 1, "autoprueba al entrar en la ventana");
    Thread.sleep(100);
    assertEquals(antes + 1, b.autopruebas.get());
  }

  @Test
  void sinBesuEventsArrancaIgual() {
    final BesuFalso b = new BesuFalso();
    b.conEventos = false;
    b.cabeza.set(500);
    final FiltroRedPlugin f = b.plugin(true, 100, CONTRATO_HEX);
    f.start();
    assertTrue(f.isPermitted(tx(1, BesuFalso.DESTINO, Bytes.EMPTY)));
    f.stop();
  }

  @Test
  void checksumEip55() {
    // Vectores de la propia EIP-55.
    for (final String v :
        new String[] {
          "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
          "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
          "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
          "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"
        }) {
      assertEquals(v, FiltroRedPlugin.eip55(Address.fromHexString(v.toLowerCase())));
      assertEquals(Address.fromHexString(v), FiltroRedPlugin.direccion(v));
    }
    FiltroRedPlugin.direccion("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
    FiltroRedPlugin.direccion("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED");
    assertThrows(
        IllegalArgumentException.class,
        () -> FiltroRedPlugin.direccion("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD"));
    assertThrows(
        IllegalArgumentException.class,
        () -> FiltroRedPlugin.direccion("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeA"));
  }

  @Test
  void elMotivoDiceSiElRpcGasCapRebajoElGasDeLaConsulta() {
    final BesuFalso b = new BesuFalso();
    b.cabeza.set(500);
    b.rpcGasCap = 150_000; // un nodo con un --rpc-gas-cap demasiado bajo
    final FiltroRedPlugin f = b.plugin(true, 100, CONTRATO_HEX);
    f.start();
    assertFalse(f.isPermitted(tx(1, null, relleno(22_603, (byte) 0x60))));
    final String m =
        FiltroRedPlugin.motivo(
            Optional.of(BesuFalso.resultado(false, "INTRINSIC_GAS_EXCEEDS_GAS_LIMIT", Bytes.EMPTY, 150_000)),
            1_600_000);
    assertTrue(m.contains("INTRINSIC_GAS_EXCEEDS_GAS_LIMIT") && m.contains("aplicado 150000"), m);
    assertNull(FiltroRedPlugin.motivo(Optional.of(BesuFalso.resultado(true, null, FiltroRedPlugin.TRUE_32, 1)), 1));
    assertTrue(
        FiltroRedPlugin.motivo(Optional.of(BesuFalso.resultado(true, null, Bytes.EMPTY, 1)), 1)
            .contains("no tiene código"));
  }
}
