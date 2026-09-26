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
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.tuweni.bytes.Bytes;
import org.apache.tuweni.bytes.Bytes32;
import org.hyperledger.besu.datatypes.AccessListEntry;
import org.hyperledger.besu.datatypes.Address;
import org.hyperledger.besu.datatypes.CallParameter;
import org.hyperledger.besu.datatypes.CodeDelegation;
import org.hyperledger.besu.datatypes.Transaction;
import org.hyperledger.besu.datatypes.VersionedHash;
import org.hyperledger.besu.datatypes.Wei;
import org.hyperledger.besu.evm.tracing.OperationTracer;
import org.hyperledger.besu.plugin.BesuPlugin;
import org.hyperledger.besu.plugin.ServiceManager;
import org.hyperledger.besu.plugin.data.BlockHeader;
import org.hyperledger.besu.plugin.data.ProcessableBlockHeader;
import org.hyperledger.besu.plugin.data.TransactionSimulationResult;
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
  static final long GAS_CONSULTA = 200_000L;
  static final int TOPE_CACHE = 50_000;

  /** Opciones de línea de órdenes: --plugin-sfsp-filtro-… */
  public static class Opciones {
    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-habilitado"},
        description = "Activa el filtro de la red cerrada (SFSP-150). Por omisión: false.",
        arity = "1")
    boolean habilitado = false;

    @CommandLine.Option(
        names = {"--plugin-sfsp-filtro-contrato"},
        description = "Dirección de SFSPNetworkPermissions.")
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

  /** Caché por (cabeza, transacción): el pool pregunta muchas veces por la misma. */
  private volatile Bytes cabezaCache = null;
  private final Map<Bytes, Boolean> cache = new ConcurrentHashMap<>();

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
    contrato = Address.fromHexStringStrict(opciones.contrato);
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
  }

  @Override
  public void stop() {}

  // ------------------------------------------------------------------ la consulta

  boolean isPermitted(final Transaction tx) {
    if (!opciones.habilitado) return true;
    if (simulacion == null || cadena == null || contrato == null) {
      // Cerrado ante la duda: sin servicios no se sabe, y «no se sabe» no es «sí».
      LOG.error("SFSP filtro de red: servicios no disponibles; se rechaza {}", tx.getHash());
      return false;
    }
    final BlockHeader cabeza = cadena.getChainHeadHeader();
    // Bloque que se está validando o produciendo = cabeza + 1.
    final long enCurso = cabeza.getNumber() + 1;
    if (enCurso < opciones.bloqueActivacion || enCurso >= opciones.bloqueFin) return true;
    if (!opciones.admitirDelegacion && tx.getCodeDelegationList().isPresent()) return false;

    final Bytes h = cabeza.getBlockHash().getBytes();
    if (!h.equals(cabezaCache)) {
      cache.clear();
      cabezaCache = h;
    }
    final Boolean previo = cache.get(tx.getHash().getBytes());
    if (previo != null) return previo;
    final boolean r = consultar(tx);
    if (cache.size() < TOPE_CACHE) cache.put(tx.getHash().getBytes(), r);
    return r;
  }

  private boolean consultar(final Transaction tx) {
    try {
      final ProcessableBlockHeader pendiente = simulacion.simulatePendingBlockHeader();
      final Optional<TransactionSimulationResult> res =
          simulacion.simulate(
              llamada(contrato, calldata(tx)),
              Optional.empty(),
              pendiente,
              OperationTracer.NO_TRACING,
              EnumSet.of(TransactionSimulationService.SimulationParameters.ALLOW_EXCEEDING_BALANCE));
      if (res.isEmpty() || !res.get().isSuccessful()) return false;
      final Bytes out = res.get().result().getOutput();
      // Contrato ausente => salida vacía => NO (a diferencia de la opción retirada,
      // que admitía todo si el contrato no existía).
      return out.size() == 32 && out.equals(TRUE_32);
    } catch (final RuntimeException e) {
      LOG.error("SFSP filtro de red: fallo al consultar {}: {}", tx.getHash(), e.toString());
      return false;
    }
  }

  // ------------------------------------------------------------------ codificación

  /** Codificación ABI estándar (sin el relleno extra de la opción retirada). */
  static Bytes calldata(final Transaction tx) {
    final Bytes payload = tx.getPayload();
    final int relleno = (32 - (payload.size() % 32)) % 32;
    return Bytes.concatenate(
        SELECTOR,
        palabra(tx.getSender().getBytes()),
        palabra(tx.getTo().map(a -> ((Address) a).getBytes()).orElse(Bytes.wrap(new byte[20]))),
        uint(tx.getValue().getAsBigInteger()),
        uint(tx.getGasPrice().map(q -> q.getAsBigInteger())
            .orElse(tx.getMaxFeePerGas().map(q -> q.getAsBigInteger()).orElse(BigInteger.ZERO))),
        uint(BigInteger.valueOf(tx.getGasLimit())),
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

  static CallParameter llamada(final Address to, final Bytes data) {
    return new CallParameter() {
      @Override public Optional<BigInteger> getChainId() { return Optional.empty(); }
      @Override public Optional<Address> getSender() { return Optional.empty(); }
      @Override public Optional<Address> getTo() { return Optional.of(to); }
      @Override public OptionalLong getGas() { return OptionalLong.of(GAS_CONSULTA); }
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
