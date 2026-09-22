// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";

/// @title Adaptador de identidad con referencias NO ENLAZABLES POR PROPÓSITO.
/// @notice NUNCA guarda datos personales (§7) y, desde este lote, tampoco guarda
///         la referencia global del sujeto.
///
/// @dev H16 · CIERRE. El estado anterior era un cierre a medias declarado:
///      `SubjectRefBound` había perdido los `indexed`, pero
///        · recorrer todos los logs del contrato reconstruía la misma tabla;
///        · `subjectRefOf(address)` era pública y devolvía la referencia global;
///        · con dos direcciones se comprobaba si eran del mismo sujeto
///          comparando las dos referencias; y
///        · esa referencia era estable POR SUJETO, así que sobrevivía a
///          cualquier rotación de direcciones.
///      Quitar los índices encarecía la consulta; no impedía la correlación.
///
///      Lo que se guarda ahora por dirección es un COMPROMISO POR PROPÓSITO:
///          compromiso = keccak256(ETIQUETA, subjectRef, purpose, salt)
///      con `salt` secreto y propio de cada par (sujeto, propósito). Dos
///      direcciones del mismo sujeto dadas de alta en propósitos distintos
///      guardan valores sin relación observable: para ligarlos haría falta el
///      `subjectRef` Y los dos `salt`, que no están en la cadena ni se derivan
///      de nada que esté en ella.
///
///      Desaparece toda consulta pública que DEVUELVA una referencia: no hay
///      `subjectRefOf` ni getter del compromiso. Lo que queda es
///      `isCommitmentBound(cuenta, propósito, compromiso)`, que RECIBE el
///      compromiso y responde sí o no —que es lo que hace falta para operar sin
///      publicar el vínculo— y `purposeStatus`, que responde con booleanos.
///
///      CORRELACIÓN RESIDUAL, dicha con precisión y no escondida:
///        1. El almacenamiento de un contrato es público: con
///           `eth_getStorageAt` sobre la ranura de `_purposeCommitment` se puede
///           leer el compromiso de una dirección. Eso permite comparar dos
///           direcciones DENTRO DEL MISMO PROPÓSITO y ver si coinciden. No
///           permite compararlas entre propósitos distintos, que es el vínculo
///           que hacía identificable a la persona a través de sus billeteras.
///           Cerrar también eso exige que el compromiso no viva en el contrato
///           —una prueba de conocimiento presentada en cada operación—, lo que
///           cambia el modelo de ejecución entero y no se hace aquí.
///        1-bis. `CommitmentBlocked` SÍ publica el compromiso, y es a
///           propósito: una lista de bloqueo que nadie puede comprobar no es
///           una lista de bloqueo. El precio es que un sujeto BLOQUEADO queda
///           correlacionable dentro de ese propósito por los logs, sin leer el
///           almacenamiento. Los eventos de attestation no pagan ese precio
///           porque ahí el conjunto sería TODO el que tiene claim, no el puñado
///           que está bloqueado.
///        2. `PurposeCommitmentBound` publica la cuenta y el propósito, nunca el
///           compromiso: de los logs se deduce QUÉ propósitos tiene dada de alta
///           una dirección, no a quién pertenece ni con qué otras comparte
///           sujeto.
///        3. El propósito base (`PURPOSE_BASE` en el motor de elegibilidad) lo
///           llevan todas las direcciones operativas, así que el punto 1 aplica
///           ahí de forma sistemática. Un despliegue que quiera evitarlo tiene
///           que usar un `salt` distinto por DIRECCIÓN además de por propósito,
///           al precio de que el motor deje de poder tratar dos direcciones del
///           mismo sujeto como un solo sujeto. Es una decisión de despliegue, y
///           el contrato admite las dos: el `salt` no lo elige este código.
contract SFSPIdentityAdapter is SFSPAccessControl, SFSPEIP712 {
    /// @dev El typehash fija exactamente qué se firmó. Cambió respecto de
    ///      draft-0.3: el campo ya no es `subjectRef` sino `subjectCommitment`.
    ///      El cambio es deliberado y rompe de golpe toda attestation firmada
    ///      sobre la referencia global, que es el comportamiento deseado: una
    ///      attestation vieja no se puede releer contra el formato nuevo.
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 attestationId,bytes32 subjectCommitment,bytes32 purpose,bytes32 claimsRoot,uint64 validFrom,uint64 validUntil,bytes32 policyVersion,uint256 chainId,address verifyingContract)"
    );

    /// @dev Separación de dominio del compromiso. Un compromiso de identidad no
    ///      puede colisionar con ningún otro hash del sistema, y versionarlo
    ///      permite invalidar de golpe un esquema si alguna vez hiciera falta.
    bytes32 public constant COMMITMENT_TAG = keccak256("SFSP.SUBJECT.COMMITMENT.v1");

    struct Attestation {
        bytes32 attestationId;
        bytes32 subjectCommitment; // compromiso por propósito; NO es la referencia del sujeto
        bytes32 purpose;           // KYC | KYB | ACCREDITED | SANCTIONS_CLEAR | ...
        bytes32 claimsRoot;        // raíz de los claims; el contenido no está en cadena
        uint64 validFrom;
        uint64 validUntil;
        bytes32 policyVersion;
    }

    struct Record {
        bool exists;
        bytes32 attestationId;
        bytes32 claimsRoot;
        uint64 validFrom;
        uint64 validUntil;
        bytes32 policyVersion;
        bool revoked;
        address issuer;
    }

    /// @dev H16 · estos eventos NO publican el compromiso, ni indexado ni en
    ///      datos. Publicarlo dejaba en los logs el conjunto de compromisos de
    ///      cada propósito, y con `isCommitmentBound` —que es pública— probar
    ///      cada compromiso contra cada dirección reconstruía la tabla entera
    ///      sin necesidad de leer el almacenamiento. Era un camino más barato
    ///      que el de la correlación residual declarada arriba, y no estaba
    ///      dicho en ninguna parte.
    ///
    ///      El asidero que queda es `attestationId`, que lo elige quien emite
    ///      la attestation: quien la emitió sabe cuál es la suya, y quien no,
    ///      no deduce de él ni el sujeto ni el compromiso.
    event AttestationRecorded(bytes32 indexed purpose, bytes32 attestationId, uint64 validUntil);
    event AttestationRevoked(bytes32 indexed purpose, bytes32 attestationId, bytes32 reasonCode);

    /// @notice Alta o baja de una dirección en un propósito.
    /// @dev H16 · el compromiso NO viaja en el evento, ni en los topics ni en los
    ///      datos. Un log dice «esta dirección quedó dada de alta en KYC», que es
    ///      lo que la auditoría operativa necesita, y no dice de quién es.
    event PurposeCommitmentBound(address account, bytes32 purpose, bool bound);

    /// @notice Bloqueo de un sujeto DENTRO de un propósito.
    /// @dev El bloqueo tiene que publicar el compromiso: quien opera necesita
    ///      poder comprobar contra qué se bloquea. El alcance sigue siendo el
    ///      propósito, así que bloquear en KYC no revela nada sobre PAYMENTS.
    event CommitmentBlocked(bytes32 purpose, bytes32 subjectCommitment, bytes32 reasonCode, bool blocked);

    error UnauthorizedIssuer(address signer);
    error AttestationReplayed(bytes32 attestationId);
    error InvalidValidity(uint64 validFrom, uint64 validUntil);
    error DomainMismatch();

    mapping(bytes32 => Record) private _records;                 // key(subjectCommitment,purpose) => record
    mapping(bytes32 => bool) private _usedAttestationId;         // anti-replay separado de EIP-712
    // H16 · (dirección, propósito) => compromiso. Lo escribe un ATTESTOR desde el
    // directorio privado; el contrato no infiere identidades y no guarda en
    // ninguna parte el `subjectRef` del que se derivó el compromiso.
    mapping(address => mapping(bytes32 => bytes32)) private _purposeCommitment;
    // Lista de bloqueo, POR PROPÓSITO. Vivía en el motor de elegibilidad indexada
    // por la referencia global; con la referencia fuera de la cadena, el motor ya
    // no tiene con qué indexarla y el lugar correcto es aquí.
    mapping(bytes32 => mapping(bytes32 => bool)) private _blocked; // purpose => commitment => bloqueado

    constructor(address board) SFSPAccessControl(board) SFSPEIP712("SFSPIdentityAdapter", "draft-0.3") {}

    function _key(bytes32 subjectCommitment, bytes32 purpose) internal pure returns (bytes32) {
        return keccak256(abi.encode(subjectCommitment, purpose));
    }

    // ------------------------------------------------------------- compromisos

    /// @notice Forma canónica del compromiso por propósito.
    /// @dev `pure` y pública a propósito: el directorio privado y las pruebas
    ///      tienen que poder calcular exactamente lo mismo que comprobará el
    ///      contrato. Publicarla no debilita nada, porque sin `salt` el
    ///      compromiso no se puede invertir ni adivinar.
    function purposeCommitment(bytes32 subjectRef, bytes32 purpose, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(COMMITMENT_TAG, subjectRef, purpose, salt));
    }

    /// @dev Da de alta una dirección en un propósito con su compromiso ya
    ///      calculado fuera. El `subjectRef` y el `salt` NUNCA entran al contrato:
    ///      si entraran, estarían en el calldata de la transacción y la
    ///      correlación volvería por ahí.
    function bindPurposeCommitment(address account, bytes32 purpose, bytes32 commitment)
        external
        onlyRole(ATTESTOR)
    {
        require(
            account != address(0) && purpose != bytes32(0) && commitment != bytes32(0), "SFSP: binding invalido"
        );
        _purposeCommitment[account][purpose] = commitment;
        emit PurposeCommitmentBound(account, purpose, true);
    }

    function unbindPurposeCommitment(address account, bytes32 purpose) external onlyRole(ATTESTOR) {
        _purposeCommitment[account][purpose] = bytes32(0);
        emit PurposeCommitmentBound(account, purpose, false);
    }

    /// @notice Comprobación que RECIBE el compromiso y responde sí o no.
    /// @dev Sustituye a `subjectRefOf`. Quien ya conoce el compromiso —el
    ///      directorio privado, el propio sujeto, un supervisor con el `salt`—
    ///      puede verificar el vínculo; quien no lo conoce no obtiene de aquí
    ///      ningún valor que comparar contra otra dirección.
    function isCommitmentBound(address account, bytes32 purpose, bytes32 commitment) external view returns (bool) {
        return commitment != bytes32(0) && _purposeCommitment[account][purpose] == commitment;
    }

    /// @notice Estado de una dirección en un propósito, en booleanos.
    /// @dev Es lo único que el motor de elegibilidad necesita, y no devuelve
    ///      ninguna referencia ni ningún compromiso: la resolución ocurre dentro
    ///      del adaptador y lo que sale es un sí o un no por cada pregunta.
    function purposeStatus(address account, bytes32 purpose)
        external
        view
        returns (bool bound, bool blocked, bool claimKnown, bool claimValid)
    {
        bytes32 c = _purposeCommitment[account][purpose];
        if (c == bytes32(0)) return (false, false, false, false);
        Record storage r = _records[_key(c, purpose)];
        bool ok = r.exists && !r.revoked && block.timestamp >= r.validFrom && block.timestamp < r.validUntil;
        return (true, _blocked[purpose][c], r.exists, ok);
    }

    function setCommitmentBlocked(bytes32 purpose, bytes32 commitment, bool blocked, bytes32 reasonCode)
        external
        onlyRole(ATTESTOR)
    {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        require(purpose != bytes32(0) && commitment != bytes32(0), "SFSP: bloqueo invalido");
        _blocked[purpose][commitment] = blocked;
        emit CommitmentBlocked(purpose, commitment, reasonCode, blocked);
    }

    function isCommitmentBlocked(bytes32 purpose, bytes32 commitment) external view returns (bool) {
        return _blocked[purpose][commitment];
    }

    // ------------------------------------------------------------ attestations

    function hashAttestation(Attestation calldata a) public view returns (bytes32) {
        return _hashTypedData(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.attestationId,
                    a.subjectCommitment,
                    a.purpose,
                    a.claimsRoot,
                    a.validFrom,
                    a.validUntil,
                    a.policyVersion,
                    block.chainid,
                    address(this)
                )
            )
        );
    }

    /// @dev Verificación de vista: permite a un cliente comprobar una firma sin
    ///      escribir nada. Devuelve código del §4 en vez de revertir.
    function verifyAttestation(Attestation calldata a, bytes calldata signature)
        public
        view
        returns (uint8 result, bytes32 reasonCode, address issuer)
    {
        if (a.subjectCommitment == bytes32(0) || a.purpose == bytes32(0)) {
            return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_SUBJECT_UNKNOWN, address(0));
        }
        if (a.validUntil <= a.validFrom) {
            return (SFSPCodes.DENY_POLICY, bytes32("VALIDITY_WINDOW_INVALID"), address(0));
        }
        address signer;
        // El recover puede revertir con firma malformada; aquí se quiere código, no revert.
        (bool ok, bytes memory ret) =
            address(this).staticcall(abi.encodeWithSelector(this.recoverAttestation.selector, a, signature));
        if (!ok || ret.length != 32) {
            return (SFSPCodes.DENY_AUTHORIZATION, bytes32("SIGNATURE_MALFORMED"), address(0));
        }
        signer = abi.decode(ret, (address));
        if (!hasRole(ATTESTOR, signer)) {
            return (SFSPCodes.DENY_AUTHORIZATION, bytes32("ISSUER_NOT_AUTHORIZED"), signer);
        }
        if (block.timestamp < a.validFrom || block.timestamp >= a.validUntil) {
            return (SFSPCodes.DENY_ELIGIBILITY, SFSPCodes.R_CLAIM_MISSING, signer);
        }
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK, signer);
    }

    function recoverAttestation(Attestation calldata a, bytes calldata signature) external view returns (address) {
        return _recover(hashAttestation(a), signature);
    }

    /// @dev Registrar consume el `attestationId`: EIP-712 no aporta anti-replay,
    ///      el contador es este mapping y va aparte de la firma.
    function recordAttestation(Attestation calldata a, bytes calldata signature) external {
        (uint8 result, , address issuer) = verifyAttestation(a, signature);
        if (result != SFSPCodes.ALLOW) {
            if (result == SFSPCodes.DENY_AUTHORIZATION) revert UnauthorizedIssuer(issuer);
            revert InvalidValidity(a.validFrom, a.validUntil);
        }
        if (_usedAttestationId[a.attestationId]) revert AttestationReplayed(a.attestationId);
        _usedAttestationId[a.attestationId] = true;

        _records[_key(a.subjectCommitment, a.purpose)] = Record({
            exists: true,
            attestationId: a.attestationId,
            claimsRoot: a.claimsRoot,
            validFrom: a.validFrom,
            validUntil: a.validUntil,
            policyVersion: a.policyVersion,
            revoked: false,
            issuer: issuer
        });
        emit AttestationRecorded(a.purpose, a.attestationId, a.validUntil);
    }

    function revokeAttestation(bytes32 subjectCommitment, bytes32 purpose, bytes32 reasonCode)
        external
        onlyRole(ATTESTOR)
    {
        Record storage r = _records[_key(subjectCommitment, purpose)];
        require(r.exists, "SFSP: sin attestation");
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        r.revoked = true;
        emit AttestationRevoked(purpose, r.attestationId, reasonCode);
    }

    /// @dev RECIBE el compromiso y responde sí o no. No hay forma de obtener el
    ///      compromiso desde aquí: hay que traerlo.
    function hasValidClaim(bytes32 subjectCommitment, bytes32 purpose) external view returns (bool) {
        Record storage r = _records[_key(subjectCommitment, purpose)];
        if (!r.exists || r.revoked) return false;
        return block.timestamp >= r.validFrom && block.timestamp < r.validUntil;
    }

    /// @dev Distingue "no consta" de "consta y no vale": el primero es
    ///      UNKNOWN_SOURCE para el motor, el segundo es DENY_ELIGIBILITY.
    function claimStatus(bytes32 subjectCommitment, bytes32 purpose)
        external
        view
        returns (bool known, bool valid, uint64 validUntil)
    {
        Record storage r = _records[_key(subjectCommitment, purpose)];
        if (!r.exists) return (false, false, 0);
        bool ok = !r.revoked && block.timestamp >= r.validFrom && block.timestamp < r.validUntil;
        return (true, ok, r.validUntil);
    }
}
