#!/usr/bin/env python3
"""Control de EC2 para el pipeline de vídeo — el equivalente de vast_api.py.

La instancia corre el MISMO cloud/onstart.sh dentro de la MISMA imagen que en
Vast. Lo que cambia es el anfitrión (cloud/aws_arranque.sh): caché de pesos en
S3, log en S3 y apagado automático que vive dentro de la máquina.

    python3 tools/aws_api.py infra                 # una vez: bucket, rol, grupo
    python3 tools/aws_api.py precios
    python3 tools/aws_api.py cupo [--pedir-spot 16]
    python3 tools/aws_api.py create --job prompts/q_x.json \\
        --workflows prompts/workflows --env HF_TOKEN=... --env HF_REPO=...
    python3 tools/aws_api.py status
    python3 tools/aws_api.py logs    <i-...>
    python3 tools/aws_api.py destroy <i-...>

Solo toca recursos con la etiqueta Proyecto=video. Las máquinas de Aura, OGB y
Ordenex de la misma cuenta no aparecen en status ni se pueden destruir desde
aquí.
"""
from __future__ import annotations

import argparse, base64, datetime as dt, gzip, io, json, sys, tarfile, time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# La licencia de MiniMax H3 excluye EE. UU., la UE, Reino Unido y Corea del
# Sur: ni usar el modelo ni mostrar lo que genera. Mumbai es la única región
# fuera de esos territorios con g7e (la RTX PRO 6000 de 96 GB) y con cupo.
REGION = "ap-south-1"
EXCLUIDAS = ("us-", "eu-", "ap-northeast-2")  # eu-* incluye Londres (eu-west-2)
TIPO = "g7e.2xlarge"
IMAGEN = "pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel"
AMI_NOMBRE = "Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)*"
ETIQUETA = {"Key": "Proyecto", "Value": "video"}
ROL = "og-video-pod"
GRUPO = "og-video-sin-entradas"
RAIZ = Path(__file__).resolve().parent.parent


def sesion(region: str):
    if region.startswith(EXCLUIDAS):
        sys.exit(f"{region} está en territorio excluido por la licencia de "
                 f"MiniMax H3. Usa {REGION}.")
    return boto3.Session(region_name=region)


def cuenta(s) -> str:
    return s.client("sts").get_caller_identity()["Account"]


def bucket(s, region: str) -> str:
    return f"og-video-cache-{cuenta(s)}-{region}"


# --------------------------------------------------------------------------
def infra(s, region: str) -> None:
    """Idempotente: crea lo que falte y no toca lo que ya existe."""
    b = bucket(s, region)
    s3 = s.client("s3")
    try:
        s3.head_bucket(Bucket=b)
        print(f"bucket   {b}  (ya existía)")
    except ClientError:
        s3.create_bucket(Bucket=b, CreateBucketConfiguration={
            "LocationConstraint": region})
        print(f"bucket   {b}  creado")
    s3.put_public_access_block(Bucket=b, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True,
        "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    s3.put_bucket_tagging(Bucket=b, Tagging={"TagSet": [ETIQUETA]})
    # Los paquetes y logs de cada sesión caducan solos; la caché no.
    s3.put_bucket_lifecycle_configuration(Bucket=b, LifecycleConfiguration={
        "Rules": [{"ID": f"caduca-{p}", "Status": "Enabled",
                   "Filter": {"Prefix": f"{p}/"},
                   "Expiration": {"Days": 30}} for p in ("trabajos", "logs")]})

    iam = s.client("iam")
    confianza = {"Version": "2012-10-17", "Statement": [{
        "Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole"}]}
    try:
        iam.create_role(RoleName=ROL, AssumeRolePolicyDocument=json.dumps(confianza),
                        Description="Pod de video: solo su bucket de caché",
                        Tags=[ETIQUETA])
        print(f"rol      {ROL}  creado")
    except iam.exceptions.EntityAlreadyExistsException:
        print(f"rol      {ROL}  (ya existía)")
    # El pod solo puede tocar SU bucket. Nada de EC2, nada de IAM: aunque
    # alguien se colara en la máquina, no puede crear ni borrar instancias.
    iam.put_role_policy(RoleName=ROL, PolicyName="solo-su-bucket",
                        PolicyDocument=json.dumps({
        "Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Action": ["s3:ListBucket"],
             "Resource": f"arn:aws:s3:::{b}"},
            {"Effect": "Allow",
             "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject",
                        "s3:AbortMultipartUpload"],
             "Resource": f"arn:aws:s3:::{b}/*"}]}))
    try:
        iam.create_instance_profile(InstanceProfileName=ROL, Tags=[ETIQUETA])
        iam.add_role_to_instance_profile(InstanceProfileName=ROL, RoleName=ROL)
        print(f"perfil   {ROL}  creado (tarda ~10 s en propagarse)")
    except iam.exceptions.EntityAlreadyExistsException:
        print(f"perfil   {ROL}  (ya existía)")

    ec2 = s.client("ec2")
    vpc = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])["Vpcs"]
    if not vpc:
        sys.exit(f"No hay VPC por defecto en {region}.")
    g = ec2.describe_security_groups(Filters=[
        {"Name": "group-name", "Values": [GRUPO]},
        {"Name": "vpc-id", "Values": [vpc[0]["VpcId"]]}])["SecurityGroups"]
    if g:
        print(f"grupo    {GRUPO}  (ya existía) {g[0]['GroupId']}")
    else:
        gid = ec2.create_security_group(
            GroupName=GRUPO, VpcId=vpc[0]["VpcId"],
            Description="Pod de video: ninguna regla de entrada",
            TagSpecifications=[{"ResourceType": "security-group",
                                "Tags": [ETIQUETA]}])["GroupId"]
        print(f"grupo    {GRUPO}  creado {gid}  (sin reglas de entrada)")


