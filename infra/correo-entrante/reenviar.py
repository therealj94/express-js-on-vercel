# El correo que llega a vetawallet.com, entregado a un buzón que alguien lee.
#
# POR QUE EXISTE
#
# vetawallet.com no tenía ningún registro MX, así que soporte@vetawallet.com y
# privacidad@vetawallet.com —publicadas 27 veces en los términos, la política
# de privacidad y la página de borrado de cuenta— rebotaban todo lo que les
# llegaba. La política promete ese buzón para ejercer los derechos sobre los
# datos, y las tiendas exigen un contacto vivo para pedir la baja.
#
# El correo entrante lo recibe SES, lo deja en S3, y esta función lo reenvía.
#
# LA REGLA QUE MANDA: UN BUZON QUE SE TRAGA EL CORREO ES PEOR QUE NINGUNO
#
# Si esto falla, la persona que escribió cree que llegó y se queda esperando.
# Un rebote, por feo que sea, al menos le dice que pruebe por otro lado. Por eso
# aquí NADA se traga en silencio: si el reenvío falla, la excepción sube, SES lo
# reintenta, y si aun así no sale queda en el registro de errores. Y el mensaje
# original sigue en S3 noventa días, así que nunca se pierde de verdad.
#
# POR QUE NO SE CONSERVA EL REMITENTE ORIGINAL
#
# Porque no se puede, y fingir que sí rompe cosas. SES solo deja mandar desde
# un dominio verificado nuestro; y aunque dejara, un correo que dice venir de
# @gmail.com pero sale de nuestros servidores falla el DKIM y el DMARC de quien
# lo reciba, y acaba en no deseado.
#
# Así que el remitente somos nosotros y el original va en `Reply-To`: quien
# lea le da a «responder» y la respuesta llega a la persona, que es lo único
# que de verdad hacía falta. La dirección original va además en el asunto y en
# una cabecera propia, para que se vea sin abrir nada.

import email
import os
from email.utils import parseaddr

import boto3

S3 = boto3.client("s3")
SES = boto3.client("ses")

BUCKET = os.environ["BUCKET"]
PREFIJO = os.environ.get("PREFIJO", "")
DESTINO = os.environ["DESTINO"]          # a quién se le entrega de verdad
REMITE = os.environ["REMITE"]            # una dirección verificada NUESTRA

# Cabeceras que hay que quitar sí o sí antes de reenviar.
#
# `DKIM-Signature` firma unas cabeceras concretas; en cuanto se cambia el
# `From` la firma deja de cuadrar, y una firma rota puntúa PEOR que no llevar
# ninguna. `Return-Path` y `Sender` los pone el servidor que entrega, y dejarlos
# del envío anterior confunde a quien reciba. `Authentication-Results` y
# `Received-SPF` son el veredicto de OTRO servidor sobre OTRO envío: reenviarlos
# es citar un examen ajeno como si fuera el nuestro.
FUERA = {
    "dkim-signature", "return-path", "sender", "message-id",
    "authentication-results", "received-spf", "arc-authentication-results",
    "arc-message-signature", "arc-seal", "from", "reply-to",
}


def manejador(evento, contexto):
    reenviados = []

    for registro in evento.get("Records", []):
        ses = registro["ses"]
        recibo = ses["receipt"]
        correo = ses["mail"]
        identificador = correo["messageId"]

        # SES ya pasó el mensaje por antivirus y antispam. Reenviar lo que
        # suspendió es meterle a alguien en el buzón justo lo que el filtro
        # acababa de parar. Se descarta a propósito, y se dice en el registro:
        # el original queda en S3 por si hubo un falso positivo.
        veredictos = {
            "spam": recibo.get("spamVerdict", {}).get("status"),
            "virus": recibo.get("virusVerdict", {}).get("status"),
        }
        malos = [k for k, v in veredictos.items() if v == "FAIL"]
        if malos:
            print(f"[correo] {identificador} NO se reenvía: falló {', '.join(malos)}."
                  f" El original queda en s3://{BUCKET}/{PREFIJO}{identificador}")
            continue

        crudo = S3.get_object(Bucket=BUCKET, Key=PREFIJO + identificador)["Body"].read()
        original = email.message_from_bytes(crudo)

        de_original = original.get("From", "")
        _, direccion = parseaddr(de_original)
        # A quién iba dirigido de los NUESTROS. Un mismo mensaje puede llegar a
        # varias; se nombra la primera para que el asunto diga algo útil.
        para_nuestro = (recibo.get("recipients") or ["vetawallet.com"])[0]

        for cabecera in list(original.keys()):
            if cabecera.lower() in FUERA:
                del original[cabecera]

        original["From"] = REMITE
        # Sin dirección legible no hay a quién responder; se dice en vez de
        # poner un `Reply-To` roto que falle al pulsar responder.
        if direccion:
            original["Reply-To"] = de_original
        original["X-Original-From"] = de_original or "(sin remitente legible)"
        original["X-Original-To"] = para_nuestro

        asunto = original.get("Subject", "(sin asunto)")
        del original["Subject"]
        original["Subject"] = f"[{para_nuestro}] {asunto}"

        SES.send_raw_email(
            Source=REMITE,
            Destinations=[DESTINO],
            RawMessage={"Data": original.as_bytes()},
        )
        reenviados.append(identificador)
        print(f"[correo] {identificador}: {para_nuestro} -> {DESTINO}"
              f" (responder va a {direccion or 'nadie'})")

    return {"reenviados": reenviados}
