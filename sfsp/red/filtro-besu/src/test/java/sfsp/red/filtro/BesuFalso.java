package sfsp.red.filtro;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongPredicate;

import org.apache.tuweni.bytes.Bytes;
import org.apache.tuweni.bytes.Bytes32;
import org.hyperledger.besu.datatypes.Address;
import org.hyperledger.besu.datatypes.CallParameter;
import org.hyperledger.besu.datatypes.Hash;
import org.hyperledger.besu.datatypes.Transaction;
import org.hyperledger.besu.datatypes.Wei;
import org.hyperledger.besu.plugin.ServiceManager;
import org.hyperledger.besu.plugin.data.AddedBlockContext;
import org.hyperledger.besu.plugin.data.BlockHeader;
import org.hyperledger.besu.plugin.data.ProcessableBlockHeader;
import org.hyperledger.besu.plugin.data.TransactionProcessingResult;
import org.hyperledger.besu.plugin.data.TransactionSimulationResult;
import org.hyperledger.besu.plugin.services.BesuEvents;
import org.hyperledger.besu.plugin.services.BlockchainService;
import org.hyperledger.besu.plugin.services.PermissioningService;
import org.hyperledger.besu.plugin.services.PicoCLIOptions;
import org.hyperledger.besu.plugin.services.TransactionSimulationService;

/**
 * Besu de mentira para las pruebas del complemento: una cabeza que se mueve a mano, un
 * simulador con la regla de gas intrínseco de Shanghai (la de la 5550) y un
 * SFSPNetworkPermissions de mentira que siempre admite `target == address(this)`.
 *
 * El simulador reproduce la parte de Besu 26.7.1 que importa aquí:
 * - `simulatePendingBlockHeader()` construye el pendiente desde la cabeza DE ESE MOMENTO;
 * - `simulate(...)` rebaja el gas pedido al `--rpc-gas-cap` si lo hay
 *   (TransactionSimulator.calculateSimulationGasCap) y devuelve INTRINSIC_GAS_EXCEEDS_GAS_LIMIT
 *   si el gas intrínseco del calldata no cabe (MainnetTransactionValidator).
 */
final class BesuFalso {
  static final Address CONTRATO = Address.fromHexString("0x3333333333333333333333333333333333333333");
  static final String CONTRATO_HEX = "0x3333333333333333333333333333333333333333";
  static final Address REMITENTE = Address.fromHexString("0x1111111111111111111111111111111111111111");
  static final Address DESTINO = Address.fromHexString("0x2222222222222222222222222222222222222222");

  final AtomicLong cabeza = new AtomicLong(99);
  /** Respuesta del contrato a una transacción corriente, según el número del bloque pendiente. */
  volatile LongPredicate admite = n -> true;
  /** false: la dirección configurada no tiene código (salida vacía). */
  volatile boolean contratoConCodigo = true;
  /** `--rpc-gas-cap` del nodo; 0 = sin tope. */
  volatile long rpcGasCap = 0;
  volatile boolean conEventos = true;

  final AtomicInteger simulaciones = new AtomicInteger();
  final AtomicInteger autopruebas = new AtomicInteger();
  final List<Long> gasPedido = new CopyOnWriteArrayList<>();

  /** El hilo con este nombre se queda parado dentro de simulate() hasta `soltar`. */
  volatile String hiloFrenado = null;
  final CountDownLatch dentro = new CountDownLatch(1);
  final CountDownLatch soltar = new CountDownLatch(1);

  Object opciones;
  Object proveedor;
  volatile BesuEvents.BlockAddedListener oyente;

  // ------------------------------------------------------------------ utilidades

  @SuppressWarnings("unchecked")
  static <T> T proxy(final Class<T> c, final InvocationHandler h) {
    return (T)
        Proxy.newProxyInstance(
            c.getClassLoader(),
            new Class<?>[] {c},
            (p, m, a) ->
                switch (m.getName()) {
                  case "toString" -> c.getSimpleName() + "@falso";
                  case "hashCode" -> System.identityHashCode(p);
                  case "equals" -> p == a[0];
                  default -> h.invoke(p, m, a);
                });
  }