def grupo_id(ec2) -> str:
    g = ec2.describe_security_groups(Filters=[
        {"Name": "group-name", "Values": [GRUPO]}])["SecurityGroups"]
    if not g:
        sys.exit("Falta el grupo de seguridad. Corre primero: aws_api.py infra")
    if g[0].get("IpPermissions"):
        sys.exit(f"{GRUPO} tiene reglas de entrada y no debería. Revísalo.")
    return g[0]["GroupId"]


def ami(ec2) -> dict:
    imgs = ec2.describe_images(Owners=["amazon"], Filters=[
        {"Name": "name", "Values": [AMI_NOMBRE]},
        {"Name": "architecture", "Values": ["x86_64"]},
        {"Name": "state", "Values": ["available"]}])["Images"]
    if not imgs:
        sys.exit("No encontré la AMI Deep Learning Base en esta región.")
    return max(imgs, key=lambda i: i["CreationDate"])


# --------------------------------------------------------------------------
def precios(s, region: str, tipo: str) -> tuple[float | None, float | None]:
    ubic = {"ap-south-1": "Asia Pacific (Mumbai)",
            "ap-northeast-1": "Asia Pacific (Tokyo)",
            "sa-east-1": "South America (Sao Paulo)",
            "ca-central-1": "Canada (Central)"}.get(region)
    od = None
    if ubic:
        r = s.client("pricing", region_name="us-east-1").get_products(
            ServiceCode="AmazonEC2", Filters=[
                {"Type": "TERM_MATCH", "Field": k, "Value": v} for k, v in {
                    "instanceType": tipo, "location": ubic,
                    "operatingSystem": "Linux", "tenancy": "Shared",
                    "preInstalledSw": "NA", "capacitystatus": "Used"}.items()])
        for x in r["PriceList"]:
            d = json.loads(x)
            for t in d["terms"]["OnDemand"].values():
                for p in t["priceDimensions"].values():
                    v = float(p["pricePerUnit"]["USD"])
                    if v:
                        od = v
    h = s.client("ec2").describe_spot_price_history(
        InstanceTypes=[tipo], ProductDescriptions=["Linux/UNIX"],
        StartTime=dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)
    )["SpotPriceHistory"]
    spot = min((float(p["SpotPrice"]) for p in h), default=None)
    return od, spot


CUPOS = {"L-DB2E81BA": "On-Demand G/VT", "L-3819A6DF": "Spot G/VT"}


def cupo(s, pedir_spot: int | None) -> None:
    sq = s.client("service-quotas")
    for c, n in CUPOS.items():
        v = sq.get_service_quota(ServiceCode="ec2", QuotaCode=c)["Quota"]["Value"]
        print(f"{n:<16} {v:>6.0f} vCPU   ({TIPO} usa 8)")
    for p in sq.list_requested_service_quota_change_history(
            ServiceCode="ec2")["RequestedQuotas"]:
        if p["QuotaCode"] in CUPOS:
            print(f"  petición {CUPOS[p['QuotaCode']]} -> {p['DesiredValue']:.0f}: "
                  f"{p['Status']} ({p['Created']:%d-%b %H:%M})")
    if pedir_spot:
        r = sq.request_service_quota_increase(
            ServiceCode="ec2", QuotaCode="L-3819A6DF", DesiredValue=pedir_spot)
        print(f"pedido Spot G/VT = {pedir_spot}: {r['RequestedQuota']['Status']}")


