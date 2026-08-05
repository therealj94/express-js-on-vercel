// Fragmento de controller/transactionController.js del backend de Veta Wallet,
// tal como quedo desplegado (release 58). Se guarda aqui porque el codigo del
// backend no vive en este repositorio: si hubiera que rehacerlo, esto es lo que
// hay que volver a poner.
//
// Lo que importa del orden: reservar DESPUES de validar (para que una
// contraseña mal escrita no queme el sello) y ANTES de firmar (para que dos
// peticiones simultaneas no transfieran las dos).

export const send = async (req, res) => {
  // El sello vive fuera del try para poder liberarlo en el catch.
  let sello = null;
  let quien = null;
  try {
    const { chain_id, recipientAddress, password, amount, idempotencyKey } = req.body;
    sello = idempotencyKey || null;

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
    const gasLimit = 210000;
    const nonce = await provider.getTransactionCount(wallet.address, "latest");
    const gasPriceGwei = 400;
    const gasPriceWei = gasPriceGwei * 10 ** 9;

    const data = {
      to: recipientAddress,
      value: parseEther(amount).toString(),
      gasLimit: gasLimit,
      nonce: nonce,
      gasPrice: gasPriceWei,
    };

    const transaction = await wallet.sendTransaction(data);

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
    sello = idempotencyKey || null;

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
    const gasLimit = 210000;
    const nonce = await provider.getTransactionCount(wallet.address, "latest");
    const amount1 = parseEther(amount).toString();
    const tokenContract = new Contract(tokenContractAddress, abi, wallet);

    const gasPriceGwei = 600;
    const gasPriceWei = gasPriceGwei * 10 ** 9;
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
