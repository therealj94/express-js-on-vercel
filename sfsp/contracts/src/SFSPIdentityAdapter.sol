// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";

/// @title Adaptador de identidad: verifica attestations EIP-712 de un emisor autorizado.
/// @notice NUNCA guarda datos personales (§7). Sólo entra una referencia opaca
///         `subjectRef`, el propósito, la vigencia y el estado de revocación.
///         El contenido del claim vive fuera; aquí sólo su raíz.
contract SFSPIdentityAdapter is SFSPAccessControl, SFSPEIP712 {
    // El typehash fija exactamente qué se firmó: un JSON con approved:true no es una attestation.
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 attestationId,bytes32 subjectRef,bytes32 purpose,bytes32 claimsRoot,uint64 validFrom,uint64 validUntil,bytes32 policyVersion,uint256 chainId,address verifyingContract)"
    );

    struct Attestation {
        bytes32 attestationId;
        bytes32 subjectRef;   // referencia opaca: no deriva de datos personales
        bytes32 purpose;      // KYC | KYB | ACCREDITED | SANCTIONS_CLEAR | ...
        bytes32 claimsRoot;   // raíz de los claims; el contenido no está en cadena
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

    event AttestationRecorded(bytes32 indexed subjectRef, bytes32 indexed purpose, bytes32 attestationId, uint64 validUntil);
    event AttestationRevoked(bytes32 indexed subjectRef, bytes32 indexed purpose, bytes32 attestationId, bytes32 reasonCode);
    /// @notice Vínculo dirección ↔ referencia opaca.
    /// @dev H16 · NINGÚN campo va indexado, y no es cosmética. Un campo indexado
    ///      viaja en los `topics` del log, así que cualquiera puede pedir al nodo
    ///      «dame todos los eventos con este `subjectRef`» o «con esta dirección»
    ///      y obtener la lista completa de direcciones de un mismo sujeto en una
    ///      sola consulta barata. Sin índices esa consulta deja de existir: hay
    ///      que recorrer y decodificar todos los logs del contrato.
    ///
    ///      LO QUE SIGUE SIENDO POSIBLE, dicho sin adornos:
    ///        · Recorriendo todos los logs de este contrato se reconstruye la
    ///          misma correlación. Es más caro, no imposible.
    ///        · `subjectRefOf(address)` es una vista pública: dada una dirección,
    ///          cualquiera obtiene su `subjectRef`. Tiene que ser pública porque
    ///          el motor de elegibilidad la consulta en cada transferencia.
    ///        · Con dos direcciones se puede comprobar si pertenecen al mismo
    ///          sujeto comparando sus `subjectRef`. Eso es correlación de
    ///          billeteras, y hoy es posible.
    ///        · La `subjectRef` es única por sujeto y no por propósito, así que es
    ///          un identificador estable que sobrevive a cualquier rotación de
    ///          direcciones.
    ///      Eliminar esto de verdad exige referencias no enlazables por propósito
    ///      —una `subjectRef` distinta por (sujeto, propósito) con prueba de que
    ///      todas pertenecen al mismo sujeto—, lo que cambia el motor de
    ///      elegibilidad, el registro de attestations y el adaptador entero. No se
    ///      hace aquí, y mientras tanto NO se afirma que haya privacidad: hay
    ///      menos facilidad de consulta, que no es lo mismo.
    event SubjectRefBound(address account, bytes32 subjectRef);

    error UnauthorizedIssuer(address signer);
    error AttestationReplayed(bytes32 attestationId);
    error InvalidValidity(uint64 validFrom, uint64 validUntil);
    error DomainMismatch();

    mapping(bytes32 => Record) private _records;                 // key(subjectRef,purpose) => record
    mapping(bytes32 => bool) private _usedAttestationId;         // anti-replay separado de EIP-712
    // FALTA EN CONTRATO-INTERNO: el §7 sitúa el vínculo cuenta↔dirección en el
    // directorio privado. Aquí se guarda sólo la referencia OPACA que el
    // enforcement necesita; no hay enumeración ni dato personal derivable.
    mapping(address => bytes32) private _subjectRefOf;

    constructor(address board) SFSPAccessControl(board) SFSPEIP712("SFSPIdentityAdapter", "draft-0.3") {}

    function _key(bytes32 subjectRef, bytes32 purpose) internal pure returns (bytes32) {
        return keccak256(abi.encode(subjectRef, purpose));
    }

    /// @dev Vincula una dirección a su referencia opaca. Lo escribe un ATTESTOR
    ///      desde el directorio privado; el contrato no infiere identidades.
    function bindSubjectRef(address account, bytes32 subjectRef) external onlyRole(ATTESTOR) {
        require(account != address(0) && subjectRef != bytes32(0), "SFSP: binding invalido");
        _subjectRefOf[account] = subjectRef;
        emit SubjectRefBound(account, subjectRef);
    }

    function unbindSubjectRef(address account) external onlyRole(ATTESTOR) {
        _subjectRefOf[account] = bytes32(0);
        emit SubjectRefBound(account, bytes32(0));
    }

    function subjectRefOf(address account) external view returns (bytes32) {
        return _subjectRefOf[account];
    }

    function hashAttestation(Attestation calldata a) public view returns (bytes32) {
        return _hashTypedData(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.attestationId,
                    a.subjectRef,
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
        if (a.subjectRef == bytes32(0) || a.purpose == bytes32(0)) {
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

        _records[_key(a.subjectRef, a.purpose)] = Record({
            exists: true,
            attestationId: a.attestationId,
            claimsRoot: a.claimsRoot,
            validFrom: a.validFrom,
            validUntil: a.validUntil,
            policyVersion: a.policyVersion,
            revoked: false,
            issuer: issuer
        });
        emit AttestationRecorded(a.subjectRef, a.purpose, a.attestationId, a.validUntil);
    }

    function revokeAttestation(bytes32 subjectRef, bytes32 purpose, bytes32 reasonCode) external onlyRole(ATTESTOR) {
        Record storage r = _records[_key(subjectRef, purpose)];
        require(r.exists, "SFSP: sin attestation");
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        r.revoked = true;
        emit AttestationRevoked(subjectRef, purpose, r.attestationId, reasonCode);
    }

    function hasValidClaim(bytes32 subjectRef, bytes32 purpose) external view returns (bool) {
        Record storage r = _records[_key(subjectRef, purpose)];
        if (!r.exists || r.revoked) return false;
        return block.timestamp >= r.validFrom && block.timestamp < r.validUntil;
    }

    /// @dev Distingue "no consta" de "consta y no vale": el primero es
    ///      UNKNOWN_SOURCE para el motor, el segundo es DENY_ELIGIBILITY.
    function claimStatus(bytes32 subjectRef, bytes32 purpose)
        external
        view
        returns (bool known, bool valid, uint64 validUntil)
    {
        Record storage r = _records[_key(subjectRef, purpose)];
        if (!r.exists) return (false, false, 0);
        bool ok = !r.revoked && block.timestamp >= r.validFrom && block.timestamp < r.validUntil;
        return (true, ok, r.validUntil);
    }
}