# --------------------------------------------------------------------------
def paquete(a) -> tuple[bytes, dict]:
    """El mismo contenido que vast_api.py mete en variables de entorno, pero
    en un tar que viaja por S3: aquí no hay límite de 16 ni de 32 KB."""
    env = {"UI_PORT": "8188"}
    for kv in a.env:
        k, _, v = kv.partition("=")
        env[k] = v
    onstart = (RAIZ / "cloud/onstart.sh").read_text()
    if a.selftest:
        b64 = base64.b64encode(gzip.compress(Path(a.selftest).read_bytes(), 9)).decode()
        onstart += (f'\n\necho "== autoprueba =="\n'
                    f'echo {b64} | base64 -d | gunzip > /workspace/selftest.py\n'
                    f'"$WORK/venv/bin/python" /workspace/selftest.py 2>&1 | tail -40\n')

    def b64gz(p: Path) -> str:
        return base64.b64encode(gzip.compress(p.read_bytes(), 9)).decode()
    env["JOB_QUEUE_B64"] = b64gz(Path(a.job))
    env["JOB_RUNNER_B64"] = b64gz(RAIZ / "03_run_queue.py")
    env["ESTUDIO_B64"] = b64gz(RAIZ / "cloud/estudio.py")
    if a.workflows:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as t:
            t.add(a.workflows, arcname="prompts/workflows")
        env["JOB_WORKFLOWS_B64"] = base64.b64encode(buf.getvalue()).decode()

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        datos = onstart.encode()
        ti = tarfile.TarInfo("onstart.sh"); ti.size = len(datos); ti.mode = 0o755
        t.addfile(ti, io.BytesIO(datos))
        # Imágenes de referencia o stills elegidos: quedan en /workspace/refs/
        # y la cola los pide por esa ruta. No caben en variables de entorno.
        if getattr(a, "adjuntos", None):
            for f in sorted(Path(a.adjuntos).glob("*")):
                if f.is_file():
                    t.add(str(f), arcname=f"refs/{f.name}")
    secretos = "".join(f"{k}={v}\n" for k, v in env.items())
    if "\n" in "".join(env.values()):
        sys.exit("Un valor de --env tiene saltos de línea; docker --env-file no lo admite.")
    return buf.getvalue(), {"secretos": secretos.encode(), "claves": sorted(env)}


