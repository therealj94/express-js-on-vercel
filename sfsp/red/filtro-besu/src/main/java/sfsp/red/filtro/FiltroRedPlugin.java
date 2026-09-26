/*
 * SFSP-150 · Filtro de la red cerrada para Besu 26.7.x.
 *
 * Besu retiró en 25.6.0 los permisos de cuentas por contrato
 * (--permissions-accounts-contract-*, PR hyperledger/besu#8597). Lo que queda es el
 * punto de extensión `PermissioningService.registerTransactionPermissioningProvider`.
 * Este complemento lo usa para volver a consultar el contrato SFSPNetworkPermissions
 * con la MISMA interfaz que usaba la opción retirada:
 *
 *   transactionAllowed(address sender, address target, uint256 value,
 *                      uint256 gasPrice, uint256 gasLimit, bytes payload) view returns (bool)
 *
 * Dónde actúa (TransactionValidationParams de 26.7.1, `checkOnchainPermissions`):
 *   - pool de transacciones  (transactionPoolParams = true)
 *   - producción de bloques  (miningParams          = true)
 *   - IMPORTACIÓN de bloques (processingBlockParams = true)
 * Por eso tiene que estar en TODOS los nodos (los 7 validadores y los RPC) con la
 * misma configuración: un nodo sin él aceptaría bloques que los demás rechazan.
 *
 * No firma, no envía y no escribe nada: sólo simula una llamada `view` en la cabeza.
 */
package sfsp.red.filtro;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import org.apache.tuweni.bytes.Bytes;
import org.apache.tuweni.bytes.Bytes32;
import org.hyperledger.besu.datatypes.AccessListEntry;
import org.hyperledger.besu.datatypes.Address;
import org.hyperledger.besu.datatypes.CallParameter;
import org.hyperledger.besu.datatypes.CodeDelegation;
import org.hyperledger.besu.datatypes.Hash;
import org.hyperledger.besu.datatypes.Transaction;
import org.hyperledger.besu.datatypes.VersionedHash;
import org.hyperledger.besu.datatypes.Wei;
import org.hyperledger.besu.evm.tracing.OperationTracer;
import org.hyperledger.besu.plugin.BesuPlugin;
import org.hyperledger.besu.plugin.ServiceManager;
import org.hyperledger.besu.plugin.data.AddedBlockContext;
import org.hyperledger.besu.plugin.data.ProcessableBlockHeader;
import org.hyperledger.besu.plugin.data.TransactionSimulationResult;
import org.hyperledger.besu.plugin.services.BesuEvents;
import org.hyperledger.besu.plugin.services.BlockchainService;
import org.hyperledger.besu.plugin.services.PermissioningService;
import org.hyperledger.besu.plugin.services.PicoCLIOptions;
import org.hyperledger.besu.plugin.services.TransactionSimulationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import picocli.CommandLine;

public class FiltroRedPlugin implements BesuPlugin {
  private static final Logger LOG = LoggerFactory.getLogger(FiltroRedPlugin.class);

  /** Selector de transactionAllowed(address,address,uint256,uint256,uint256,bytes). */
  static final Bytes SELECTOR = Bytes.fromHexString("0x936421d5");

  static final Bytes TRUE_32 = Bytes32.leftPad(Bytes.of(1));
  static final Bytes FALSE_32 = Bytes32.ZERO;

  // ------------------------------------------------------------------ gas de la consulta
  //
  // La llamada simulada lleva el payload ENTERO de la transacción dentro de su calldata,
  // y Besu exige que el gas intrínseco de ese calldata quepa en el gas de la llamada
  // (MainnetTransactionValidator: INTRINSIC_GAS_EXCEEDS_GAS_LIMIT). Con el tope fijo de
  // 200.000 de la versión 0.1.0, toda transacción de más de ~11 KB (el despliegue de un
  // SFSPRegulatedAsset, de un SFSPAssetRegistry o de un reemplazo de la propia lista) se
  // rechazaba aunque el contrato dijera que sí. Ahora el gas se calcula por tamaño.
  //
  // Depende SÓLO del calldata (y éste, sólo de la transacción): nada de la configuración
  // local del nodo entra en el cálculo, así que todos los nodos piden el mismo gas.