  static Hash hashDe(final long n) {
    return Hash.wrap(Bytes32.leftPad(Bytes.ofUnsignedLong(n + 1000)));
  }

  static long intrinsecoShanghai(final Bytes datos) {
    long g = 21_000L;
    for (int i = 0; i < datos.size(); i++) g += datos.get(i) == 0 ? 4 : 16;
    return g;
  }

  static Bytes relleno(final int n, final byte b) {
    final byte[] x = new byte[n];
    java.util.Arrays.fill(x, b);
    return Bytes.wrap(x);
  }

  static BlockHeader cabecera(final long n) {
    return proxy(
        BlockHeader.class,
        (p, m, a) ->
            switch (m.getName()) {
              case "getNumber" -> n;
              case "getBlockHash" -> hashDe(n);
              case "getParentHash" -> hashDe(n - 1);
              case "getGasLimit" -> 10_000_000L;
              default -> throw new UnsupportedOperationException(m.getName());
            });
  }

  static ProcessableBlockHeader pendienteSobre(final long cabeza) {
    return proxy(
        ProcessableBlockHeader.class,
        (p, m, a) ->
            switch (m.getName()) {
              case "getNumber" -> cabeza + 1;
              case "getParentHash" -> hashDe(cabeza);
              case "getGasLimit" -> 10_000_000L;
              default -> throw new UnsupportedOperationException(m.getName());
            });
  }

  /** Transacción; `to == null` es una creación de contrato. */
  static Transaction tx(final long id, final Address to, final Bytes payload) {
    final Hash h = Hash.wrap(Bytes32.leftPad(Bytes.ofUnsignedLong(id)));
    return proxy(
        Transaction.class,
        (p, m, a) ->
            switch (m.getName()) {
              case "getHash" -> h;
              case "getCodeDelegationList" -> Optional.empty();
              case "getSender" -> REMITENTE;
              case "getTo" -> Optional.ofNullable(to);
              case "getValue" -> Wei.ZERO;
              case "getGasPrice" -> Optional.of(Wei.ZERO);
              case "getMaxFeePerGas" -> Optional.empty();
              case "getGasLimit" -> 12_000_000L;
              case "getPayload" -> payload;
              default -> throw new UnsupportedOperationException(m.getName());
            });
  }

  static TransactionSimulationResult resultado(
      final boolean exito, final String invalida, final Bytes salida, final long gasAplicado) {
    final Transaction simulada =
        proxy(
            Transaction.class,
            (p, m, a) ->
                switch (m.getName()) {
                  case "getGasLimit" -> gasAplicado;
                  default -> throw new UnsupportedOperationException(m.getName());
                });
    final TransactionProcessingResult r =
        proxy(
            TransactionProcessingResult.class,
            (p, m, a) ->
                switch (m.getName()) {
                  case "isSuccessful" -> exito;
                  case "isInvalid" -> invalida != null;
                  case "isFailed" -> !exito && invalida == null;
                  case "getOutput" -> salida;
                  case "getRevertReason" -> Optional.empty();
                  case "getInvalidReason" -> Optional.ofNullable(invalida);
                  case "getGasRemaining", "getEstimateGasUsedByTransaction" -> 0L;
                  default -> throw new UnsupportedOperationException(m.getName());
                });
    return new TransactionSimulationResult(simulada, r);
  }

  // ------------------------------------------------------------------ servicios

  final BlockchainService cadena =
      proxy(
          BlockchainService.class,
          (p, m, a) ->
              switch (m.getName()) {
                case "getChainHeadHeader" -> cabecera(cabeza.get());
                default -> throw new UnsupportedOperationException(m.getName());
              });

  final TransactionSimulationService simulacion =
      proxy(
          TransactionSimulationService.class,
          (p, m, a) -> {
            switch (m.getName()) {
              case "simulatePendingBlockHeader":
                return pendienteSobre(cabeza.get());
              case "simulate":
                if (a[0] instanceof CallParameter cp && a[2] instanceof ProcessableBlockHeader pend) {
                  return Optional.of(simular(cp, pend));
                }
                throw new UnsupportedOperationException("simulate sin CallParameter");
              default:
                throw new UnsupportedOperationException(m.getName());
            }
          });

