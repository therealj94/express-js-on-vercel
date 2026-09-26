/* Panel de emisión y quema · SFSP-410.
 *
 * MODO PRUEBA: firma enviando eth_sendTransaction al nodo local con una cuenta
 * desbloqueada (sintética). El modo no-prueba queda sólo como punto de extensión
 * de la abstracción `Firma` (billetera del navegador / hardware / multisig); no
 * hay configuración de producción en este panel.
 *
 * El digest de cada orden se calcula AQUÍ, igual que test/orden-autorizada.js
 * (digestDe) y src/lib/SFSPAuthorization.sol (digestOf). */
"use strict";

(async function () {
  const E = window.ethers;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  if (!E) {
    document.body.insertAdjacentHTML("afterbegin", '<div class="aviso">No se pudo cargar ethers v6 (vendor/ni CDN).</div>');
    return;
  }

  // ---------------------------------------------------------------- constantes SFSP-AUTH-v1
  const ZERO32 = "0x" + "00".repeat(32);
  const ZERO_ADDR = "0x" + "00".repeat(20);
  const coder = E.AbiCoder.defaultAbiCoder();
  const ETIQUETA_DOMINIO = E.keccak256(E.toUtf8Bytes("SFSP-AUTH-v1"));
  const TYPEHASH_PAYLOAD = E.keccak256(
    E.toUtf8Bytes(
      "SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action," +
        "bytes32 assetId,address origin,address destination,uint256 amount," +
        "uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)",
    ),
  );
  const TIPOS = [
    "bytes32", "bytes32", "uint256", "address", "bytes32", "bytes32",
    "address", "address", "uint256", "uint256", "bytes32", "uint64", "uint64", "bytes32",
  ];
  const TAG_CUPO_EMISION = E.keccak256(E.toUtf8Bytes("SFSP.MINT_BUDGET.TERMS.v1"));
  const TAG_CUPO_LIBERACION = E.keccak256(E.toUtf8Bytes("SFSP.RELEASE_BUDGET.TERMS.v1"));

  /** bytes32("TEXTO") igual que en Solidity: relleno a la derecha. */
  function b32(text) {
    const raw = E.toUtf8Bytes(text);
    if (raw.length > 32) throw new Error("Texto demasiado largo para bytes32 (máx. 32 bytes): " + text);
    const out = new Uint8Array(32);
    out.set(raw, 0);
    return E.hexlify(out);
  }
  /** Texto corto → bytes32; texto largo → keccak256 del texto. */
  function raizDeTexto(text) {
    const t = String(text || "").trim();
    if (!t) return ZERO32;
    return E.toUtf8Bytes(t).length <= 32 ? b32(t) : E.keccak256(E.toUtf8Bytes(t));
  }
  function txt(h) {
    if (!h || h === ZERO32) return "—";
    try {
      const bytes = E.getBytes(h);
      let end = bytes.length;
      while (end > 0 && bytes[end - 1] === 0) end--;
      const s = E.toUtf8String(bytes.slice(0, end));
      if (/^[\x20-\x7e -ɏ]+$/.test(s)) return s;
    } catch (_) { /* no es texto */ }
    return corto(h);
  }
  const corto = (h) => (h && h.length > 14 ? h.slice(0, 8) + "…" + h.slice(-6) : h);
  const nonceAleatorio = () => E.hexlify(E.randomBytes(32));

  /** Los campos, en el orden exacto de la struct de Solidity (= OA.tupla). */
  function tupla(p) {
    return [
      String(p.chainId), p.verifyingContract, p.action, p.assetId, p.origin, p.destination,
      String(p.amount), String(p.amountSecondary), p.nonce, String(p.notBefore), String(p.expiry), p.evidenceRoot,
    ];
  }
  /** = OA.digestDe(p) */
  function digestDe(p) {
    return E.keccak256(
      coder.encode(TIPOS, [
        ETIQUETA_DOMINIO, TYPEHASH_PAYLOAD, String(p.chainId), p.verifyingContract, p.action, p.assetId,
        p.origin, p.destination, String(p.amount), String(p.amountSecondary), p.nonce,
        String(p.notBefore), String(p.expiry), p.evidenceRoot,
      ]),
    );
  }
  function raizTerminos(tag, period, validUntil, docRoot) {
    return E.keccak256(coder.encode(["bytes32", "uint64", "uint64", "bytes32"], [tag, String(period), String(validUntil), docRoot]));
  }

  // ---------------------------------------------------------------- configuración
  let cfg;
  try {
    cfg = await (await fetch("config.json", { cache: "no-store" })).json();
  } catch (e) {
    $("#kpis-estado").innerHTML =
      '<div class="mal">No se encontró config.json. Ejecute primero <span class="mono">npx hardhat run scripts/demo-panel.js --network localhost</span>.</div>';
    return;
  }
  const PRUEBA = cfg.mode === "prueba";
  $("#modo").textContent = PRUEBA ? "MODO PRUEBA" : "MODO " + String(cfg.mode).toUpperCase();
  $("#aviso-rpc").textContent = cfg.rpc.replace(/^https?:\/\//, "") + " · chainId " + cfg.chainId;
  if (PRUEBA) $("#reloj-prueba").classList.remove("oculto");

  const red = E.Network.from(Number(cfg.chainId));
  const provider = new E.JsonRpcProvider(cfg.rpc, red, { staticNetwork: red, pollingInterval: 1500 });

  // Salvaguarda: el modo prueba sólo habla con un nodo local de Hardhat.
  const chainReal = Number(await provider.send("eth_chainId", []).catch(() => "0x0"));
  if (PRUEBA && (chainReal !== 31337 || Number(cfg.chainId) !== 31337)) {
    $("#kpis-estado").innerHTML = `<div class="mal">Modo prueba rechazado: el nodo responde chainId ${chainReal}. Sólo se admite el nodo local de Hardhat (31337).</div>`;
    return;
  }

  /* Abstracción de firma. En prueba: cuentas desbloqueadas del nodo local vía
     eth_sendTransaction. Fuera de prueba (futuro): billetera del navegador —
     en producción, hardware wallet / multisig; aquí NO se implementa. */
  const Firma = {
    async signerPara(address) {
      if (PRUEBA) return provider.getSigner(address);
      if (!window.ethereum) throw new Error("Se requiere una billetera (hardware/multisig) conectada al navegador.");
      const bp = new E.BrowserProvider(window.ethereum);
      return bp.getSigner();
    },
  };

  const A = cfg.addresses;
  const gov = new E.Contract(A.governance, cfg.abis.governance, provider);
  const iss = new E.Contract(A.issuance, cfg.abis.issuance, provider);
  const vault = new E.Contract(A.nativeVault, cfg.abis.nativeVault, provider);
  const activos = cfg.assets.map((a) => ({
    ...a,
    c: new E.Contract(a.contract, a.kind === "native" ? cfg.abis.nativeVault : cfg.abis.asset, provider),
  }));
  const activoPorId = (id) => activos.find((a) => a.id.toLowerCase() === String(id).toLowerCase());
  const tokens = activos.filter((a) => a.kind === "token");
  const nativo = activos.find((a) => a.kind === "native");

  // Interfaz combinada de errores de todos los contratos (incluidos los de la biblioteca).
  const erroresIface = (() => {
    const vistos = new Set();
    const frags = [];
    for (const abi of Object.values(cfg.abis)) {
      for (const f of abi) {
        if (f.type !== "error") continue;
        const firma = f.name + "(" + f.inputs.map((i) => i.type).join(",") + ")";
        if (vistos.has(firma)) continue;
        vistos.add(firma);
        frags.push(f);
      }
    }
    return new E.Interface(frags);
  })();

  const etiquetas = new Map();
  for (const acc of cfg.accounts) {
    const k = acc.address.toLowerCase();
    etiquetas.set(k, etiquetas.has(k) ? etiquetas.get(k) + " / " + acc.label : acc.label);
  }
  etiquetas.set(A.nativeVault.toLowerCase(), "Bóveda ORIGEN");
  etiquetas.set(A.issuance.toLowerCase(), "Controlador de emisión");
  etiquetas.set(A.governance.toLowerCase(), "Gobierno");
  for (const a of tokens) etiquetas.set(a.contract.toLowerCase(), "Contrato " + a.symbol);
  const lbl = (addr) => (addr ? etiquetas.get(String(addr).toLowerCase()) || corto(addr) : "—");
  const usuarios = cfg.accounts.filter((a) => a.role === "usuario");
  const tesoreria = cfg.accounts.find((a) => a.role === "tesoreria");

  // ---------------------------------------------------------------- formato
  const nf = (n, max) => Number(n).toLocaleString("es-ES", { maximumFractionDigits: max === undefined ? 2 : max });
  function cant(v, dec, max) {
    const s = E.formatUnits(BigInt(v), dec);
    const [ent, frac = ""] = s.split(".");
    const entFmt = BigInt(ent).toLocaleString("es-ES");
    const f = frac.replace(/0+$/, "").slice(0, max === undefined ? 2 : max);
    return f ? entFmt + "," + f : entFmt;
  }
  const cantActivo = (a, v) => (a ? cant(v, a.decimals) + " " + a.symbol : String(v));
  const fecha = (ts) => (Number(ts) ? new Date(Number(ts) * 1000).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—");
  function duracion(s) {
    s = Number(s);
    if (s <= 0) return "0 s";
    if (s % 86400 === 0) return s / 86400 === 1 ? "1 día" : s / 86400 + " días";
    if (s % 3600 === 0) return s / 3600 + " h";
    if (s >= 3600) return Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min";
    if (s >= 60) return Math.round(s / 60) + " min";
    return s + " s";
  }
  const pct = (a, b) => (BigInt(b) === 0n ? 0 : Math.min(100, Number((BigInt(a) * 10000n) / BigInt(b)) / 100));

  // ---------------------------------------------------------------- toasts y errores
  function toast(tipo, titulo, detalle, ms) {
    const el = document.createElement("div");
    el.className = "toast " + (tipo || "");
    el.innerHTML = `<div class="t">${esc(titulo)}</div>${detalle ? `<div class="d">${esc(detalle)}</div>` : ""}`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms || (tipo === "error" ? 11000 : 6000));
  }

  const MOTIVOS = {
    BudgetNotSet: "No hay cupo vigente para este activo: la emisión bajo demanda está bloqueada.",
    BudgetExpired: "El cupo venció.",
    BudgetPeriodExceeded: "Se agotó el cupo del periodo en curso.",
    BudgetOperationTooLarge: "El monto supera el máximo por operación del cupo.",
    BudgetWaitPending: "La espera (timelock) desde la propuesta aún no ha terminado.",
    BudgetTermsMismatch: "Los términos del cupo no coinciden con los aprobados.",
    BudgetInvalid: "Parámetros del cupo u operación inválidos.",
    MintToInternalAccount: "No se acuña hacia una cuenta interna (SFSP-410: nada de inventario).",
    ReleaseToInternalAccount: "No se libera ORIGEN hacia una cuenta interna.",
    OperationReplay: "Esa referencia de pago u operación ya se usó.",
    Paused: "Gobierno en pausa de emergencia: no se emite ni se libera.",
    Unauthorized: "La cuenta seleccionada no tiene el rol necesario.",
    NotSigner: "Sólo un firmante de gobierno puede hacer esto.",
    ProposerCannotApprove: "Quien propone no puede aprobar su propia propuesta (separación de funciones).",
    AlreadyApprovedAuthorization: "Este firmante ya aprobó esta propuesta.",
    AuthorizationDuplicate: "Ese digest ya fue propuesto.",
    AuthorizationUnknown: "Ese digest no está propuesto.",
    AuthorizationSpent: "La autorización ya se gastó.",
    AuthorizationQuorumNotReached: "Aún no hay quórum.",
    MintNotAuthorized: "La propuesta no tiene quórum (o ya se gastó).",
    ReleaseNotAuthorized: "La liberación no tiene quórum (o ya se gastó).",
    BurnNotAuthorized: "La quema no tiene consentimiento del titular ni aprobación de gobierno.",
    AuthorizationActionMismatch: "La acción aprobada no corresponde a esta operación.",
    AuthorizationAssetMismatch: "El activo de la orden no corresponde a este contrato.",
    AuthorizationDigestMismatch: "El contenido no coincide con el digest aprobado.",
    AuthorizationExpired: "La orden venció (expiry).",
    AuthorizationNotYetValid: "La orden aún no es válida (notBefore).",
    AuthorizationMalformed: "Orden mal formada.",
    AuthorizationConsumed: "La orden ya se ejecutó.",
    OutstandingLimitExceeded: "Se superaría el tope de stock del instrumento.",
    CumulativeIssuanceCapExceeded: "Se superaría el tope acumulado de emisión.",
    LimitsNotFixed: "Los límites del instrumento no están fijados.",
    InsufficientBalance: "Saldo insuficiente del titular.",
    InsufficientVaultBalance: "La bóveda no tiene saldo suficiente.",
    ReleaseRejected: "El destino no es elegible.",
    TransferRejected: "Operación rechazada por la política del activo.",
    PauseExpiryInvalid: "Duración de pausa inválida (supera el máximo).",
    PauseReasonRequired: "La pausa requiere motivo.",
    InternalAccountUnflagNeedsBoard: "Sólo la Junta puede desmarcar una cuenta interna.",
    PaymentReferenceRequired: "Falta la referencia de pago.",
    TransferFailed: "La transferencia nativa falló.",
  };

  function buscarDatosRevert(e) {
    const vistos = new Set();
    const cola = [e];
    while (cola.length) {
      const o = cola.shift();
      if (!o || typeof o !== "object" || vistos.has(o)) continue;
      vistos.add(o);
      if (typeof o.data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(o.data)) return o.data;
      for (const k of ["info", "error", "payload", "cause", "data"]) {
        if (o[k] && typeof o[k] === "object") cola.push(o[k]);
      }
    }
    return null;
  }
  function fmtArg(tipo, v) {
    if (tipo === "bytes32") return txt(v);
    if (tipo === "address") return lbl(v);
    if (tipo === "uint64" && Number(v) > 1e9 && Number(v) < 1e10) return fecha(v);
    return String(v);
  }
  function explicarError(e) {
    const data = buscarDatosRevert(e);
    if (data) {
      if (data.startsWith("0x08c379a0")) {
        const [msg] = coder.decode(["string"], "0x" + data.slice(10));
        return { titulo: "Rechazada: " + msg.replace(/^SFSP:\s*/, ""), detalle: "require: " + msg };
      }
      if (data.startsWith("0x4e487b71")) return { titulo: "Error aritmético en el contrato (panic)", detalle: data };
      try {
        const pe = erroresIface.parseError(data);
        if (pe) {
          const args = pe.fragment.inputs.map((inp, i) => fmtArg(inp.type, pe.args[i])).join(", ");
          return { titulo: MOTIVOS[pe.name] || "Rechazada: " + pe.name, detalle: `${pe.name}(${args})` };
        }
      } catch (_) { /* selector desconocido */ }
      return { titulo: "La transacción revirtió", detalle: "selector " + data.slice(0, 10) };
    }
    const m = String((e && (e.shortMessage || e.message)) || e);
    const cm = m.match(/custom error '([A-Za-z0-9_]+)/);
    if (cm) return { titulo: MOTIVOS[cm[1]] || "Rechazada: " + cm[1], detalle: m.slice(0, 240) };
    const rs = m.match(/reason string '([^']+)'/);
    if (rs) return { titulo: "Rechazada: " + rs[1].replace(/^SFSP:\s*/, ""), detalle: m.slice(0, 240) };
    return { titulo: "Error", detalle: m.slice(0, 300) };
  }

  // ---------------------------------------------------------------- actor
  const ALMACEN_ACTOR = "sfsp-panel:actor";
  const selActor = $("#actor");
  selActor.innerHTML = cfg.accounts
    .map((a, i) => `<option value="${i}">${esc(a.label)} · ${esc(corto(a.address))}</option>`)
    .join("");
  try {
    const g = localStorage.getItem(ALMACEN_ACTOR);
    if (g !== null && cfg.accounts[Number(g)]) selActor.value = g;
  } catch (_) { /* almacenamiento no disponible */ }
  const actor = () => cfg.accounts[Number(selActor.value)].address;
  async function pintarRolActor() {
    const a = actor();
    const roles = [];
    try {
      if (await gov.isSigner(a)) roles.push("firmante de gobierno");
      if (await iss.hasRole(await iss.DBNX_BOARD(), a)) roles.push("Junta");
      if (await iss.hasRole(await iss.ISSUER(), a)) roles.push("emisor");
    } catch (_) { /* nodo caído */ }
    $("#actor-rol").textContent = roles.length ? roles.join(" · ") : "sin roles de gobierno";
  }
  selActor.addEventListener("change", () => {
    try { localStorage.setItem(ALMACEN_ACTOR, selActor.value); } catch (_) { /* ignora */ }
    pintarRolActor();
  });

  // ---------------------------------------------------------------- envío de transacciones
  async function enviar(contrato, fn, args, opts) {
    const o = opts || {};
    const from = o.from || actor();
    const extra = o.value ? { value: o.value } : {};
    try {
      const signer = await Firma.signerPara(from);
      const c = contrato.connect(signer);
      // Simulación previa: devuelve el motivo exacto del revert antes de firmar.
      await c[fn].staticCall(...args, extra);
      const tx = await c[fn](...args, { ...extra, gasLimit: 8_000_000n });
      const rc = await tx.wait();
      toast("ok", o.ok || "Transacción confirmada", `${fn} · ${lbl(from)} · bloque ${rc.blockNumber}`);
      await refrescar(true);
      return rc;
    } catch (e) {
      const x = explicarError(e);
      toast("error", x.titulo, `${fn} como ${lbl(from)} — ${x.detalle}`);
      console.warn(fn, e);
      throw e;
    }
  }
  async function conBoton(btn, f) {
    if (btn) btn.disabled = true;
    try { return await f(); } catch (_) { return null; } finally { if (btn) btn.disabled = false; }
  }

  // ---------------------------------------------------------------- lecturas de estado
  const S = { bloque: 0, ahora: 0, quorum: 0n, firmantes: 0n, espera: 0n, pausa: false };

  async function tiempoCadena() {
    const b = await provider.send("eth_getBlockByNumber", ["latest", false]);
    return { numero: Number(b.number), ts: Number(b.timestamp) };
  }

  async function leerEstado() {
    const t = await tiempoCadena();
    S.bloque = t.numero;
    S.ahora = t.ts;
    [S.quorum, S.firmantes, S.espera, S.pausa] = await Promise.all([
      gov.quorumThreshold(), gov.signerCount(), gov.timelockDelay(), gov.isPaused(),
    ]);
    let motivo = "", vence = 0n;
    if (S.pausa) [motivo, vence] = await gov.pauseReason();
    $("#kpis-estado").innerHTML = [
      kpi("Red", `chainId ${cfg.chainId}`, PRUEBA ? "nodo local · prueba" : cfg.rpc),
      kpi("Bloque", "#" + S.bloque.toLocaleString("es-ES"), "hora de cadena " + fecha(S.ahora)),
      kpi(
        "Gobierno",
        S.pausa ? '<span class="mal">EN PAUSA</span>' : '<span class="ok">Operativo</span>',
        S.pausa ? `${esc(txt(motivo))} · hasta ${fecha(vence)}` : "sin pausa de emergencia",
      ),
      kpi("Quórum", `${S.quorum} de ${S.firmantes}`, "el proponente no cuenta"),
      kpi("Espera (timelock)", duracion(S.espera), "para cupos, desde la propuesta"),
    ].join("");
  }
  const kpi = (k, v, s) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${s || ""}</div></div>`;

  // Cuentas internas del controlador de emisión: no hay lista on-chain, se
  // reconstruye desde los eventos y se confirma con isInternalAccount.
  async function internasEmision() {
    const ev = iss.interface.getEvent("InternalAccountFlagged");
    const logs = await provider.getLogs({ address: A.issuance, topics: [ev.topicHash], fromBlock: cfg.deployBlock || 0, toBlock: "latest" });
    const cuentas = new Set(logs.map((l) => E.getAddress("0x" + l.topics[1].slice(26))));
    const out = [];
    for (const c of cuentas) if (await iss.isInternalAccount(c)) out.push(c);
    return out;
  }

  function bloqueCupo(a, b, restante, esNativo) {
    const period = BigInt(b.period);
    if (period === 0n) {
      return `<div class="cupo"><div class="cupo-cab"><b>Cupo ${esNativo ? "de liberación" : "de emisión"}</b></div>
        <div class="sin-cupo">Sin cupo vigente — ${esNativo ? "la liberación" : "la emisión"} bajo demanda está bloqueada.
        Se fija con una propuesta ${esNativo ? "SET_RELEASE_BUDGET" : "SET_MINT_BUDGET"} (quórum + espera).</div></div>`;
    }
    const idx = BigInt(S.ahora) / period;
    const usado = idx === BigInt(b.periodIndex) ? BigInt(b.usedInPeriod) : 0n;
    const vencido = S.ahora >= Number(b.validUntil);
    const p = pct(usado, b.perPeriod);
    return `<div class="cupo">
      <div class="cupo-cab"><b>Cupo ${esNativo ? "de liberación" : "de emisión"}</b>
        <span class="${vencido ? "mal" : "ok"}">${vencido ? "vencido" : "vigente"} · periodo de ${duracion(period)}</span></div>
      <div class="cuatro">
        <div class="met"><div class="k">Por periodo</div><div class="v">${cantActivo(a, b.perPeriod)}</div></div>
        <div class="met"><div class="k">Usado</div><div class="v">${cantActivo(a, usado)}</div></div>
        <div class="met"><div class="k">Restante</div><div class="v">${cantActivo(a, restante)}</div></div>
        <div class="met"><div class="k">Vence</div><div class="v">${fecha(b.validUntil)}</div></div>
      </div>
      <div class="barra-prog ${p > 85 ? "alta" : ""}"><div style="width:${p}%"></div></div>
      <div class="nota" style="margin:6px 0 0">Máximo por operación: ${cantActivo(a, b.maxPerOperation)}</div>
    </div>`;
  }

  async function tarjetaToken(a) {
    const [supply, lim, emitido, cupo, restante, internas] = await Promise.all([
      a.c.totalSupply(), iss.limitsOf(a.id), iss.cumulativeIssued(a.id), iss.mintBudgetOf(a.id),
      iss.budgetRemaining(a.id), internasEmision(),
    ]);
    const saldosUsuarios = await Promise.all(usuarios.map((u) => a.c.balanceOf(u.address)));
    const sumaUsuarios = saldosUsuarios.reduce((x, y) => x + BigInt(y), 0n);
    const saldosInternas = await Promise.all(internas.map((c) => a.c.balanceOf(c)));
    const cuadra = sumaUsuarios === BigInt(supply);
    return `<article class="activo" data-activo="${esc(a.id)}">
      <div class="activo-cab"><span class="nombre">${esc(a.label)}</span><span class="tipo">token regulado · ${esc(corto(a.contract))}</span></div>
      <div class="grande"><div class="k">Circulante (totalSupply)</div>
        <div class="v" data-circulante>${cant(supply, a.decimals)}<span class="u">${esc(a.symbol)}</span></div></div>
      <div class="nota" style="margin:0">${cuadra ? '<span class="ok">✓</span>' : '<span class="alerta">≠</span>'}
        Suma de usuarios conocidos: ${cantActivo(a, sumaUsuarios)} (${usuarios.map((u, i) => esc(u.label.replace("Usuario ", "")) + " " + cant(saldosUsuarios[i], a.decimals)).join(" · ")})</div>
      <div class="metricas">
        <div class="met"><div class="k">Tope de stock</div><div class="v">${lim.configured ? cantActivo(a, lim.outstandingLimit) : '<span class="alerta">sin fijar</span>'}</div>
          ${lim.configured ? `<div class="barra-prog"><div style="width:${pct(supply, lim.outstandingLimit)}%"></div></div>` : ""}</div>
        <div class="met"><div class="k">Emitido acumulado / tope acumulado</div><div class="v">${cant(emitido, a.decimals)} / ${lim.configured ? cantActivo(a, lim.cumulativeCap) : "—"}</div>
          ${lim.configured ? `<div class="barra-prog"><div style="width:${pct(emitido, lim.cumulativeCap)}%"></div></div>` : ""}</div>
      </div>
      ${bloqueCupo(a, cupo, restante, false)}
      <div class="internas">Cuentas internas marcadas (no reciben emisión):
        ${internas.length ? internas.map((c, i) => `<span class="pill">${esc(lbl(c))} · ${cant(saldosInternas[i], a.decimals)}</span>`).join("") : "ninguna"}</div>
    </article>`;
  }

  async function tarjetaNativo(a) {
    const [circ, genesis, boveda, fuera, liberado, absorbido, cupo, restante, internas] = await Promise.all([
      vault.circulating(), vault.genesisSupply(), vault.vaultBalance(), vault.internalOutsideVault(),
      vault.totalReleased(), vault.totalAbsorbed(), vault.releaseBudget(), vault.budgetRemaining(), vault.internalAccounts(),
    ]);
    return `<article class="activo" data-activo="${esc(a.id)}">
      <div class="activo-cab"><span class="nombre">${esc(a.label)}</span><span class="tipo">moneda nativa · bóveda sellada ${esc(corto(a.contract))}</span></div>
      <div class="grande"><div class="k">Circulante (génesis − bóveda − internas)</div>
        <div class="v" data-circulante>${cant(circ, 18)}<span class="u">${esc(a.symbol)}</span></div></div>
      <div class="metricas">
        <div class="met"><div class="k">Sellado en bóveda</div><div class="v" data-boveda>${cantActivo(a, boveda)}</div></div>
        <div class="met"><div class="k">Internas fuera de la bóveda</div><div class="v">${cantActivo(a, fuera)}</div></div>
        <div class="met"><div class="k">Génesis (simulado)</div><div class="v">${cantActivo(a, genesis)}</div></div>
        <div class="met"><div class="k">Liberado / absorbido (total)</div><div class="v">${cant(liberado, 18)} / ${cant(absorbido, 18)}</div></div>
      </div>
      ${bloqueCupo(a, cupo, restante, true)}
      <div class="internas">Cuentas internas marcadas (cuentan como no circulante):
        ${internas.length ? internas.map((c) => `<span class="pill">${esc(lbl(c))}</span>`).join("") : "ninguna"}</div>
    </article>`;
  }

  async function leerSuministro() {
    const html = await Promise.all(activos.map((a) => (a.kind === "native" ? tarjetaNativo(a) : tarjetaToken(a))));
    $("#activos").innerHTML = html.join("");
  }

  // ---------------------------------------------------------------- propuestas: almacén local
  const CLAVE = `sfsp-panel:propuestas:${cfg.chainId}:${A.governance.toLowerCase()}`;
  function propuestasLocales() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (_) { return {}; }
  }
  function guardarPropuesta(digest, reg) {
    try {
      const m = propuestasLocales();
      m[digest.toLowerCase()] = reg;
      localStorage.setItem(CLAVE, JSON.stringify(m));
    } catch (_) {
      toast("error", "No se pudo guardar la orden en este navegador", "Sin el contenido, «Ejecutar» no podrá reconstruir la tupla.");
    }
  }

  // ---------------------------------------------------------------- propuestas: formulario
  const opcionesActivos = (lista) => lista.map((a) => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join("");
  const opcionesCuentas = (lista) => lista.map((a) => `<option value="${esc(a.address)}">${esc(a.label)}</option>`).join("");
  const selPeriodo = `<select name="periodo"><option value="3600">1 hora</option><option value="86400" selected>1 día</option><option value="604800">1 semana</option></select>`;

  const CAMPOS = {
    SET_MINT_BUDGET: () => `
      <label>Activo <select name="activo">${opcionesActivos(tokens)}</select></label>
      <div class="dos-campos">
        <label>Cupo por periodo <input name="porPeriodo" value="10000"></label>
        <label>Máximo por operación <input name="maxOp" value="2500"></label>
      </div>
      <div class="dos-campos">
        <label>Duración del periodo ${selPeriodo}</label>
        <label>Vigencia (días) <input name="dias" value="30"></label>
      </div>
      <label>Documento de respaldo (acta) <input name="acta" value="acta_junta_cupo_1"></label>`,
    SET_RELEASE_BUDGET: () => `
      <div class="dos-campos">
        <label>Cupo por periodo (ORIGEN) <input name="porPeriodo" value="50"></label>
        <label>Máximo por operación <input name="maxOp" value="10"></label>
      </div>
      <div class="dos-campos">
        <label>Duración del periodo ${selPeriodo}</label>
        <label>Vigencia (días) <input name="dias" value="30"></label>
      </div>
      <label>Documento de respaldo (acta) <input name="acta" value="acta_junta_cupo_origen"></label>`,
    BURN: () => `
      <label>Activo <select name="activo">${opcionesActivos(tokens)}</select></label>
      <div class="dos-campos">
        <label>Titular <select name="titular">${opcionesCuentas(usuarios.concat(tesoreria ? [tesoreria] : []))}</select></label>
        <label>Monto <input name="monto" value="50"></label>
      </div>
      <label>Motivo (va en evidenceRoot) <input name="motivo" value="ORDEN_JUDICIAL_DEMO"></label>`,
    RELEASE_NATIVE: () => `
      <div class="dos-campos">
        <label>Destino <select name="destino">${opcionesCuentas(usuarios.concat(tesoreria ? [tesoreria] : []))}</select></label>
        <label>Monto (ORIGEN) <input name="monto" value="5"></label>
      </div>
      <label>Evidencia / acta (va en evidenceRoot) <input name="evidencia" value="acta_liberacion_1"></label>`,
  };

  const form = $("#form-propuesta");
  const selAccion = $("#p-accion");
  let borrador = null;
  function pintarCampos() {
    $("#p-campos").innerHTML = CAMPOS[selAccion.value]();
    invalidarBorrador();
  }
  function invalidarBorrador() {
    borrador = null;
    $("#p-proponer").disabled = true;
    $("#p-vista").classList.add("oculto");
  }
  selAccion.addEventListener("change", pintarCampos);
  $("#p-campos").addEventListener("input", invalidarBorrador);
  $("#p-campos").addEventListener("change", invalidarBorrador);
  pintarCampos();

  function montoUnidades(v, dec) {
    const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Monto inválido: " + v);
    const u = E.parseUnits(s, dec);
    if (u <= 0n) throw new Error("El monto debe ser mayor que cero.");
    return u;
  }

  async function construirOrden(accion, v) {
    const { ts } = await tiempoCadena();
    const base = {
      chainId: Number(cfg.chainId), verifyingContract: ZERO_ADDR, action: b32(accion), assetId: ZERO32,
      origin: ZERO_ADDR, destination: ZERO_ADDR, amount: "0", amountSecondary: "0", nonce: nonceAleatorio(),
      notBefore: ts - 60, expiry: ts + 86400, evidenceRoot: ZERO32,
    };
    const espera = Number(S.espera);
    if (accion === "SET_MINT_BUDGET" || accion === "SET_RELEASE_BUDGET") {
      const nat = accion === "SET_RELEASE_BUDGET";
      const a = nat ? nativo : activoPorId(v.activo);
      const period = Number(v.periodo);
      const dias = Number(v.dias);
      if (!(dias > 0)) throw new Error("Vigencia inválida.");
      const validUntil = ts + Math.round(dias * 86400);
      const docRoot = raizDeTexto(v.acta);
      if (docRoot === ZERO32) throw new Error("El cupo requiere un documento de respaldo.");
      const porPeriodo = montoUnidades(v.porPeriodo, a.decimals);
      const maxOp = montoUnidades(v.maxOp, a.decimals);
      if (maxOp > porPeriodo) throw new Error("El máximo por operación no puede superar el cupo por periodo.");
      const tag = nat ? TAG_CUPO_LIBERACION : TAG_CUPO_EMISION;
      const terms = raizTerminos(tag, period, validUntil, docRoot);
      // Comprobación cruzada contra el propio contrato (función pure).
      const enCadena = await (nat ? vault : iss).budgetTermsRoot(period, validUntil, docRoot);
      // El ejecutor del cupo de emisión es el controlador de emisión; el de
      // liberación, la bóveda. El payload queda atado a ESE contrato.
      const p = { ...base, verifyingContract: nat ? A.nativeVault : A.issuance, assetId: a.id, amount: porPeriodo.toString(), amountSecondary: maxOp.toString(),
        expiry: ts + espera + 86400, evidenceRoot: terms };
      return {
        p, accion, assetId: a.id, extra: { period, validUntil, docRoot, acta: v.acta }, terminosVerificados: enCadena === terms,
        resumen: `Autorizar un cupo de ${nat ? "liberación de ORIGEN desde la bóveda" : "emisión bajo demanda de " + a.label}: hasta ` +
          `${cantActivo(a, porPeriodo)} por periodo de ${duracion(period)}, máximo ${cantActivo(a, maxOp)} por operación, ` +
          `vigente hasta ${fecha(validUntil)}. Respaldo: «${v.acta}». Requiere quórum ${S.quorum} y una espera de ${duracion(espera)} ` +
          `desde la propuesta; la orden se puede ejecutar hasta ${fecha(p.expiry)}.`,
      };
    }
    if (accion === "BURN") {
      const a = activoPorId(v.activo);
      const amount = montoUnidades(v.monto, a.decimals);
      const motivo = raizDeTexto(v.motivo);
      if (motivo === ZERO32) throw new Error("La quema requiere motivo.");
      const p = { ...base, verifyingContract: a.contract, assetId: a.id, origin: E.getAddress(v.titular), amount: amount.toString(), evidenceRoot: motivo };
      return {
        p, accion, assetId: a.id, extra: { motivo: v.motivo },
        resumen: `Quemar ${cantActivo(a, amount)} del saldo de ${lbl(v.titular)} por decisión de gobierno (sin consentimiento del titular). ` +
          `Motivo: «${v.motivo}». Requiere quórum ${S.quorum}; la ejecuta el emisor hasta ${fecha(p.expiry)}.`,
      };
    }
    if (accion === "RELEASE_NATIVE") {
      const a = nativo;
      const amount = montoUnidades(v.monto, 18);
      const ev = raizDeTexto(v.evidencia);
      if (ev === ZERO32) throw new Error("La liberación requiere evidencia.");
      const p = { ...base, verifyingContract: a.contract, assetId: a.id, destination: E.getAddress(v.destino), amount: amount.toString(), evidenceRoot: ev };
      return {
        p, accion, assetId: a.id, extra: { evidencia: v.evidencia },
        resumen: `Liberar ${cantActivo(a, amount)} desde la bóveda sellada a ${lbl(v.destino)}. Evidencia: «${v.evidencia}». ` +
          `Requiere quórum ${S.quorum}; la ejecuta el emisor hasta ${fecha(p.expiry)}.`,
      };
    }
    throw new Error("Acción no soportada: " + accion);
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const v = Object.fromEntries(new FormData(form).entries());
      const o = await construirOrden(v.accion, v);
      o.digest = digestDe(o.p);
      borrador = o;
      const vista = $("#p-vista");
      vista.innerHTML = `
        <div class="resumen">${esc(o.resumen)}</div>
        <div class="nota" style="margin:0">Digest (SFSP-AUTH-v1, calculado en el navegador):</div>
        <div class="mono" id="p-digest">${esc(o.digest)}</div>
        ${o.terminosVerificados === undefined ? "" : `<div class="nota" style="margin:6px 0 0">${o.terminosVerificados ? '<span class="ok">✓</span> huella de términos idéntica a budgetTermsRoot() del contrato' : '<span class="mal">✗ la huella de términos no coincide con el contrato</span>'}</div>`}
        <details><summary>Payload completo</summary><pre>${esc(JSON.stringify(o.p, null, 2))}</pre></details>`;
      vista.classList.remove("oculto");
      $("#p-proponer").disabled = false;
    } catch (e) {
      toast("error", "No se pudo preparar la orden", e.message);
    }
  });

  $("#p-proponer").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      if (!borrador) return;
      const o = borrador;
      await enviar(gov, "proposeAuthorization", [o.digest, o.p.action], { ok: "Propuesta registrada" });
      guardarPropuesta(o.digest, { accion: o.accion, p: o.p, extra: o.extra, assetId: o.assetId, resumen: o.resumen, creada: Date.now() });
      invalidarBorrador();
      await leerPropuestas();
    }),
  );

  // ---------------------------------------------------------------- propuestas: lista
  const CON_ESPERA = new Set(["SET_MINT_BUDGET", "SET_RELEASE_BUDGET"]);
  async function leerPropuestas() {
    const ev = gov.interface.getEvent("AuthorizationProposed");
    const logs = await provider.getLogs({ address: A.governance, topics: [ev.topicHash], fromBlock: cfg.deployBlock || 0, toBlock: "latest" });
    const locales = propuestasLocales();
    const verEjecutadas = $("#ver-ejecutadas").checked;
    const filas = [];
    for (const l of logs.slice().reverse()) {
      const digest = l.topics[1];
      const r = await gov.authorizationOf(digest);
      const accion = txt(r.action);
      if (r.consumed && !verEjecutadas) continue;
      if (r.consumed && !locales[digest.toLowerCase()] && !CON_ESPERA.has(accion) && accion !== "BURN" && accion !== "RELEASE_NATIVE") continue;
      filas.push({ digest, r, accion, local: locales[digest.toLowerCase()] });
      if (filas.length >= 25) break;
    }
    const need = (r) => (BigInt(r.quorumAtProposal) > BigInt(S.quorum) ? BigInt(r.quorumAtProposal) : BigInt(S.quorum));
    const html = filas.map(({ digest, r, accion, local }) => {
      const n = need(r);
      const aprob = BigInt(r.approvals);
      const conQuorum = aprob >= n;
      const readyAt = Number(r.proposedAt) + Number(S.espera);
      const esperaPend = CON_ESPERA.has(accion) && S.ahora < readyAt;
      const vencida = local && S.ahora >= Number(local.p.expiry);
      let estado, clase;
      if (r.consumed) { estado = "ejecutada"; clase = "ok"; }
      else if (vencida) { estado = "vencida"; clase = "mal"; }
      else if (!conQuorum) { estado = `faltan ${n - aprob} aprobación(es)`; clase = "alerta"; }
      else if (esperaPend) { estado = `en espera · lista en ${duracion(readyAt - S.ahora)}`; clase = "alerta"; }
      else { estado = "lista para ejecutar"; clase = "ok"; }
      const votos = Array.from({ length: Number(n) }, (_, i) => `<i class="${BigInt(i) < aprob ? "si" : ""}"></i>`).join("");
      const puedeEjecutar = !!local && !r.consumed && !vencida;
      return `<div class="prop" data-digest="${esc(digest)}">
        <div class="prop-cab"><span class="accion">${esc(accion)}</span><span class="estado-prop ${clase}">${esc(estado)}</span></div>
        <div class="resumen">${local ? esc(local.resumen) : '<span class="nota">Contenido no disponible en este navegador (propuesta creada fuera del panel): sólo se conoce el digest.</span>'}</div>
        <div class="meta">
          <span>digest <span class="mono">${esc(corto(digest))}</span></span>
          <span>propone ${esc(lbl(r.proposer))}</span>
          <span>${fecha(r.proposedAt)}</span>
          <span>aprobaciones <span class="votos">${votos}</span> ${aprob}/${n}</span>
          ${CON_ESPERA.has(accion) ? `<span>lista desde ${fecha(readyAt)}</span>` : ""}
        </div>
        ${r.consumed ? "" : `<div class="fila-botones">
          <button class="mini sec" data-aprobar="${esc(digest)}">Aprobar</button>
          <button class="mini" data-ejecutar="${esc(digest)}" ${puedeEjecutar ? "" : "disabled"}>Ejecutar</button>
        </div>`}
      </div>`;
    });
    $("#lista-propuestas").innerHTML = html.length ? html.join("") : '<div class="vacio">No hay propuestas pendientes.</div>';
  }
  $("#ver-ejecutadas").addEventListener("change", leerPropuestas);

  async function ejecutarPropuesta(digest) {
    const r = propuestasLocales()[digest.toLowerCase()];
    if (!r) throw new Error("Sin contenido local para " + digest);
    const t = tupla(r.p);
    const ok = "Orden ejecutada";
    switch (r.accion) {
      case "SET_MINT_BUDGET":
        return enviar(iss, "setMintBudget", [t, digest, r.extra.period, r.extra.validUntil, r.extra.docRoot], { ok: "Cupo de emisión fijado" });
      case "SET_RELEASE_BUDGET":
        return enviar(vault, "setReleaseBudget", [t, digest, r.extra.period, r.extra.validUntil, r.extra.docRoot], { ok: "Cupo de liberación fijado" });
      case "BURN":
        return enviar(activoPorId(r.assetId).c, "burn", [t, digest], { ok: "Quema ejecutada" });
      case "RELEASE_NATIVE":
        return enviar(vault, "release", [t, digest], { ok: "ORIGEN liberado" });
      default:
        throw new Error("Acción no ejecutable desde el panel: " + r.accion);
    }
  }

  $("#lista-propuestas").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.aprobar) conBoton(b, () => enviar(gov, "approveAuthorization", [b.dataset.aprobar], { ok: "Aprobación registrada" }));
    if (b.dataset.ejecutar) conBoton(b, () => ejecutarPropuesta(b.dataset.ejecutar));
  });

  // ---------------------------------------------------------------- operación bajo demanda (demo)
  $("#op-activo").innerHTML = opcionesActivos(activos);
  $("#op-usuario").innerHTML = opcionesCuentas(usuarios);
  $("#rev-activo").innerHTML = opcionesActivos(activos);

  $("#op-pago").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      const a = activoPorId($("#op-activo").value);
      const dest = $("#op-usuario").value;
      let monto;
      try { monto = montoUnidades($("#op-monto").value, a.decimals); } catch (e) { toast("error", e.message); return; }
      const recibo = "RCB-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const paymentRef = E.keccak256(E.toUtf8Bytes(recibo));
      const evidencia = E.keccak256(E.toUtf8Bytes("evidencia-pago:" + recibo));
      if (a.kind === "native") {
        await enviar(vault, "releaseOnDemand", [dest, monto, paymentRef, evidencia], { ok: "Pago simulado: ORIGEN liberado al usuario" });
      } else {
        await enviar(iss, "mintOnDemand", [a.id, dest, monto, paymentRef, evidencia], { ok: "Pago simulado: emitido al usuario" });
      }
      $("#op-resultado").textContent = `Recibo ${recibo} → paymentRef ${paymentRef} · ${cantActivo(a, monto)} a ${lbl(dest)}`;
    }),
  );

  $("#op-redencion").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      const a = activoPorId($("#op-activo").value);
      const titular = $("#op-usuario").value;
      let monto;
      try { monto = montoUnidades($("#op-monto").value, a.decimals); } catch (e) { toast("error", e.message); return; }
      if (a.kind === "native") {
        // Quemar ORIGEN = devolverlo a la bóveda. Lo firma el propio usuario.
        await enviar(vault, "absorb", [b32("REDENCION")], { from: titular, value: monto, ok: "Redención: ORIGEN devuelto a la bóveda" });
        $("#op-resultado").textContent = `${lbl(titular)} devolvió ${cantActivo(a, monto)} a la bóveda (absorb).`;
        return;
      }
      const { ts } = await tiempoCadena();
      const p = {
        chainId: Number(cfg.chainId), verifyingContract: a.contract, action: b32("BURN"), assetId: a.id,
        origin: E.getAddress(titular), destination: ZERO_ADDR, amount: monto.toString(), amountSecondary: "0",
        nonce: nonceAleatorio(), notBefore: ts - 60, expiry: ts + 3600, evidenceRoot: b32("REDENCION"),
      };
      const d = digestDe(p);
      // 1) el titular consiente ESTA quema (activo, titular, monto, motivo, ventana)
      await enviar(a.c, "approveBurnAuthorization", [d], { from: titular, ok: "Consentimiento del titular registrado" });
      // 2) el emisor la ejecuta
      await enviar(a.c, "burn", [tupla(p), d], { ok: "Redención: quemado" });
      $("#op-resultado").textContent = `${lbl(titular)} redimió ${cantActivo(a, monto)} · digest ${d}`;
    }),
  );

  // ---------------------------------------------------------------- emergencia
  $("#rev-boton").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      const a = activoPorId($("#rev-activo").value);
      const motivo = b32($("#rev-motivo").value.trim() || "SIN_MOTIVO");
      if (!window.confirm(`¿Revocar el cupo de ${a.label} como ${lbl(actor())}? Efecto inmediato.`)) return;
      if (a.kind === "native") await enviar(vault, "revokeReleaseBudget", [motivo], { ok: "Cupo de liberación revocado" });
      else await enviar(iss, "revokeMintBudget", [a.id, motivo], { ok: "Cupo de emisión revocado" });
    }),
  );
  $("#pausa-boton").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      const motivo = b32($("#pausa-motivo").value.trim() || "INCIDENTE");
      const dur = Number($("#pausa-duracion").value);
      if (!window.confirm(`¿Pausa de emergencia de ${duracion(dur)} como ${lbl(actor())}?`)) return;
      await enviar(gov, "emergencyPause", [motivo, dur], { ok: "Pausa de emergencia activada" });
    }),
  );

  // ---------------------------------------------------------------- historial
  const CATEGORIA = {
    MintExecuted: "emision", MintOnDemand: "emision", NativeReleased: "emision", Released: "emision",
    BurnExecuted: "quema", NativeAbsorbed: "quema", Absorbed: "quema", BurnConsentGiven: "quema",
    MintBudgetSet: "cupo", MintBudgetRevoked: "cupo", ReleaseBudgetSet: "cupo", ReleaseBudgetRevoked: "cupo",
    InstrumentLimitsSet: "cupo", InternalAccountFlagged: "cupo", VaultInternalAccountFlagged: "cupo",
    AuthorizationProposed: "gobierno", AuthorizationApproved: "gobierno", AuthorizationConsumed: "gobierno", GovernanceAction: "gobierno",
  };
  const NOMBRE = {
    MintExecuted: "Emisión", MintOnDemand: "Emisión bajo demanda", NativeReleased: "Liberación ORIGEN", Released: "Liberación ORIGEN",
    BurnExecuted: "Quema", NativeAbsorbed: "Devuelto a bóveda", Absorbed: "Devuelto a bóveda", BurnConsentGiven: "Consentimiento de quema",
    MintBudgetSet: "Cupo de emisión fijado", MintBudgetRevoked: "Cupo de emisión revocado", ReleaseBudgetSet: "Cupo de liberación fijado",
    ReleaseBudgetRevoked: "Cupo de liberación revocado", InstrumentLimitsSet: "Límites del instrumento",
    InternalAccountFlagged: "Cuenta interna", VaultInternalAccountFlagged: "Cuenta interna (bóveda)",
    AuthorizationProposed: "Propuesta", AuthorizationApproved: "Aprobación", AuthorizationConsumed: "Orden ejecutada", GovernanceAction: "Acción de gobierno",
  };
  function describir(nombre, x, a) {
    const m = (v) => cantActivo(a, v);
    switch (nombre) {
      case "MintExecuted": return `${m(x.amount)} a ${lbl(x.destination)} · ruta ${txt(x.authorizationId)}`;
      case "MintOnDemand": return `${m(x.amount)} a ${lbl(x.destination)} · pago ${corto(x.paymentRef)} · usado en el periodo ${m(x.usedInPeriod)}`;
      case "NativeReleased": case "Released": return `${m(x.amount)} a ${lbl(x.destination)} · ruta ${txt(x.route)}`;
      case "BurnExecuted": return `${m(x.amount)} de ${lbl(x.from)} · motivo ${txt(x.reasonCode)}`;
      case "NativeAbsorbed": case "Absorbed": return `${m(x.amount)} de ${lbl(x.from)} · motivo ${txt(x.reasonCode)}`;
      case "BurnConsentGiven": return `${lbl(x.holder)} consiente la quema ${corto(x.digest)}`;
      case "MintBudgetSet": case "ReleaseBudgetSet":
        return `${m(x.perPeriod)} por ${duracion(x.period)}, máx. ${m(x.maxPerOperation)}/op, vence ${fecha(x.validUntil)} · acta ${txt(x.termsDocRoot)}`;
      case "MintBudgetRevoked": case "ReleaseBudgetRevoked": return `por ${lbl(x.by)} · motivo ${txt(x.reasonCode)}`;
      case "InstrumentLimitsSet": return `stock ${m(x.outstandingLimit)} · acumulado ${m(x.cumulativeIssuanceCap)}`;
      case "InternalAccountFlagged": case "VaultInternalAccountFlagged":
        return `${lbl(x.account)} ${x.internalAccount ? "marcada" : "desmarcada"} por ${lbl(x.by)} · ${txt(x.reasonCode)}`;
      case "AuthorizationProposed": return `${txt(x.action)} por ${lbl(x.proposer)} · ${corto(x.digest)}`;
      case "AuthorizationApproved": return `${lbl(x.signer)} (${x.approvals}) · ${corto(x.digest)}`;
      case "AuthorizationConsumed": return `por ${lbl(x.executor)} · ${corto(x.digest)}`;
      case "GovernanceAction": return `${txt(x.actionKind)} por ${lbl(x.actor)} · ${txt(x.detail)} · efectiva ${fecha(x.effectiveAt)}`;
      default: return "";
    }
  }
  const tsBloque = new Map();
  let filtroHist = "todo";
  let eventosCache = [];
  async function leerHistorial() {
    const fuentes = [
      { address: A.governance, iface: gov.interface },
      { address: A.issuance, iface: iss.interface },
      { address: A.nativeVault, iface: vault.interface, activo: nativo },
      ...tokens.map((t) => ({ address: t.contract, iface: t.c.interface, activo: t })),
    ];
    const todos = [];
    await Promise.all(fuentes.map(async (f) => {
      const logs = await provider.getLogs({ address: f.address, fromBlock: cfg.deployBlock || 0, toBlock: "latest" });
      for (const l of logs) {
        let pl = null;
        try { pl = f.iface.parseLog({ topics: l.topics, data: l.data }); } catch (_) { /* no es de este ABI */ }
        if (!pl || !CATEGORIA[pl.name]) continue;
        const x = {};
        pl.fragment.inputs.forEach((inp, i) => { x[inp.name] = pl.args[i]; });
        const a = (x.assetId && activoPorId(x.assetId)) || f.activo || tokens[0];
        todos.push({ nombre: pl.name, x, a, bloque: l.blockNumber, idx: l.index, tx: l.transactionHash });
      }
    }));
    const faltan = [...new Set(todos.map((e) => e.bloque))].filter((b) => !tsBloque.has(b));
    await Promise.all(faltan.map(async (b) => {
      const blk = await provider.send("eth_getBlockByNumber", ["0x" + b.toString(16), false]);
      tsBloque.set(b, Number(blk.timestamp));
    }));
    todos.sort((p, q) => q.bloque - p.bloque || q.idx - p.idx);
    eventosCache = todos;
    pintarHistorial();
  }
  function pintarHistorial() {
    const lista = eventosCache.filter((e) => filtroHist === "todo" || CATEGORIA[e.nombre] === filtroHist).slice(0, 200);
    $("#lista-historial").innerHTML = lista.length
      ? lista.map((e) => `<div class="ev ${CATEGORIA[e.nombre]}" title="tx ${esc(e.tx)}">
          <span class="cuando">#${e.bloque} · ${fecha(tsBloque.get(e.bloque))}</span>
          <span class="nombre-ev">${esc(NOMBRE[e.nombre] || e.nombre)}</span>
          <span>${esc(describir(e.nombre, e.x, e.a))}</span></div>`).join("")
      : '<div class="vacio">Sin eventos.</div>';
  }
  $("#filtro-historial").addEventListener("click", (ev) => {
    const b = ev.target.closest(".chip");
    if (!b) return;
    filtroHist = b.dataset.f;
    $$(".chip", $("#filtro-historial")).forEach((c) => c.classList.toggle("activo", c === b));
    pintarHistorial();
  });

  // ---------------------------------------------------------------- reloj de prueba
  $("#reloj-prueba").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "refrescar") return refrescar(true);
    if (!PRUEBA) return;
    await provider.send("evm_increaseTime", [Number(b.dataset.avanzar)]);
    await provider.send("evm_mine", []);
    toast("ok", "Reloj de la cadena avanzado " + duracion(b.dataset.avanzar), "Sólo posible en el nodo local de prueba.");
    await refrescar(true);
  });

  // ---------------------------------------------------------------- ciclo de refresco
  let ultimoBloque = -1;
  let refrescando = null;
  async function refrescar(forzar) {
    if (refrescando) {
      // Un refresco forzado (tras una transacción) no puede reutilizar una lectura
      // que empezó antes de ella: espera y vuelve a leer.
      await refrescando;
      if (!forzar) return;
      if (refrescando) return refrescando;
    }
    refrescando = (async () => {
      try {
        const n = Number(await provider.send("eth_blockNumber", []));
        if (!forzar && n === ultimoBloque) return;
        ultimoBloque = n;
        await leerEstado();
        await Promise.all([leerSuministro(), leerPropuestas(), leerHistorial()]);
        document.body.dataset.bloque = String(n);
      } catch (e) {
        console.warn("refresco", e);
        $("#kpis-estado").innerHTML = `<div class="mal">No hay conexión con ${esc(cfg.rpc)}. ¿Está corriendo <span class="mono">npx hardhat node</span>?</div>`;
      } finally {
        refrescando = null;
      }
    })();
    return refrescando;
  }
  await pintarRolActor();
  await refrescar(true);
  document.body.dataset.listo = "1";
  setInterval(() => refrescar(false), 3000);
})();
