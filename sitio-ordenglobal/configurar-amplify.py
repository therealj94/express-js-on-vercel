# Cabeceras, CSP y regla del 404 de la app de Amplify. Se corre una vez cuando
# cambia algo de esto, con las mismas credenciales que desplegar.py:
#
#   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 configurar-amplify.py
#
# Sin esto Amplify manda `max-age=0` para todo y el navegador revalida los 216
# fotogramas y los 19 MP3 en cada visita; y cualquier ruta inexistente devolvía
# la portada con estado 200, que para Google es una página más.
import boto3, json
am=boto3.client('amplify', region_name='us-east-1'); A='d2rweubccyt73x'
INMUTABLE="public, max-age=31536000, immutable"
seguridad=[
 {"key":"Strict-Transport-Security","value":"max-age=31536000; includeSubDomains"},
 {"key":"X-Content-Type-Options","value":"nosniff"},
 {"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},
 {"key":"Permissions-Policy","value":"camera=(), microphone=(), geolocation=()"},
 {"key":"Content-Security-Policy","value":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://api.gold-api.com https://rpc.ordenglobal-rpc.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"},
 {"key":"X-Frame-Options","value":"DENY"},
]
cache=lambda v: [{"key":"Cache-Control","value":v}]
headers=[{"pattern":"**","headers":seguridad}]
# Lo que no cambia nunca sin cambiar de nombre: un año y sin revalidar.
for pat in ["/seq/**","/audio/**","/assets/fuentes/**","/assets/*.png","/assets/*.jpg","/favicon.ico"]:
    headers.append({"pattern":pat,"headers":cache(INMUTABLE)})
# CSS y JS llevan ?v= en el HTML: una semana en el navegador, y el cambio de versión los renueva.
# Los videos, sus pósteres y el logo en SVG no llevan versión: una semana.
for pat in ["/assets/*.css","/assets/*.js","/assets/*.svg","/assets/medios/**"]:
    headers.append({"pattern":pat,"headers":cache("public, max-age=604800")})
rules=[{"source":"/<*>","target":"/404.html","status":"404"}]
r=am.update_app(appId=A, customHeaders=json.dumps({"customHeaders": headers}), customRules=rules)
app=am.get_app(appId=A)['app']
print("rules:", app.get('customRules'))
print("headers:", app.get('customHeaders')[:300], '...')