  private TransactionSimulationResult simular(final CallParameter cp, final ProcessableBlockHeader pend)
      throws InterruptedException {
    simulaciones.incrementAndGet();
    final long pedido = cp.getGas().orElseThrow();
    gasPedido.add(pedido);
    final long gas = rpcGasCap > 0 && pedido > rpcGasCap ? rpcGasCap : pedido;
    final Bytes datos = cp.getPayload().orElse(Bytes.EMPTY);
    final Bytes destino = datos.slice(4 + 32 + 12, 20);
    final boolean esAutoprueba = destino.equals(CONTRATO.getBytes());
    if (esAutoprueba) autopruebas.incrementAndGet();
    if (hiloFrenado != null && Thread.currentThread().getName().equals(hiloFrenado)) {
      dentro.countDown();
      soltar.await(); // el EVM «tarda»: mientras, la cabeza avanza
    }
    if (intrinsecoShanghai(datos) > gas) {
      return resultado(false, "INTRINSIC_GAS_EXCEEDS_GAS_LIMIT", Bytes.EMPTY, gas);
    }
    if (!contratoConCodigo || !cp.getTo().orElseThrow().getBytes().equals(CONTRATO.getBytes())) {
      return resultado(true, null, Bytes.EMPTY, gas);
    }
    final boolean si = esAutoprueba || admite.test(pend.getNumber());
    return resultado(true, null, si ? FiltroRedPlugin.TRUE_32 : Bytes32.ZERO, gas);
  }

  final BesuEvents eventos =
      proxy(
          BesuEvents.class,
          (p, m, a) ->
              switch (m.getName()) {
                case "addBlockAddedListener" -> {
                  oyente = (BesuEvents.BlockAddedListener) a[0];
                  yield 7L;
                }
                case "removeBlockAddedListener" -> {
                  oyente = null;
                  yield null;
                }
                default -> throw new UnsupportedOperationException(m.getName());
              });

  final ServiceManager servicios =
      proxy(
          ServiceManager.class,
          (p, m, a) -> {
            if (!m.getName().equals("getService")) throw new UnsupportedOperationException(m.getName());
            final Class<?> c = (Class<?>) a[0];
            if (c == PicoCLIOptions.class) {
              return Optional.of(
                  proxy(
                      PicoCLIOptions.class,
                      (p2, m2, a2) -> {
                        opciones = a2[1];
                        return null;
                      }));
            }
            if (c == PermissioningService.class) {
              return Optional.of(
                  proxy(
                      PermissioningService.class,
                      (p2, m2, a2) -> {
                        if (m2.getName().equals("registerTransactionPermissioningProvider")) proveedor = a2[0];
                        return null;
                      }));
            }
            if (c == TransactionSimulationService.class) return Optional.of(simulacion);
            if (c == BlockchainService.class) return Optional.of(cadena);
            if (c == BesuEvents.class) return conEventos ? Optional.of(eventos) : Optional.empty();
            return Optional.empty();
          });

  /** Complemento registrado y configurado (sin arrancar). */
  FiltroRedPlugin plugin(final boolean habilitado, final long activacion, final String contrato) {
    final FiltroRedPlugin f = new FiltroRedPlugin();
    f.register(servicios);
    final FiltroRedPlugin.Opciones o = (FiltroRedPlugin.Opciones) opciones;
    o.habilitado = habilitado;
    o.bloqueActivacion = activacion;
    o.contrato = contrato;
    return f;
  }

  /** Avisa al oyente de que se añadió el bloque `n`. */
  void anadirBloque(final long n) {
    final BesuEvents.BlockAddedListener l = oyente;
    if (l == null) return;
    l.onBlockAdded(
        proxy(
            AddedBlockContext.class,
            (p, m, a) ->
                switch (m.getName()) {
                  case "getBlockHeader" -> cabecera(n);
                  default -> throw new UnsupportedOperationException(m.getName());
                }));
  }
}
