import ChainId from "../models/ChainId";
import Users from "../models/Users";
import { JsonRpcProvider } from "ethers/providers";
import { Contract } from "ethers/contract";
import { Wallet } from "ethers/wallet";
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { descifrarLlavePrivada } from "../lib/cripto";
import { parseEther } from "ethers/utils";
import Tx from "../models/Tx";
import jwt from "jsonwebtoken";
import abi from "../ABI/abi.json";
import { precioDeGas, limiteDeGas, LIMITE_POR_OMISION_TOKEN } from "../lib/gas";
import { cobrarComision, comisionEnOrigen } from "../lib/comision";
import {
  reservar,
  completar,
  marcarFallo,
  normalizarSello,
  seSabeQueNoSalio,
  responderSiCorresponde,
} from "../lib/idempotencia";

// ============================================================
// Traduce un fallo de envio a algo que el usuario pueda entender y actuar.
//
// Los codigos vienen de ethers. El mensaje crudo no sirve: decirle "missing
// revert data" a alguien que queria mandar plata no le dice si tiene que
// esperar, recargar gas o corregir la direccion.
// ============================================================
function responderErrorEnvio(res, error) {
  console.error("[send]", error?.code || "", error?.message || error);

  const codigo = error?.code;

  if (codigo === "INSUFFICIENT_FUNDS") {
    return res.status(400).json({
      code: "INSUFFICIENT_FUNDS",
      message: "No alcanza para cubrir el monto más el gas de la red.",
    });
  }
  if (codigo === "NONCE_EXPIRED" || codigo === "REPLACEMENT_UNDERPRICED") {
    return res.status(409).json({
      code: "NONCE_CONFLICT",
      message: "Hay otro envío tuyo en curso. Esperá a que termine y volvé a intentar.",
    });
  }
  if (codigo === "NETWORK_ERROR" || codigo === "SERVER_ERROR" || codigo === "TIMEOUT") {
    return res.status(503).json({
      code: "NETWORK",
      message: "La red no responde en este momento. Tu saldo no se movió.",
    });
  }
  if (codigo === "INVALID_ARGUMENT" || codigo === "UNCONFIGURED_NAME") {
    return res.status(400).json({
      code: "INVALID_ADDRESS",
      message: "La dirección de destino no es válida.",
    });
  }
  if (codigo === "CALL_EXCEPTION") {
    return res.status(400).json({
      code: "REVERTED",
      message: "La red rechazó la transacción. No se descontó nada.",
    });
  }

  return res.status(500).json({
    code: "UNKNOWN",
    message: "No se pudo completar el envío. Tu saldo no se movió.",
  });
}

export const send = async (req, res) => {
  // El sello vive fuera del try para poder liberarlo en el catch.
  let sello = null;
  let quien = null;
  try {
    const { chain_id, recipientAddress, password, amount, idempotencyKey } = req.body;
    sello = normalizarSello(idempotencyKey);

    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;

    const chain = await ChainId.findOne({ chain_id: chain_id });

    if (!chain) {
      return res.status(404).json({ message: "Chain not found" });
    }

    const provider = new JsonRpcProvider(chain.provider);
    console.log(provider);
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "user account not found" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // El sello se reserva DESPUES de validar y ANTES de firmar.
    //
    // Despues de validar, para que una contraseña mal escrita no queme el
    // sello del usuario. Y antes de firmar, porque si se reservara despues,
    // dos peticiones simultaneas pasarian las dos y las dos transferirian —
    // que es justo lo que hay que impedir.
    quien = address;
    if (sello) {
      const reserva = await reservar(sello, quien, { chain_id, recipientAddress, amount });
      const respuesta = responderSiCorresponde(res, reserva);
      if (respuesta) return respuesta;
    }

    const decryptedPrivateKey = descifrarLlavePrivada(user.privateKey);

    const wallet = new Wallet(decryptedPrivateKey, provider);
    const nonce = await provider.getTransactionCount(wallet.address, "latest");
    const valor = parseEther(amount).toString();

    // El precio y el limite salen de la cadena. Eran 400 gwei y 210.000 fijos:
    // 4,3 veces el precio acordado, y un limite diez veces el gasto real que
    // obligaba a tener 0,084 ORIGEN libres para mover un centavo. Ver lib/gas.js.
    const gasPriceWei = await precioDeGas(provider);
    const gasLimit = await limiteDeGas(provider, {
      from: wallet.address,
      to: recipientAddress,
      value: valor,
    });

    const data = {
      to: recipientAddress,
      value: valor,
      gasLimit: gasLimit,
      nonce: nonce,
      gasPrice: gasPriceWei,
    };

    const transaction = await wallet.sendTransaction(data);

    // La comision de 0,01 ORIGEN, en una transaccion aparte y DESPUES del
    // envio: si fallara, preferimos perderla a haberle cobrado por un envio
    // que no salio. Ver lib/comision.js.
    const hashComision = await cobrarComision(wallet, nonce + 1);

    // NO se espera el minado.
    //
    // `transaction.wait()` bloquea hasta que la tx entre en un bloque, y eso
    // puede tardar mas de los 30s en los que el router de Heroku corta la
    // conexion (H12). Cuando cortaba, el cliente veia un error de red por una
    // transaccion que en realidad habia salido bien y terminaba minandose:
    // el peor resultado posible, porque invita a reenviarla.
    //
    // El hash es prueba suficiente de que se emitio. El estado final se
    // consulta despues contra la cadena.
    const newTransaction = new Tx({
      amount: amount,
      recipient: recipientAddress,
      hash: transaction.hash,
      chain_id: chain_id,
      coin: chain.name,
    });
    user.transaction.push(newTransaction);

    await Promise.all([user.save(), newTransaction.save()]);

    const salida = {
      hash: transaction.hash,
      from: wallet.address,
      to: recipientAddress,
      amount,
      chain_id,
      coin: chain.name,
      status: "pending",
      comision: comisionEnOrigen(),
      hashComision,
    };
    // Se guarda la respuesta para devolver EXACTAMENTE esta si el mismo sello
    // vuelve a llegar. Asi un reintento ve el hash del envio que si salio, en
    // vez de un error que invite a mandarlo otra vez.
    if (sello) await completar(sello, quien, salida);
    return res.json(salida);
  } catch (error) {
    if (sello && quien) {
      // Solo se libera el sello cuando consta que la transaccion no llego a
      // emitirse. Si quedo en duda se marca como dudosa, y el siguiente
      // intento con el mismo sello pedira verificar antes de repetir.
      await marcarFallo(sello, quien, error, seSabeQueNoSalio(error)).catch(() => {});
    }
    // El catch anterior solo hacia console.log: no respondia nada. La app se
    // quedaba esperando hasta su propio timeout de 90s sin saber que habia
    // fallado ni por que. Un envio de dinero es el ultimo lugar donde el
    // usuario deberia quedarse mirando una rueda girando.
    return responderErrorEnvio(res, error);
  }
};

