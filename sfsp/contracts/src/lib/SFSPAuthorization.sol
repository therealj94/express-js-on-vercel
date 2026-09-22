// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPCodes} from "./SFSPCodes.sol";

/// @title Autorización ligada al contenido (SFSP-AUTH-v1).
/// @notice Raíz común de H01, H02, H04, H05, H06, H18 y H19: en todos esos casos
///         la autorización se identificaba por una clave débil —un `operationId`,
///         un `bytes32(amount)`, un `migrationId`, un tipo de acción— que no
///         compromete QUÉ se va a hacer. Con una clave así, una aprobación válida
///         para un contenido habilita la ejecución de otro contenido distinto.
///
/// @dev El patrón tiene tres piezas y las tres son obligatorias:
///
///      1. El aprobador aprueba un `digest`, no un identificador.
///      2. El EJECUTOR recalcula el digest desde sus argumentos reales. No lee
///         el digest de la petición: lo deriva de lo que va a ejecutar. Por eso
///         una aprobación no puede servir para un payload que difiera en un solo
///         campo, ni siquiera en `amountSecondary` o en `evidenceRoot`.
///      3. El digest se consume una sola vez. Vigencia sin consumo único no basta:
///         H19 es exactamente eso, una aprobación de UNPAUSE que sobrevive a la
///         pausa que levantó y sirve para el siguiente incidente.
///
///      Sobre la codificación: se usa `abi.encode` y NUNCA `abi.encodePacked`.
///      `encodePacked` concatena campos de longitud variable sin prefijo de
///      longitud, de forma que dos payloads distintos pueden reagruparse en la
///      misma cadena de bytes y producir el mismo digest. Aquí todos los campos
///      ocupan exactamente una palabra de 32 bytes, la posición de cada campo es
///      fija y la reagrupación es imposible por construcción.
library SFSPAuthorization {
    // ------------------------------------------------------------------ tipos

    /// @dev Campos del §2.4 del contrato interno reducidos a palabras de 32 bytes.
    ///      `origin` puede ser la dirección cero cuando la acción no tiene parte de
    ///      origen (MINT crea unidades, no las mueve desde nadie). Eso es legítimo
    ///      y sigue entrando en el digest: un MINT y un TRANSFER con el resto de los
    ///      campos iguales dan digests distintos porque `action` difiere.
    ///      `amountSecondary` es la segunda pata de las acciones con dos montos
    ///      (efectivo contra activo en una liquidación, el precio de H05); es 0
    ///      cuando la acción tiene un solo monto, y ese 0 también se compromete.
    ///      `evidenceRoot` es opcional: 0 significa «sin evidencia asociada», y al
    ///      entrar en el digest deja de poder añadirse o quitarse después.
    struct Payload {
        uint256 chainId;
        address verifyingContract;
        bytes32 action;
        bytes32 assetId;
        address origin;
        address destination;
        uint256 amount;
        uint256 amountSecondary;
        bytes32 nonce;
        uint64 notBefore;
        uint64 expiry;
        bytes32 evidenceRoot;
    }

    // --------------------------------------------------------------- dominio

    /// @dev Separación de dominio. Un digest de SFSP-AUTH-v1 no puede colisionar
    ///      con un hash de otro subsistema ni con el de una versión futura del
    ///      propio formato: cambiar la versión cambia esta constante y invalida de
    ///      golpe todas las aprobaciones emitidas bajo la anterior.
    bytes32 internal constant DOMAIN_TAG = keccak256("SFSP-AUTH-v1");

    /// @dev Hash del tipo. Va dentro del digest para que el formato quede
    ///      comprometido junto con los valores: si algún día se añade un campo,
    ///      el typehash cambia y ninguna aprobación vieja se puede reinterpretar
    ///      contra el formato nuevo.
    bytes32 internal constant PAYLOAD_TYPEHASH =
        keccak256(
            "SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,bytes32 assetId,address origin,address destination,uint256 amount,uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)"
        );

    /// @dev Ranura de almacenamiento del registro de consumo, derivada de una
    ///      cadena y no de un índice secuencial. Una biblioteca `internal` se
    ///      compila dentro del contrato que la usa, así que el registro vive en el
    ///      almacenamiento de ESE contrato; con una ranura derivada no puede pisar
    ///      ninguna variable declarada normalmente ni ninguna otra biblioteca.
    bytes32 private constant _CONSUMED_SLOT =
        keccak256("sfsp.authorization.consumed.v1");

    struct Registry {
        mapping(bytes32 => uint64) consumedAt;
    }

    // ---------------------------------------------------------------- errores

    /// @dev Todos los errores llevan el código del §4 del contrato interno, porque
    ///      un rechazo siempre lleva código y la interfaz traduce el código, no el
    ///      texto. El motivo `bytes32` da el detalle operativo sin publicar texto
    ///      libre en cadena.
    error AuthorizationConsumed(bytes32 digest, uint64 consumedAt, uint8 code);
    error AuthorizationNotYetValid(uint64 notBefore, uint64 timestamp, uint8 code);
    error AuthorizationExpired(uint64 expiry, uint64 timestamp, uint8 code);
    error AuthorizationDigestMismatch(bytes32 approved, bytes32 recomputed, uint8 code);
    error AuthorizationMalformed(bytes32 reason, uint8 code);

    // ----------------------------------------------------------------- digest

    /// @notice Forma canónica del digest. Es la MISMA construcción que
    ///         `sdk/src/autorizacion.ts`, y los vectores de
    ///         `fixtures/vectores-autorizacion.json` existen para que una
    ///         divergencia entre las dos implementaciones rompa la suite.
    /// @dev `pure`: no depende del estado ni del reloj. Que el digest sea calculable
    ///      fuera de la cadena es lo que permite que el aprobador firme exactamente
    ///      lo mismo que el ejecutor recalculará.
    function digestOf(Payload memory p) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TAG,
                    PAYLOAD_TYPEHASH,
                    p.chainId,
                    p.verifyingContract,
                    p.action,
                    p.assetId,
                    p.origin,
                    p.destination,
                    p.amount,
                    p.amountSecondary,
                    p.nonce,
                    p.notBefore,
                    p.expiry,
                    p.evidenceRoot
                )
            );
    }

    // ------------------------------------------------------------- validación

    /// @notice Comprueba la forma del payload y su atadura a ESTA cadena y ESTE
    ///         contrato.
    /// @dev Sin esta comprobación el digest sigue siendo único, pero una
    ///      aprobación emitida para otra red o para otro contrato del mismo
    ///      despliegue sería presentable aquí: el digest la ataría al contenido
    ///      pero no al lugar. Se comprueba contra `block.chainid` en vez de contra
    ///      un valor guardado en el constructor porque, si la cadena se bifurca,
    ///      el valor real es el de la cadena en la que se está ejecutando.
    function checkBinding(Payload memory p) internal view {
        if (p.chainId != block.chainid) {
            revert AuthorizationMalformed(bytes32("CHAIN_MISMATCH"), SFSPCodes.DENY_AUTHORIZATION);
        }
        if (p.verifyingContract != address(this)) {
            revert AuthorizationMalformed(bytes32("CONTRACT_MISMATCH"), SFSPCodes.DENY_AUTHORIZATION);
        }
        checkForm(p);
    }

    /// @notice Comprueba lo que hace absurdo al payload con independencia del lugar.
    /// @dev Un `nonce` en cero haría que dos autorizaciones por lo demás idénticas
    ///      colapsaran en el mismo digest, y la segunda sería irrepresentable tras
    ///      consumir la primera. `action` y `assetId` nulos describirían una
    ///      autorización que no dice qué autoriza. Una ventana vacía o invertida
    ///      nunca es ejecutable, y aceptarla sólo serviría para que una aprobación
    ///      imposible pareciera válida en un panel.
    function checkForm(Payload memory p) internal pure {
        if (p.action == bytes32(0)) {
            revert AuthorizationMalformed(bytes32("ACTION_EMPTY"), SFSPCodes.DENY_AUTHORIZATION);
        }
        if (p.assetId == bytes32(0)) {
            revert AuthorizationMalformed(bytes32("ASSET_EMPTY"), SFSPCodes.DENY_AUTHORIZATION);
        }
        if (p.nonce == bytes32(0)) {
            revert AuthorizationMalformed(bytes32("NONCE_EMPTY"), SFSPCodes.DENY_AUTHORIZATION);
        }
        if (p.expiry <= p.notBefore) {
            revert AuthorizationMalformed(bytes32("WINDOW_EMPTY"), SFSPCodes.DENY_AUTHORIZATION);
        }
    }

    /// @notice Vigencia contra el reloj del bloque.
    /// @dev `expiry` es exclusivo: en el segundo exacto de vencimiento la
    ///      autorización ya no vale. Se elige el extremo cerrado por abajo y
    ///      abierto por arriba para que dos ventanas consecutivas de la misma
    ///      acción no se solapen nunca en un segundo compartido.
    ///      `block.timestamp` lo elige el productor del bloque dentro de un margen;
    ///      por eso la ventana es un control grueso y NO sustituye al consumo único.
    function checkWindow(Payload memory p) internal view {
        uint64 ts = uint64(block.timestamp);
        if (ts < p.notBefore) {
            revert AuthorizationNotYetValid(p.notBefore, ts, SFSPCodes.DENY_AUTHORIZATION);
        }
        if (ts >= p.expiry) {
            revert AuthorizationExpired(p.expiry, ts, SFSPCodes.DENY_AUTHORIZATION);
        }
    }

    // ------------------------------------------------------- consumo único

    function _registry() private pure returns (Registry storage r) {
        bytes32 slot = _CONSUMED_SLOT;
        assembly {
            r.slot := slot
        }
    }

    function isConsumed(bytes32 digest) internal view returns (bool) {
        return _registry().consumedAt[digest] != 0;
    }

    function consumedAt(bytes32 digest) internal view returns (uint64) {
        return _registry().consumedAt[digest];
    }

    /// @notice Marca el digest como gastado. Revierte si ya lo estaba.
    /// @dev Se guarda el instante y no un booleano porque la auditoría posterior
    ///      necesita saber CUÁNDO se gastó una autorización, no sólo que se gastó.
    ///      Si `block.timestamp` fuese 0 el registro no distinguiría gastado de no
    ///      gastado; no puede serlo en ninguna cadena real, pero se fuerza a 1 para
    ///      que la invariante no dependa de esa suposición.
    function consume(bytes32 digest) internal {
        Registry storage r = _registry();
        uint64 previo = r.consumedAt[digest];
        if (previo != 0) {
            revert AuthorizationConsumed(digest, previo, SFSPCodes.DENY_AUTHORIZATION);
        }
        uint64 ts = uint64(block.timestamp);
        r.consumedAt[digest] = ts == 0 ? 1 : ts;
    }

    // ------------------------------------------------------ camino del ejecutor

    /// @notice El único camino que deberían usar los ejecutores.
    /// @param p              Los argumentos REALES de la operación que se va a ejecutar.
    /// @param approvedDigest El digest que el gobierno aprobó.
    /// @dev El orden importa. Primero se recalcula el digest desde `p`, que es lo
    ///      que de verdad va a pasar, y se compara con lo aprobado: si el ejecutor
    ///      se limitara a confiar en `approvedDigest`, volveríamos a H01. Después
    ///      forma, atadura y vigencia. Y el consumo al final, como efecto, antes de
    ///      cualquier interacción externa del llamador (checks-effects-interactions):
    ///      un reentrante que vuelva a entrar por este mismo camino encontrará el
    ///      digest ya gastado.
    function authorize(Payload memory p, bytes32 approvedDigest) internal returns (bytes32) {
        bytes32 recomputed = digestOf(p);
        if (recomputed != approvedDigest) {
            revert AuthorizationDigestMismatch(approvedDigest, recomputed, SFSPCodes.DENY_AUTHORIZATION);
        }
        checkBinding(p);
        checkWindow(p);
        consume(recomputed);
        return recomputed;
    }
}