def create(s, region: str, a) -> None:
    ec2 = s.client("ec2")
    b = bucket(s, region)
    # Una sola a la vez: dos pods compitiendo por la misma cola de HF entregan
    # dos veces o se pisan el manifiesto.
    vivas = [i for i in instancias(ec2) if i["State"]["Name"] in ("pending", "running")]
    if vivas and not a.otra:
        sys.exit(f"Ya hay una instancia de vídeo viva: {vivas[0]['InstanceId']}. "
                 f"Usa encolar.py para mandarle trabajo, o --otra si de verdad quieres dos.")
    # El modelo ref2va (cara y voz de referencia) solo se baja con REF2VA=1.
    # Sin él cada toma falla en la validación de ComfyUI y la máquina se
    # queda cobrando mientras descarta la cola entera (pasó el 28-sep).
    if "ref2va" in Path(a.job).read_text() and "REF2VA=1" not in a.env:
        sys.exit("La cola usa ref2va: añade --env REF2VA=1 o fallará cada toma.")
    faltan = [k for k in ("HF_TOKEN", "HF_REPO") if not any(e.startswith(k + "=") for e in a.env)]
    if faltan:
        sys.exit(f"Falta --env {' '.join(faltan)}: sin eso los clips mueren con la máquina.")

    trabajo = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    tar, extra = paquete(a)
    s3 = s.client("s3")
    s3.put_object(Bucket=b, Key=f"trabajos/{trabajo}/paquete.tar.gz", Body=tar,
                  ServerSideEncryption="AES256")
    s3.put_object(Bucket=b, Key=f"trabajos/{trabajo}/secretos.env",
                  Body=extra["secretos"], ServerSideEncryption="AES256")
    print(f"paquete  s3://{b}/trabajos/{trabajo}/  ({len(tar)/1024:.0f} KB; "
          f"variables: {', '.join(extra['claves'])})")

    ud = (RAIZ / "cloud/aws_arranque.sh").read_text()
    for k, v in {"__BUCKET__": b, "__TRABAJO__": trabajo,
                 "__HORAS__": str(a.horas), "__IMAGEN__": a.image}.items():
        ud = ud.replace(k, v)
    if len(ud.encode()) > 16000:
        sys.exit(f"user-data de {len(ud.encode())} bytes: el límite son 16 384.")

    img = ami(ec2)
    kw = dict(
        ImageId=img["ImageId"], InstanceType=a.tipo, MinCount=1, MaxCount=1,
        UserData=ud,
        IamInstanceProfile={"Name": ROL},
        SecurityGroupIds=[grupo_id(ec2)],
        # Apagar = destruir. Sin esto el tope de horas dejaría la máquina
        # detenida con 400 GB de disco cobrando.
        InstanceInitiatedShutdownBehavior="terminate",
        BlockDeviceMappings=[{"DeviceName": img["RootDeviceName"], "Ebs": {
            "VolumeSize": a.disk, "VolumeType": "gp3", "Iops": 6000,
            "Throughput": 1000, "DeleteOnTermination": True, "Encrypted": True}}],
        MetadataOptions={"HttpTokens": "required", "HttpPutResponseHopLimit": 2},
        TagSpecifications=[
            {"ResourceType": "instance", "Tags": [ETIQUETA,
                {"Key": "Name", "Value": f"video-{trabajo}"},
                {"Key": "Trabajo", "Value": trabajo}]},
            {"ResourceType": "volume", "Tags": [ETIQUETA]}],
        DryRun=a.seco,
    )
    if a.spot:
        kw["InstanceMarketOptions"] = {"MarketType": "spot", "SpotOptions": {
            "SpotInstanceType": "one-time",
            "InstanceInterruptionBehavior": "terminate"}}
    for intento in range(4):
        try:
            r = ec2.run_instances(**kw)
            break
        except ClientError as e:
            c = e.response["Error"]["Code"]
            if c == "DryRunOperation":
                print(f"PRUEBA EN SECO OK: {a.tipo} {'spot' if a.spot else 'on-demand'} "
                      f"en {region}, AMI {img['ImageId']} ({img['Name'][-8:]}), "
                      f"user-data {len(ud.encode())} bytes. No se creó nada.")
                for k in ("secretos.env", "paquete.tar.gz"):
                    s3.delete_object(Bucket=b, Key=f"trabajos/{trabajo}/{k}")
                return
            # El perfil de instancia recién creado tarda unos segundos en verse.
            if c == "InvalidParameterValue" and "iamInstanceProfile" in str(e) and intento < 3:
                time.sleep(10); continue
            s3.delete_object(Bucket=b, Key=f"trabajos/{trabajo}/secretos.env")
            sys.exit(f"EC2: {c} — {e.response['Error']['Message']}")
    iid = r["Instances"][0]["InstanceId"]
    print(f"instancia {iid} creada ({a.tipo}, {'spot' if a.spot else 'on-demand'}, "
          f"tope {a.horas} h)")

    # Verificar el EFECTO, no la llamada.
    time.sleep(5)
    sb = ec2.describe_instance_attribute(
        InstanceId=iid, Attribute="instanceInitiatedShutdownBehavior"
    )["InstanceInitiatedShutdownBehavior"]["Value"]
    ok = sb == "terminate"
    print(f"  apagar = {sb:<10} {'ok' if ok else '!! MAL: destrúyela con destroy'}")
    for _ in range(12):
        bdm = ec2.describe_instances(InstanceIds=[iid])["Reservations"][0]["Instances"][0].get(
            "BlockDeviceMappings", [])
        if bdm:
            break
        time.sleep(5)
    for m in bdm:
        dot = m["Ebs"]["DeleteOnTermination"]
        print(f"  disco {m['DeviceName']} borra al destruir = {dot}  "
              f"{'ok' if dot else '!! MAL'}")
    print(f"\nVigila con:  aws_api.py logs {iid}   (el primer log sale al minuto)")


def instancias(ec2) -> list[dict]:
    r = ec2.describe_instances(Filters=[
        {"Name": f"tag:{ETIQUETA['Key']}", "Values": [ETIQUETA["Value"]]},
        {"Name": "instance-state-name",
         "Values": ["pending", "running", "stopping", "stopped", "shutting-down"]}])
    return [i for res in r["Reservations"] for i in res["Instances"]]


