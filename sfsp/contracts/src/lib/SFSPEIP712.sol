// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Dominio EIP-712 y recuperación de firma.
/// @dev EIP-712 da vinculación a dominio (chainId + verifyingContract), NO da
///      anti-replay por sí solo: el contador/nullifier va aparte en cada consumidor.
abstract contract SFSPEIP712 {
    bytes32 private constant _TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private immutable _hashedName;
    bytes32 private immutable _hashedVersion;

    error BadSignature();

    constructor(string memory name, string memory version) {
        _hashedName = keccak256(bytes(name));
        _hashedVersion = keccak256(bytes(version));
    }

    /// @dev Se recalcula por llamada: si la cadena se bifurca, el dominio sigue el chainId real.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(_TYPE_HASH, _hashedName, _hashedVersion, block.chainid, address(this)));
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @dev Rechaza s alta y v fuera de rango: una firma maleable permitiría
    ///      presentar dos bytes distintos para la misma aprobación humana.
    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        if (v != 27 && v != 28) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