  /** Gas intrínseco base de cualquier transacción. */
  static final long GAS_BASE = 21_000L;

  /**
   * Cota del coste de cada byte de calldata en todas las reglas que conoce Besu 26.7.1:
   * 64 (suelo de EIP-7976, Amsterdam) ≥ 40 (suelo de EIP-7623, Prague) ≥ 16 (de Istanbul a
   * Shanghai, la regla de la 5550 hoy).
   */
  static final long GAS_POR_BYTE = 64L;

  /** Gas para ejecutar `transactionAllowed` (medido: 2.567 a 7.740). */
  static final long GAS_EJECUCION = 100_000L;

  /** Mínimo: el valor fijo de la versión 0.1.0, el que se ensayó con transacciones pequeñas. */
  static final long GAS_CONSULTA_MIN = 200_000L;

  /**
   * Máximo: el `--rpc-gas-cap` por omisión de Besu 26.7.1 (100.000.000). Besu rebaja el gas
   * pedido a ese tope, así que NINGÚN nodo con el complemento puede tener un
   * `--rpc-gas-cap` más bajo que el gas de la consulta más grande (RED-CERRADA §3 y §9.3).
   */
  static final long GAS_CONSULTA_MAX = 100_000_000L;

  static final int TOPE_CACHE = 50_000;

  // ------------------------------------------------------------------ autoprueba

  /**
   * Desde cuántos bloques ANTES de la activación una autoprueba fallida es un ERROR
   * (unas 55 h a 10 s por bloque: cubre el margen de 48 h del encendido, RED-CERRADA §7).
   * Antes de eso es un WARN: un nodo que sincroniza desde el génesis todavía no tiene el
   * contrato.
   */
  static final long VENTANA_AUTOPRUEBA = 20_000L;

  /** Cada cuántos bloques se repite la autoprueba dentro de la ventana. */
  static final long PERIODO_AUTOPRUEBA = 100L;

  /** Como mucho un WARN de «consulta que no terminó bien» cada tanto (ms). */
  static final long INTERVALO_AVISO_MS = 10_000L;

