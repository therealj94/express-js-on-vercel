// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * VentaOrigen — comprar ORIGEN con USDT desde Polygon o BNB Smart Chain.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE, Y EL QUE NO PUEDE RESOLVER
 *
 * ORIGEN vive en la cadena 5550. El USDT del comprador vive en Polygon o en
 * BNB Smart Chain. Ninguna cadena puede leer a la otra, así que NINGÚN
 * contrato —ni este ni otro— puede cobrar aquí y entregar allá en el mismo
 * acto. Quien prometa eso está describiendo dos sistemas y llamándolos uno.
 *
 * Lo que este contrato hace es la mitad que SÍ se puede hacer bien:
 *
 *   1. Cobra el USDT y lo manda a la tesorería en la MISMA transacción.
 *   2. Deja escrito, en un evento indexado e irrepetible, exactamente cuánto
 *      ORIGEN se compró, a qué precio y A QUÉ DIRECCIÓN de la 5550 hay que
 *      entregarlo.
 *   3. Se niega a vender ORIGEN que la tesorería no tiene.
 *
 * La otra mitad —pagar en la 5550— la hace un vigía fuera de la cadena que
 * lee esos eventos. Ese reparto es deliberado: la parte que maneja el dinero
 * de otra persona es la de aquí, y es la que puede auditarse línea por línea.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS DECISIONES QUE SOSTIENEN LA SEGURIDAD
 *
 * · EL CONTRATO NO CUSTODIA NADA. El USDT entra y sale en la misma llamada,
 *   directo del comprador a la tesorería. No hay saldo acumulado, así que no
 *   hay nada que robar, ni función de rescate que auditar, ni un día malo en
 *   el que alguien descubra que el contrato tenía medio millón parado.
 *
 * · LA TESORERÍA ES INMUTABLE. Se fija al desplegar y no hay quien la cambie:
 *   ni el dueño, ni el operador, ni un gobernante futuro. Si algún día hay
 *   que cambiarla, se despliega otro contrato y se apaga este — que es más
 *   trabajo, y es exactamente el trabajo que se quiere que cueste. Un setter
 *   de tesorería es una llave que redirige TODAS las compras futuras a donde
 *   quiera quien se haga con ella.
 *
 * · EL CUPO ES LO QUE ATA LAS DOS CADENAS. `cupoOrigen` es cuánto ORIGEN puede
 *   vender este contrato, y baja con cada compra. El operador solo lo sube
 *   DESPUÉS de comprobar que la billetera pagadora de la 5550 tiene ese
 *   ORIGEN de verdad. Sin esto, el contrato seguiría cobrando alegremente
 *   USDT por un ORIGEN que ya no existe, y cada venta de más sería una deuda
 *   con alguien que ya pagó.
 *
 * · EL PRECIO CADUCA. ORIGEN sigue al oro y el oro se mueve. Un precio puesto
 *   hace tres días vende barato o caro sin que nadie lo decida. Pasada
 *   `maxAntiguedadPrecio` el contrato deja de vender en vez de seguir con el
 *   último número que le dieron: preferimos una compra que no se puede hacer
 *   a una compra hecha a un precio que ya no es.
 *
 * · EL COMPRADOR PONE UN MÍNIMO. `minOrigen` viaja en la llamada: si entre que
 *   firmó y que se mina el bloque el operador mueve el precio, la compra
 *   revierte en vez de entregarle menos de lo que aceptó. Sin esto, quien
 *   controla el precio controla lo que recibe cada comprador después de que
 *   este ya no puede echarse atrás.
 *
 * · LOS DECIMALES SE LEEN, NO SE SUPONEN. USDT tiene 6 decimales en Polygon y
 *   18 en BNB Smart Chain. Un contrato con el 6 escrito a mano, desplegado en
 *   BSC, cobraría un billón de veces de menos.
 *
 * · TRANSFERFROM A LA ANTIGUA. Varios USDT no devuelven bool. Un
 *   `IERC20.transferFrom` normal revierte contra ellos al decodificar la
 *   respuesta vacía; aquí se llama a bajo nivel y se acepta tanto el bool
 *   verdadero como la respuesta vacía, y nada más.
 */