export const sendToken = async (req, res) => {
  let sello = null;
  let quien = null;
  try {
    const {
      chain_id,
      recipientAddress,
      password,
      amount,
      tokenContractAddress,
      idempotencyKey,
    } = req.body;
    sello = normalizarSello(idempotencyKey);

    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const address = decodedToken.address;

    const chain = await ChainId.findOne({ chain_id: chain_id });

    if (!chain) {
      return res.status(404).json({ message: "Chain not found" });
    }

    const provider = new JsonRpcProvider(chain.provider);
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "user account not found" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Mismo criterio que en send(): reservar despues de validar y antes de
    // firmar. La huella incluye el contrato, asi que el mismo sello usado para
    // otro token se detecta como conflicto en vez de devolver el hash de un
    // envio distinto.
    quien = address;
    if (sello) {
      const reserva = await reservar(sello, quien, {
        chain_id, recipientAddress, amount, tokenContractAddress,
      });
      const respuesta = responderSiCorresponde(res, reserva);
      if (respuesta) return respuesta;
    }

    const decryptedPrivateKey = descifrarLlavePrivada(user.privateKey);
    const wallet = new Wallet(decryptedPrivateKey, provider);
    const nonce = await provider.getTransactionCount(wallet.address, "latest");
    const amount1 = parseEther(amount).toString();
    const tokenContract = new Contract(tokenContractAddress, abi, wallet);

    // Igual que en send(). Eran 600 gwei fijos, 6,5 veces lo acordado.
    const gasPriceWei = await precioDeGas(provider);
    const gasLimit = await limiteDeGas(
      provider,
      {
        from: wallet.address,
        to: tokenContractAddress,
        data: tokenContract.interface.encodeFunctionData("transfer", [
          recipientAddress,
          amount1,
        ]),
      },
      LIMITE_POR_OMISION_TOKEN
    );
    const data = {
      gasPrice: gasPriceWei,
      gasLimit: gasLimit,
      nonce: nonce,
    };
    console.log(data);

    const transferTx = await tokenContract.transfer(recipientAddress, amount1, {
      gasPrice: gasPriceWei,
      gasLimit: gasLimit,
      nonce: nonce,
    });

    // La misma comision, en ORIGEN, aunque lo enviado sea un token: es fija.
    const hashComision = await cobrarComision(wallet, nonce + 1);


    // Mismo criterio que en send(): no se espera el minado. Ademas, antes se
    // respondia ANTES de guardar el registro — si el guardado fallaba, el
    // usuario ya tenia su "ok" y el movimiento no existia en el historial.
    const newTransaction = new Tx({
      amount: amount1,
      recipient: recipientAddress,
      hash: transferTx.hash,
      chain_id: chain_id,
      coin: tokenContractAddress,
    });
    user.transaction.push(newTransaction);
    await Promise.all([user.save(), newTransaction.save()]);

    const salida = {
      hash: transferTx.hash,
      from: wallet.address,
      to: recipientAddress,
      amount,
      chain_id,
      contract: tokenContractAddress,
      status: "pending",
      comision: comisionEnOrigen(),
      hashComision,
    };
    if (sello) await completar(sello, quien, salida);
    return res.json(salida);
  } catch (error) {
    if (sello && quien) {
      await marcarFallo(sello, quien, error, seSabeQueNoSalio(error)).catch(() => {});
    }
    return responderErrorEnvio(res, error);
  }
};