/// @title Sonda de conformidad de SFSPAuthorization.
/// @notice Expone la biblioteca para dos cosas: las pruebas de `09-authorization.js`
///         y la comparación cruzada contra `sdk/src/autorizacion.ts` sobre los
///         vectores compartidos. NO participa en ninguna ruta de dinero, no tiene
///         roles, no tiene saldos y no debe desplegarse fuera de una prueba.
/// @dev Existe porque una biblioteca `internal` no es llamable desde fuera: sin un
///      contrato que la enmarque, la implementación Solidity del digest no sería
///      observable y la prueba que exige que los dos lados coincidan no se podría
///      escribir. Esa prueba es la razón de ser de este lote.
contract SFSPAuthorizationProbe {
    using SFSPAuthorization for SFSPAuthorization.Payload;

    event Authorized(bytes32 digest);

    function domainTag() external pure returns (bytes32) {
        return SFSPAuthorization.DOMAIN_TAG;
    }

    function payloadTypehash() external pure returns (bytes32) {
        return SFSPAuthorization.PAYLOAD_TYPEHASH;
    }

    function digestOf(SFSPAuthorization.Payload calldata p) external pure returns (bytes32) {
        SFSPAuthorization.Payload memory m = p;
        return SFSPAuthorization.digestOf(m);
    }

    function checkForm(SFSPAuthorization.Payload calldata p) external pure {
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.checkForm(m);
    }

    function checkWindow(SFSPAuthorization.Payload calldata p) external view {
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.checkWindow(m);
    }

    function isConsumed(bytes32 digest) external view returns (bool) {
        return SFSPAuthorization.isConsumed(digest);
    }

    function consumedAt(bytes32 digest) external view returns (uint64) {
        return SFSPAuthorization.consumedAt(digest);
    }

    function consume(bytes32 digest) external {
        SFSPAuthorization.consume(digest);
    }

    /// @dev `approvedDigest` entra por separado a propósito: así la prueba puede
    ///      presentar una aprobación legítima junto a un payload alterado en un
    ///      solo campo y comprobar que el ejecutor la rechaza.
    function authorize(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external returns (bytes32) {
        SFSPAuthorization.Payload memory m = p;
        bytes32 d = SFSPAuthorization.authorize(m, approvedDigest);
        emit Authorized(d);
        return d;
    }
}
