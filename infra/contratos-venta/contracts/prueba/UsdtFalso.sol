// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * Dos USDT de mentira PARA LAS PRUEBAS. Nunca se despliegan en una red real.
 *
 * Son dos y no uno porque la diferencia entre ellos es justo lo que rompe
 * contratos de verdad:
 *
 *  · `UsdtFalso` devuelve bool, como el USDT de BNB Smart Chain.
 *  · `UsdtMudo` NO devuelve nada, como el Tether original y sus parientes. Un
 *    `IERC20.transferFrom` normal revierte contra este al intentar decodificar
 *    una respuesta vacía, y es el fallo que ha dejado integraciones muertas en
 *    producción durante años.
 *
 * Los decimales entran por el constructor para poder probar los 6 de Polygon y
 * los 18 de BSC con el mismo código.
 */
contract UsdtFalso {
    string public name = "USDT falso";
    string public symbol = "USDT";
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 d) { decimals = d; }

    function acunar(address a, uint256 c) external { balanceOf[a] += c; }

    function approve(address g, uint256 c) external returns (bool) {
        allowance[msg.sender][g] = c;
        return true;
    }

    function transferFrom(address de, address a, uint256 c) external returns (bool) {
        require(balanceOf[de] >= c, "saldo");
        require(allowance[de][msg.sender] >= c, "permiso");
        allowance[de][msg.sender] -= c;
        balanceOf[de] -= c;
        balanceOf[a] += c;
        return true;
    }
}

/// El que no devuelve nada.
contract UsdtMudo {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function acunar(address a, uint256 c) external { balanceOf[a] += c; }
    function approve(address g, uint256 c) external { allowance[msg.sender][g] = c; }

    function transferFrom(address de, address a, uint256 c) external {
        require(balanceOf[de] >= c, "saldo");
        require(allowance[de][msg.sender] >= c, "permiso");
        allowance[de][msg.sender] -= c;
        balanceOf[de] -= c;
        balanceOf[a] += c;
        // y no devuelve nada, a proposito
    }
}

/// El que contesta `false` en vez de revertir: hay tokens asi, y tragarse ese
/// false es como se regala mercancia sin cobrar.
contract UsdtMentiroso {
    uint8 public decimals = 6;
    function approve(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return false; }
}

/// Sin `decimals()`. El constructor tiene que rechazarlo en vez de suponer 18.
contract SinDecimales {
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}