contract VentaOrigen {
    // ── lo que no cambia nunca ──────────────────────────────────────────────
    address public immutable usdt;
    address public immutable tesoreria;
    uint8   public immutable decimalesUsdt;

    // ── los dos papeles, a propósito separados ──────────────────────────────
    // El dueño es la llave fría: nombra operador, pausa y cierra. El operador
    // es la llave caliente que corre en un servidor y solo puede tocar precio
    // y cupo. Si un día se filtra la del servidor —que es la que más se usa y
    // la que más viaja— lo peor que puede hacer es vender a un precio malo
    // dentro del cupo; no puede llevarse fondos ni redirigir la tesorería.
    address public dueno;
    address public duenoPropuesto;
    address public operador;

    // ── el precio, con fecha ────────────────────────────────────────────────
    /// USD por 1 ORIGEN, con 18 decimales. 2.56 USD → 2_560000000000000000.
    uint256 public precioUsdPorOrigen;
    uint256 public precioPuestoEn;
    uint256 public maxAntiguedadPrecio = 30 minutes;

    // ── los límites ─────────────────────────────────────────────────────────
    /// Cuánto ORIGEN (18 decimales) queda por vender. Ver arriba: es el hilo
    /// que ata este contrato con lo que de verdad hay en la 5550.
    uint256 public cupoOrigen;
    /// En unidades del USDT de esta red, no en dólares enteros.
    uint256 public minCompraUsdt;
    uint256 public maxCompraUsdt;

    bool public pausado;
    /// Contador de compras. Sirve de referencia legible; la identidad de
    /// verdad de una compra es (cadena, txHash, logIndex), que no se puede
    /// falsificar ni repetir.
    uint256 public compras;

    // ── eventos ─────────────────────────────────────────────────────────────
    /// Todo lo que el vigía necesita para pagar, y todo lo que un auditor
    /// necesita para comprobar que pagó bien. `destino` va indexado para que
    /// cualquiera pueda pedir sus propias compras sin leer la cadena entera.
    event Compra(
        uint256 indexed numero,
        address indexed comprador,
        address indexed destino,
        uint256 montoUsdt,
        uint256 precioUsdPorOrigen,
        uint256 origenDebido
    );
    event PrecioPuesto(uint256 precio, uint256 cuando, address quien);
    event CupoPuesto(uint256 cupo, address quien);
    event Pausa(bool pausado, address quien);
    event OperadorPuesto(address anterior, address nuevo);
    event DuenoPropuesto(address actual, address propuesto);
    event DuenoCambiado(address anterior, address nuevo);
    event LimitesPuestos(uint256 minUsdt, uint256 maxUsdt);
    event AntiguedadPuesta(uint256 segundos);

    error NoAutorizado();
    error Pausada();
    error PrecioViejo();
    error SinPrecio();
    error FueraDeLimites();
    error SinCupo();
    error DestinoVacio();
    error MenosDeLoAceptado(uint256 ofrecido, uint256 minimoPedido);
    error TransferenciaFallida();
    error ValorInvalido();

    modifier soloDueno() {
        if (msg.sender != dueno) revert NoAutorizado();
        _;
    }

    /// El dueño también puede hacer lo del operador: si la llave del servidor
    /// se pierde un domingo, la llave fría alcanza para pausar y para dejar el
    /// cupo en cero sin esperar a nadie.
    modifier soloOperador() {
        if (msg.sender != operador && msg.sender != dueno) revert NoAutorizado();
        _;
    }

    constructor(address _usdt, address _tesoreria, address _operador) {
        if (_usdt == address(0) || _tesoreria == address(0)) revert ValorInvalido();
        usdt = _usdt;
        tesoreria = _tesoreria;
        dueno = msg.sender;
        operador = _operador;

        // Los decimales se PREGUNTAN al token. Es la única llamada externa del
        // constructor y es a propósito: escribirlos a mano es el error que no
        // se ve hasta que alguien compra por un millón de veces de menos.
        (bool ok, bytes memory dato) = _usdt.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || dato.length < 32) revert ValorInvalido();
        uint8 d = abi.decode(dato, (uint8));
        if (d > 18) revert ValorInvalido();
        decimalesUsdt = d;

        emit OperadorPuesto(address(0), _operador);
    }

    // ── LA COMPRA ───────────────────────────────────────────────────────────

    /**
     * Compra ORIGEN pagando `montoUsdt` de USDT de ESTA red.
     *
     * Antes hay que hacer `approve(address(this), montoUsdt)` en el USDT.
     *
     * @param montoUsdt  en unidades del token (6 dec. en Polygon, 18 en BSC).
     * @param destino    la dirección de la cadena 5550 que va a recibir el
     *                   ORIGEN. NO tiene por qué ser la misma que paga: quien
     *                   compra desde un exchange o una billetera de hardware
     *                   normalmente cobra en otra.
     * @param minOrigen  lo mínimo que el comprador acepta recibir. Es su
     *                   defensa contra un cambio de precio entre que firma y
     *                   que se mina. Poner 0 es renunciar a ella.
     */
    function comprar(uint256 montoUsdt, address destino, uint256 minOrigen) external {
        if (pausado) revert Pausada();
        if (destino == address(0)) revert DestinoVacio();
        if (precioUsdPorOrigen == 0) revert SinPrecio();
        if (block.timestamp - precioPuestoEn > maxAntiguedadPrecio) revert PrecioViejo();
        if (montoUsdt < minCompraUsdt || montoUsdt > maxCompraUsdt) revert FueraDeLimites();

        uint256 origen = origenPor(montoUsdt);
        // Una compra de cero ORIGEN cobraría el USDT y no debería nada. Pasa
        // solo con polvo, y aun así no se deja: cobrar por nada no es un caso
        // borde aceptable.
        if (origen == 0) revert FueraDeLimites();
        if (origen < minOrigen) revert MenosDeLoAceptado(origen, minOrigen);
        if (origen > cupoOrigen) revert SinCupo();

        // El cupo baja ANTES de mover el dinero. Con USDT no hay callback que
        // permita reentrar, pero el orden correcto no depende de qué token sea
        // hoy: depende de que nadie tenga que volver a razonarlo mañana.
        unchecked { cupoOrigen -= origen; }
        compras += 1;

        _cobrar(msg.sender, montoUsdt);

        emit Compra(compras, msg.sender, destino, montoUsdt, precioUsdPorOrigen, origen);
    }

    /// Cuánto ORIGEN (18 dec.) sale por `montoUsdt` al precio de ahora.
    /// Pública para que la web enseñe el mismo número que va a cobrar el
    /// contrato, calculado por el contrato — no una copia en JavaScript que
    /// un día se desfase.
    function origenPor(uint256 montoUsdt) public view returns (uint256) {
        if (precioUsdPorOrigen == 0) return 0;
        // A 18 decimales primero, y la división al final: dividir antes es
        // como se pierden centavos en silencio.
        uint256 usdEn18 = montoUsdt * (10 ** (18 - decimalesUsdt));
        return (usdEn18 * 1e18) / precioUsdPorOrigen;
    }

    /// true si ahora mismo se puede comprar. La web la usa para no ofrecer un
    /// botón que va a revertir.
    function abierta() external view returns (bool) {
        return !pausado
            && precioUsdPorOrigen != 0
            && block.timestamp - precioPuestoEn <= maxAntiguedadPrecio
            && cupoOrigen > 0;
    }

    // ── el operador: precio y cupo, nada más ────────────────────────────────

    function ponerPrecio(uint256 precio) public soloOperador {
        if (precio == 0) revert ValorInvalido();
        precioUsdPorOrigen = precio;
        precioPuestoEn = block.timestamp;
        emit PrecioPuesto(precio, block.timestamp, msg.sender);
    }

    /**
     * Fija el cupo. NO suma: fija. El vigía conoce el saldo real de la
     * billetera pagadora de la 5550 y escribe ese número; sumar obligaría a
     * llevar la cuenta en dos sitios y a que cuadraran siempre, que es una
     * carrera que se pierde tarde o temprano.
     */
    function ponerCupo(uint256 cupo) public soloOperador {
        cupoOrigen = cupo;
        emit CupoPuesto(cupo, msg.sender);
    }

    /// Las dos cosas en una transacción: es lo que hace el vigía en cada
    /// vuelta, y separarlas deja una ventana con el precio nuevo y el cupo
    /// viejo.
    function ponerPrecioYCupo(uint256 precio, uint256 cupo) external soloOperador {
        ponerPrecio(precio);
        ponerCupo(cupo);
    }

    function pausar(bool si) external soloOperador {
        pausado = si;
        emit Pausa(si, msg.sender);
    }

    // ── el dueño ────────────────────────────────────────────────────────────

    function ponerLimites(uint256 minUsdt, uint256 maxUsdt) external soloDueno {
        if (maxUsdt < minUsdt) revert ValorInvalido();
        minCompraUsdt = minUsdt;
        maxCompraUsdt = maxUsdt;
        emit LimitesPuestos(minUsdt, maxUsdt);
    }

    function ponerAntiguedadPrecio(uint256 segundos_) external soloDueno {
        // Un techo de un día: sin él, un 0 deja la venta muerta y un número
        // enorme desactiva la caducidad sin que se note en ninguna pantalla.
        if (segundos_ == 0 || segundos_ > 1 days) revert ValorInvalido();
        maxAntiguedadPrecio = segundos_;
        emit AntiguedadPuesta(segundos_);
    }

    function ponerOperador(address nuevo) external soloDueno {
        emit OperadorPuesto(operador, nuevo);
        operador = nuevo;
    }

    /// Traspaso en dos pasos. Un `transferOwnership` de un paso a una
    /// dirección mal tecleada deja el contrato sin dueño para siempre, y aquí
    /// eso significa sin quien lo pause.
    function proponerDueno(address nuevo) external soloDueno {
        duenoPropuesto = nuevo;
        emit DuenoPropuesto(dueno, nuevo);
    }

    function aceptarDueno() external {
        if (msg.sender != duenoPropuesto) revert NoAutorizado();
        emit DuenoCambiado(dueno, msg.sender);
        dueno = msg.sender;
        duenoPropuesto = address(0);
    }

    // ── el cobro ────────────────────────────────────────────────────────────

    /// `transferFrom` a bajo nivel: hay USDT que no devuelven bool y un
    /// `IERC20` normal revienta contra ellos al decodificar la nada.
    function _cobrar(address de, uint256 monto) private {
        (bool ok, bytes memory dato) = usdt.call(
            abi.encodeWithSelector(0x23b872dd, de, tesoreria, monto)   // transferFrom
        );
        if (!ok) revert TransferenciaFallida();
        // Se acepta respuesta vacía o un true. Un false explícito es un fallo,
        // y cualquier otra cosa también: si un token contesta algo que no
        // entendemos, la respuesta correcta es no cobrar.
        if (dato.length != 0 && !(dato.length == 32 && abi.decode(dato, (bool)))) {
            revert TransferenciaFallida();
        }
    }

    /* No hay función de rescate y no es un olvido. El contrato no custodia
       nada: el USDT pasa de largo en la misma llamada. Una función que saque
       tokens de aquí no tendría nada que sacar en operación normal, y sí sería
       una llave más que vigilar. Si alguien manda un token por error a esta
       dirección, se queda — el precio de no tener esa llave. */
}