  /** Opciones de línea de órdenes: --plugin-sfsp-filtro-… */
  public static class Opciones {
    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-habilitado"},
        description = "Activa el filtro de la red cerrada (SFSP-150). Por omisión: false.",
        arity = "1")
    boolean habilitado = false;

    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-contrato"},
        description =
            "Dirección de SFSPNetworkPermissions. Si lleva mayúsculas y minúsculas, tiene que"
                + " ser la forma EIP-55 exacta.")
    String contrato = null;

    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-bloque-activacion"},
        description =
            "Primer bloque en el que el filtro rige. Antes se admite todo (la historia previa"
                + " se sigue importando igual). Tiene que ser EL MISMO en todos los nodos.",
        arity = "1")
    long bloqueActivacion = Long.MAX_VALUE;

    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-bloque-fin"},
        description =
            "Primer bloque en el que el filtro DEJA de regir (reversión programada). Por omisión:"
                + " nunca. Igual que la activación, tiene que ser EL MISMO en todos los nodos.",
        arity = "1")
    long bloqueFin = Long.MAX_VALUE;

    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-admitir-delegacion-7702"},
        description = "Admite transacciones con lista de delegación EIP-7702. Por omisión: false.",
        arity = "1")
    boolean admitirDelegacion = false;
  }

  private final Opciones opciones = new Opciones();
  private Address contrato;
  private ServiceManager contexto;
  private TransactionSimulationService simulacion;
  private BlockchainService cadena;
  private BesuEvents eventos;
  private Long oyente = null;
  private ExecutorService ejecutor;

  /**
   * Caché de respuestas de UNA cabeza. La respuesta de `transactionAllowed` depende sólo
   * del estado del padre del bloque pendiente y de la transacción, así que la clave es
   * (hash del padre, hash de la transacción). Cada hilo guarda su respuesta en la
   * generación del padre con el que SIMULÓ: una respuesta calculada con una cabeza vieja
   * nunca se sirve para otra.
   */
  private static final class Generacion {
    final Bytes padre;
    final Map<Bytes, Boolean> respuestas = new ConcurrentHashMap<>();

    Generacion(final Bytes padre) {
      this.padre = padre;
    }
  }

  private volatile Generacion generacion = new Generacion(Bytes.EMPTY);

  /** Resultado de la última autoprueba: null mientras no se haya hecho ninguna. */
  volatile Boolean autopruebaOk = null;

  private final AtomicBoolean autopruebaEnCurso = new AtomicBoolean(false);
  private final AtomicLong ultimoAviso = new AtomicLong(0);
  private final AtomicLong avisosCallados = new AtomicLong(0);

  @Override
  public void register(final ServiceManager context) {
    this.contexto = context;
    context
        .getService(PicoCLIOptions.class)
        .orElseThrow(() -> new IllegalStateException("sin PicoCLIOptions"))
        .addPicoCLIOptions("sfsp-filtro", opciones);
    // El proveedor se registra AQUÍ (fase register): RunnerBuilder construye el
    // AccountPermissioningController con los proveedores ya registrados.
    context
        .getService(PermissioningService.class)
        .orElseThrow(() -> new IllegalStateException("sin PermissioningService"))
        .registerTransactionPermissioningProvider(this::isPermitted);
  }

  @Override
  public void start() {
    try {
      arrancar();
    } catch (final RuntimeException e) {
      // Besu sólo muestra «Error starting plugin of type …», sin la causa: se deja aquí.
      LOG.error("SFSP filtro de red: NO ARRANCA: {}", e.getMessage());
      throw e;
    }
  }

  private void arrancar() {
    if (!opciones.habilitado) {
      LOG.warn("SFSP filtro de red: DESHABILITADO (--plugin-sfsp-filtro-habilitado=false)");
      return;
    }
    if (opciones.contrato == null) {
      throw new IllegalStateException("SFSP filtro de red: falta --plugin-sfsp-filtro-contrato");
    }
    if (opciones.bloqueActivacion == Long.MAX_VALUE) {
      throw new IllegalStateException(
          "SFSP filtro de red: falta --plugin-sfsp-filtro-bloque-activacion (BLOCKED_DECISION)");
    }
    if (opciones.bloqueFin <= opciones.bloqueActivacion) {
      throw new IllegalStateException("SFSP filtro de red: bloque-fin tiene que ser mayor que bloque-activacion");
    }
    contrato = direccion(opciones.contrato);
    // Servicios de ejecución: Besu los inicializa antes de llamar a start().
    simulacion =
        contexto
            .getService(TransactionSimulationService.class)
            .orElseThrow(() -> new IllegalStateException("sin TransactionSimulationService"));
    cadena =
        contexto
            .getService(BlockchainService.class)
            .orElseThrow(() -> new IllegalStateException("sin BlockchainService"));
    LOG.info(
        "SFSP filtro de red: contrato {} en los bloques [{}, {})",
        contrato,
        opciones.bloqueActivacion,
        opciones.bloqueFin == Long.MAX_VALUE ? "sin fin" : opciones.bloqueFin);

    comprobarAlArrancar();

    eventos = contexto.getService(BesuEvents.class).orElse(null);
    if (eventos == null) {
      LOG.warn("SFSP filtro de red: sin BesuEvents; no habrá autoprueba periódica");
    } else {
      ejecutor =
          Executors.newSingleThreadExecutor(
              r -> {
                final Thread t = new Thread(r, "sfsp-filtro-autoprueba");
                t.setDaemon(true);
                return t;
              });
      oyente = eventos.addBlockAddedListener(this::alAnadirBloque);
    }
  }

  @Override
  public void stop() {
    if (eventos != null && oyente != null) {
      try {
        eventos.removeBlockAddedListener(oyente);
      } catch (final RuntimeException e) {
        LOG.debug("SFSP filtro de red: no se pudo quitar el oyente: {}", e.toString());
      }
    }
    if (ejecutor != null) ejecutor.shutdownNow();
  }

  // ------------------------------------------------------------------ la consulta

  boolean isPermitted(final Transaction tx) {
    if (!opciones.habilitado) return true;
    if (simulacion == null || contrato == null) {
      // Cerrado ante la duda: sin servicios no se sabe, y «no se sabe» no es «sí».
      LOG.error("SFSP filtro de red: servicios no disponibles; se rechaza {}", tx.getHash());
      return false;
    }
    // UNA sola lectura de la cabeza. El bloque pendiente (cabeza + 1) fija a la vez la
    // ventana (su número), el estado que se simula (el de su padre) y la clave de la caché.
    final ProcessableBlockHeader pendiente;
    try {
      pendiente = simulacion.simulatePendingBlockHeader();
    } catch (final RuntimeException e) {
      return sinPendiente(tx, e);
    }
    if (!rige(pendiente.getNumber())) return true;
    if (!opciones.admitirDelegacion && tx.getCodeDelegationList().isPresent()) return false;

    final Bytes padre = pendiente.getParentHash().getBytes();
    Generacion g = generacion;
    if (!g.padre.equals(padre)) {
      g = new Generacion(padre);
      generacion = g;
    }
    final Bytes clave = tx.getHash().getBytes();
    final Boolean previo = g.respuestas.get(clave);
    if (previo != null) return previo;
    final boolean r = consultar(tx, pendiente);
    // Se guarda en `g`, la generación del padre con el que se simuló, aunque entretanto
    // otro hilo haya pasado a otra cabeza.
    if (g.respuestas.size() < TOPE_CACHE) g.respuestas.put(clave, r);
    return r;
  }

  /** ¿Rige el filtro en ese bloque? Ventana [activación, fin). */
  boolean rige(final long bloque) {
    return bloque >= opciones.bloqueActivacion && bloque < opciones.bloqueFin;
  }

  /** Sin bloque pendiente no hay simulación: fuera de la ventana da igual; dentro, no. */
  private boolean sinPendiente(final Transaction tx, final RuntimeException e) {
    boolean rigeAhora = true;
    try {
      if (cadena != null) rigeAhora = rige(cadena.getChainHeadHeader().getNumber() + 1);
    } catch (final RuntimeException otra) {
      // Cerrado ante la duda.
    }
    if (rigeAhora) {
      LOG.error(
          "SFSP filtro de red: sin bloque pendiente para consultar {}: {}; se rechaza",
          tx.getHash(),
          e.toString());
    }
    return !rigeAhora;
  }

  private boolean consultar(final Transaction tx, final ProcessableBlockHeader pendiente) {
    try {
      final Bytes datos = calldata(tx);
      final Optional<TransactionSimulationResult> res = simular(datos, pendiente);
      if (res.isPresent() && res.get().isSuccessful()) {
        final Bytes out = res.get().result().getOutput();
        if (out.size() == 32 && out.equals(TRUE_32)) return true;
        if (out.size() == 32 && out.equals(FALSE_32)) return false; // un «no» normal
      }
      // Todo lo demás también es «no», pero no es normal: se deja rastro. Contrato ausente
      // => salida vacía => NO (a diferencia de la opción retirada, que admitía todo si el
      // contrato no existía).
      avisar(tx, res, gasConsulta(datos.size()));
      return false;
    } catch (final RuntimeException e) {
      LOG.error("SFSP filtro de red: fallo al consultar {}: {}", tx.getHash(), e.toString());
      return false;
    }
  }

  private Optional<TransactionSimulationResult> simular(
      final Bytes datos, final ProcessableBlockHeader pendiente) {
    return simulacion.simulate(
        llamada(contrato, datos),
        Optional.empty(),
        pendiente,
        OperationTracer.NO_TRACING,
        EnumSet.of(TransactionSimulationService.SimulationParameters.ALLOW_EXCEEDING_BALANCE));
  }

  /** WARN con el motivo, como mucho uno cada INTERVALO_AVISO_MS para no llenar el disco. */
  private void avisar(
      final Transaction tx, final Optional<TransactionSimulationResult> res, final long gas) {
    final long ahora = System.currentTimeMillis();
    final long antes = ultimoAviso.get();
    if (ahora - antes < INTERVALO_AVISO_MS || !ultimoAviso.compareAndSet(antes, ahora)) {
      avisosCallados.incrementAndGet();
      return;
    }
    LOG.warn(
        "SFSP filtro de red: la consulta de {} no dio una respuesta normal ({}); se rechaza."
            + " Avisos iguales callados desde el anterior: {}",
        tx.getHash(),
        motivo(res, gas),
        avisosCallados.getAndSet(0));
  }

  /** null si la respuesta es exactamente `true`; si no, por qué no. */
  static String motivo(final Optional<TransactionSimulationResult> res, final long gasPedido) {
    if (res.isEmpty()) return "la simulación no devolvió resultado";
    final TransactionSimulationResult r = res.get();
    if (r.isSuccessful()) {
      final Bytes out = r.result().getOutput();
      if (out.size() == 32 && out.equals(TRUE_32)) return null;
      if (out.size() == 32 && out.equals(FALSE_32)) return "el contrato respondió false";
      if (out.isEmpty()) return "salida vacía: la dirección no tiene código o no es SFSPNetworkPermissions";
      return "respuesta que no es un bool: " + corto(out);
    }
    final StringBuilder m = new StringBuilder();
    if (r.isInvalid()) {
      m.append("simulación inválida: ").append(r.getInvalidReason().orElse("sin motivo"));
    } else {
      m.append("simulación revertida o sin gas");
      r.getRevertReason().ifPresent(b -> m.append(" (").append(corto(b)).append(')'));
    }
    m.append("; gas pedido ").append(gasPedido);
    if (r.transaction() != null && r.transaction().getGasLimit() < gasPedido) {
      m.append(", aplicado ")
          .append(r.transaction().getGasLimit())
          .append(" (¿--rpc-gas-cap por debajo del gas de la consulta?)");
    }
    return m.toString();
  }

  private static String corto(final Bytes b) {
    return b.size() <= 64 ? b.toHexString() : b.slice(0, 64).toHexString() + "…";
  }

  // ------------------------------------------------------------------ autoprueba

  /**
   * Consulta de respuesta conocida: `transactionAllowed(0x0, contrato, 0, 0, 0, "")` tiene
   * que devolver exactamente `true`, porque SFSPNetworkPermissions siempre admite
   * `target == address(this)`. Si la dirección está mal escrita o no tiene código, falla.
   *
   * @return null si sale bien; si no, el motivo.
   */
  String autoprueba() {
    try {
      final Bytes datos = calldataAutoprueba(contrato);
      return motivo(simular(datos, simulacion.simulatePendingBlockHeader()), gasConsulta(datos.size()));
    } catch (final RuntimeException e) {
      return "excepción: " + e;
    }
  }

  static Bytes calldataAutoprueba(final Address contrato) {
    return calldata(
        Bytes.wrap(new byte[20]), contrato.getBytes(), BigInteger.ZERO, BigInteger.ZERO, 0L, Bytes.EMPTY);
  }

  /**
   * Al arrancar. Con el filtro ya vigente, una autoprueba fallida DETIENE el arranque: el
   * nodo rechazaría todas las transacciones y se quedaría parado en el primer bloque que
   * las traiga. Antes de la activación sólo se avisa: un nodo que sincroniza desde el
   * génesis todavía no tiene el contrato.
   */
  private void comprobarAlArrancar() {
    long enCurso;
    try {
      enCurso = cadena.getChainHeadHeader().getNumber() + 1;
    } catch (final RuntimeException e) {
      enCurso = -1;
    }
    final String fallo = autoprueba();
    autopruebaOk = fallo == null;
    if (fallo == null) {
      LOG.info(
          "SFSP filtro de red: autoprueba OK en el bloque {}: transactionAllowed(0x0, {}, …) = true",
          enCurso,
          contrato);
      return;
    }
    if (enCurso >= 0 && rige(enCurso)) {
      throw new IllegalStateException(
          String.format(
              "SFSP filtro de red: AUTOPRUEBA FALLIDA con el filtro vigente (bloque %d, contrato %s): %s."
                  + " Este nodo rechazaría TODAS las transacciones, así que no arranca."
                  + " Revise --plugin-sfsp-filtro-contrato.",
              enCurso, contrato, fallo));
    }
    if (enCurso >= opciones.bloqueActivacion - VENTANA_AUTOPRUEBA) {
      LOG.error(
          "SFSP filtro de red: AUTOPRUEBA FALLIDA en el bloque {} (contrato {}): {}. Desde el bloque {}"
              + " este nodo rechazaría TODAS las transacciones. Revise --plugin-sfsp-filtro-contrato"
              + " (sólo es normal si el nodo aún no sincronizó el bloque del despliegue).",
          enCurso,
          contrato,
          fallo,
          opciones.bloqueActivacion);
    } else {
      LOG.warn(
          "SFSP filtro de red: la autoprueba todavía falla en el bloque {} (contrato {}): {}. Es normal"
              + " si el nodo aún no sincronizó el bloque del despliegue; se repite cada {} bloques"
              + " desde el {}.",
          enCurso,
          contrato,
          fallo,
          PERIODO_AUTOPRUEBA,
          opciones.bloqueActivacion - VENTANA_AUTOPRUEBA);
    }
  }

  /**
   * Oyente de bloques nuevos: dentro de [activación − VENTANA_AUTOPRUEBA, fin), cada
   * PERIODO_AUTOPRUEBA bloques y justo en la activación, programa una autoprueba. Se hace
   * en un hilo propio: el oyente corre en el hilo que añade el bloque y no se le retrasa.
   */
  void alAnadirBloque(final AddedBlockContext ctx) {
    try {
      final long enCurso = ctx.getBlockHeader().getNumber() + 1;
      if (enCurso < opciones.bloqueActivacion - VENTANA_AUTOPRUEBA || enCurso >= opciones.bloqueFin) {
        return;
      }
      if (enCurso % PERIODO_AUTOPRUEBA != 0 && enCurso != opciones.bloqueActivacion) return;
      if (ejecutor == null || !autopruebaEnCurso.compareAndSet(false, true)) return;
      try {
        ejecutor.execute(
            () -> {
              try {
                comprobarPeriodica(enCurso);
              } finally {
                autopruebaEnCurso.set(false);
              }
            });
      } catch (final RejectedExecutionException e) {
        autopruebaEnCurso.set(false);
      }
    } catch (final RuntimeException e) {
      LOG.error("SFSP filtro de red: no se pudo programar la autoprueba: {}", e.toString());
    }
  }

  void comprobarPeriodica(final long enCurso) {
    final String fallo = autoprueba();
    final Boolean antes = autopruebaOk;
    autopruebaOk = fallo == null;
    if (fallo != null) {
      LOG.error(
          "SFSP filtro de red: AUTOPRUEBA FALLIDA en el bloque {} (contrato {}): {}. {}",
          enCurso,
          contrato,
          fallo,
          rige(enCurso)
              ? "Este nodo está rechazando TODAS las transacciones."
              : "Desde el bloque " + opciones.bloqueActivacion
                  + " este nodo rechazaría TODAS las transacciones. Revise --plugin-sfsp-filtro-contrato.");
    } else if (!Boolean.TRUE.equals(antes)) {
      LOG.info("SFSP filtro de red: autoprueba OK en el bloque {}", enCurso);
    }
  }

  // ------------------------------------------------------------------ dirección

  /**
   * Dirección del contrato. Si viene con mayúsculas y minúsculas mezcladas, tiene que ser
   * la forma EIP-55 exacta: así una errata en una dirección copiada con checksum se detecta
   * al arrancar. Toda en minúsculas (o toda en mayúsculas) no lleva checksum; para esas
   * está la autoprueba.
   */
  static Address direccion(final String texto) {
    final Address a = Address.fromHexStringStrict(texto);
    final String hex = texto.startsWith("0x") || texto.startsWith("0X") ? texto.substring(2) : texto;
    final boolean conMayusculas = !hex.equals(hex.toLowerCase(Locale.ROOT));
    final boolean conMinusculas = !hex.equals(hex.toUpperCase(Locale.ROOT));
    if (conMayusculas && conMinusculas && !("0x" + hex).equals(eip55(a))) {
      throw new IllegalArgumentException(
          "SFSP filtro de red: --plugin-sfsp-filtro-contrato no pasa el checksum EIP-55 (¿errata?): "
              + texto);
    }
    return a;
  }

  static String eip55(final Address a) {
    final String hex = a.getBytes().toUnprefixedHexString().toLowerCase(Locale.ROOT);
    final Bytes h = Hash.hash(Bytes.wrap(hex.getBytes(StandardCharsets.US_ASCII))).getBytes();
    final StringBuilder sb = new StringBuilder("0x");
    for (int i = 0; i < hex.length(); i++) {
      final char c = hex.charAt(i);
      final int nibble = (h.get(i / 2) >> (i % 2 == 0 ? 4 : 0)) & 0x0f;
      sb.append(Character.isLetter(c) && nibble >= 8 ? Character.toUpperCase(c) : c);
    }
    return sb.toString();
  }

  // ------------------------------------------------------------------ codificación

  /** Codificación ABI estándar (sin el relleno extra de la opción retirada). */
  static Bytes calldata(final Transaction tx) {
    return calldata(
        tx.getSender().getBytes(),
        tx.getTo().map(a -> ((Address) a).getBytes()).orElse(Bytes.wrap(new byte[20])),
        tx.getValue().getAsBigInteger(),
        tx.getGasPrice().map(q -> q.getAsBigInteger())
            .orElse(tx.getMaxFeePerGas().map(q -> q.getAsBigInteger()).orElse(BigInteger.ZERO)),
        tx.getGasLimit(),
        tx.getPayload());
  }

  static Bytes calldata(
      final Bytes remitente,
      final Bytes destino,
      final BigInteger valor,
      final BigInteger precioGas,
      final long limiteGas,
      final Bytes payload) {
    final int relleno = (32 - (payload.size() % 32)) % 32;
    return Bytes.concatenate(
        SELECTOR,
        palabra(remitente),
        palabra(destino),
        uint(valor),
        uint(precioGas),
        uint(BigInteger.valueOf(limiteGas)),
        uint(BigInteger.valueOf(192)),
        uint(BigInteger.valueOf(payload.size())),
        payload,
        Bytes.wrap(new byte[relleno]));
  }

  static Bytes palabra(final Bytes b) {
    return Bytes32.leftPad(b);
  }

  static Bytes uint(final BigInteger v) {
    if (v.signum() < 0 || v.bitLength() > 256) throw new IllegalArgumentException("uint256 fuera de rango");
    return Bytes32.leftPad(Bytes.wrap(v.toByteArray()).trimLeadingZeros());
  }

  /**
   * Gas de la consulta para un calldata de ese tamaño: el intrínseco en el peor caso
   * (GAS_POR_BYTE por byte) más lo que necesita la ejecución, entre GAS_CONSULTA_MIN y
   * GAS_CONSULTA_MAX.
   */
  static long gasConsulta(final int tamCalldata) {
    final long g = GAS_BASE + GAS_POR_BYTE * tamCalldata + GAS_EJECUCION;
    return Math.min(GAS_CONSULTA_MAX, Math.max(GAS_CONSULTA_MIN, g));
  }

  static CallParameter llamada(final Address to, final Bytes data) {
    final long gas = gasConsulta(data.size());
    return new CallParameter() {
      @Override public Optional<BigInteger> getChainId() { return Optional.empty(); }
      @Override public Optional<Address> getSender() { return Optional.empty(); }
      @Override public Optional<Address> getTo() { return Optional.of(to); }
      @Override public OptionalLong getGas() { return OptionalLong.of(gas); }
      @Override public Optional<Wei> getMaxPriorityFeePerGas() { return Optional.empty(); }
      @Override public Optional<Wei> getMaxFeePerGas() { return Optional.empty(); }
      @Override public Optional<Wei> getMaxFeePerBlobGas() { return Optional.empty(); }
      @Override public Optional<Wei> getGasPrice() { return Optional.of(Wei.ZERO); }
      @Override public Optional<Wei> getValue() { return Optional.of(Wei.ZERO); }
      @Override public Optional<List<AccessListEntry>> getAccessList() { return Optional.empty(); }
      @Override public Optional<List<VersionedHash>> getBlobVersionedHashes() { return Optional.empty(); }
      @Override public OptionalLong getNonce() { return OptionalLong.empty(); }
      @Override public Optional<Boolean> getStrict() { return Optional.of(false); }
      @Override public Optional<Bytes> getPayload() { return Optional.of(data); }
      @Override public List<CodeDelegation> getCodeDelegationAuthorizations() { return List.of(); }
    };
  }
}