def status(s, region: str) -> None:
    ec2 = s.client("ec2")
    ii = instancias(ec2)
    if not ii:
        print(f"Ninguna instancia de vídeo en {region}. No se está cobrando nada.")
        return
    ahora = dt.datetime.now(dt.timezone.utc)
    tarifas: dict[str, tuple] = {}
    for i in ii:
        h = (ahora - i["LaunchTime"]).total_seconds() / 3600
        t = i["InstanceType"]
        if t not in tarifas:
            tarifas[t] = precios(s, region, t)
        od, spot = tarifas[t]
        precio = spot if i.get("InstanceLifecycle") == "spot" else od
        costo = f"~${h * precio:.2f}" if precio else "?"
        print(f'{i["InstanceId"]}  {i["State"]["Name"]:<13} {i["InstanceType"]:<12} '
              f'{i.get("InstanceLifecycle", "on-demand"):<9} {h:5.2f} h  {costo}')


def logs(s, region: str, iid: str, lineas: int, anfitrion: bool) -> int:
    clave = f"logs/{iid}.{'anfitrion.' if anfitrion else ''}log"
    try:
        o = s.client("s3").get_object(Bucket=bucket(s, region), Key=clave)
    except ClientError:
        print(f"Aún no hay log en {clave}. Sale al minuto de arrancar; si a los "
              f"5 min sigue sin haber, mira la consola con: logs {iid} --consola")
        return 1
    edad = (dt.datetime.now(dt.timezone.utc) - o["LastModified"]).total_seconds() / 60
    texto = o["Body"].read().decode("utf-8", "replace").splitlines()
    print("\n".join(texto[-lineas:]))
    print(f"\n--- log actualizado hace {edad:.0f} min ---")
    if edad > 12:
        print("!! Más de 12 min sin avanzar. Regla del runbook: destruir y mirar por qué.")
    return 0


def consola(s, iid: str) -> None:
    r = s.client("ec2").get_console_output(InstanceId=iid, Latest=True)
    print((r.get("Output") or "(la consola aún está vacía)")[-6000:])


def destroy(s, iid: str) -> None:
    ec2 = s.client("ec2")
    ids = {i["InstanceId"] for i in instancias(ec2)}
    if iid not in ids:
        sys.exit(f"{iid} no es una instancia de vídeo (sin etiqueta Proyecto=video). "
                 f"No la toco.")
    ec2.terminate_instances(InstanceIds=[iid])
    print(f"{iid}: destruyendo. Confirma con status en un minuto.")


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=REGION)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("infra")
    p = sub.add_parser("precios"); p.add_argument("--tipo", default=TIPO)
    q = sub.add_parser("cupo"); q.add_argument("--pedir-spot", type=int)
    c = sub.add_parser("create")
    c.add_argument("--job", required=True, help="cola JSON (modo desatendido)")
    c.add_argument("--workflows", default=str(RAIZ / "prompts/workflows"))
    c.add_argument("--env", action="append", default=[], metavar="K=V")
    c.add_argument("--selftest")
    c.add_argument("--tipo", default=TIPO)
    c.add_argument("--image", default=IMAGEN)
    c.add_argument("--disk", type=int, default=400)
    c.add_argument("--horas", type=int, default=8, help="tope duro de vida")
    c.add_argument("--spot", action="store_true")
    c.add_argument("--otra", action="store_true")
    c.add_argument("--seco", action="store_true", help="DryRun: valida sin crear")
    c.add_argument("--adjuntos", help="carpeta de imágenes que viajan a /workspace/refs/")
    sub.add_parser("status")
    lg = sub.add_parser("logs"); lg.add_argument("id")
    lg.add_argument("-n", type=int, default=80)
    lg.add_argument("--anfitrion", action="store_true")
    lg.add_argument("--consola", action="store_true")
    d = sub.add_parser("destroy"); d.add_argument("id")
    a = ap.parse_args()

    s = sesion(a.region)
    if a.cmd == "infra":
        infra(s, a.region)
    elif a.cmd == "precios":
        od, spot = precios(s, a.region, a.tipo)
        print(f"{a.tipo} en {a.region}: on-demand "
              f"{'$%.2f/h' % od if od else '?'}   spot {'$%.2f/h' % spot if spot else '?'}")
    elif a.cmd == "cupo":
        cupo(s, a.pedir_spot)
    elif a.cmd == "create":
        create(s, a.region, a)
    elif a.cmd == "status":
        status(s, a.region)
    elif a.cmd == "logs":
        if a.consola:
            consola(s, a.id)
        else:
            return logs(s, a.region, a.id, a.n, a.anfitrion)
    elif a.cmd == "destroy":
        destroy(s, a.id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
