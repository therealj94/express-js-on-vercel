/* Verificacion por fotos, de punta a punta y contra produccion.
   Se crea una cuenta de prueba, se recorre el tramite entero como lo haria
   una persona desde la web, y se comprueba que el expediente queda esperando
   a un operador — NUNCA aprobado solo. */
const B = 'https://vetawallet-1a2e38ac52b1.herokuapp.com';
const correo = `prueba-fotos-${Date.now()}@ordenkapital.com`;
const clave = 'Prueba-Fotos-' + Math.random().toString(36).slice(2, 10) + '!9';

const pedir = async (ruta, { metodo='GET', cuerpo, token } = {}) => {
  const r = await fetch(B + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = { texto: t.slice(0,200) }; }
  return { estado: r.status, d };
};

// Un JPEG minimo de verdad (1x1), para que el formato sea el real.
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const grande = JPEG + 'A'.repeat(1500);   // pasa el minimo de 1000 caracteres

console.log('cuenta de prueba:', correo);
const alta = await pedir('/auth/register', { metodo:'POST', cuerpo:{ name:'Prueba De Fotos', email:correo, password:clave } });
console.log('1. registro      :', alta.estado, '| trae semilla:', Boolean(alta.d?.semilla));

const login = await pedir('/auth/login', { metodo:'POST', cuerpo:{ email:correo, password:clave } });
const token = login.d?.token;
console.log('2. login         :', login.estado, '| devuelve user:', JSON.stringify(login.d?.user));

const est0 = await pedir('/genesis/estado', { token });
console.log('3. estado inicial:', est0.estado, '|', est0.d?.identidad?.estado);

const datos = await pedir('/genesis/datos', { metodo:'POST', token, cuerpo:{
  nombreCompleto:'Prueba De Fotos', fechaNacimiento:'1990-05-14', paisResidencia:'HND',
  telefono:'+504 9999 0000', direccion:'Col. Palmira, Tegucigalpa', ocupacion:'Ingeniera',
  origenFondos:'Salario', propositoCuenta:'Ahorro', volumenEsperadoUsd:1500, pepDeclarado:false }});
console.log('4. datos         :', datos.estado, '|', datos.d?.identidad?.estado);

const fotos = await pedir('/genesis/documento-fotos', { metodo:'POST', token, cuerpo:{ anverso:grande, reverso:grande }});
console.log('5. documento     :', fotos.estado, '| estado:', fotos.d?.identidad?.estado,
            '| via:', fotos.d?.documento?.via, '| pendiente:', fotos.d?.documento?.pendienteDeLectura);

const media = await pedir('/genesis/documento-fotos', { metodo:'POST', token, cuerpo:{ anverso:grande }});
console.log('6. media cara    :', media.estado, '(400 = la rechaza, correcto)');

const bio = await pedir('/genesis/biometria', { metodo:'POST', token, cuerpo:{ selfie:grande, fotoDocumento:grande }});
console.log('7. rostro        :', bio.estado, '| motivo:', bio.d?.biometria?.motivo || '(sin motivo)');

const fin = await pedir('/genesis/estado', { token });
const i = fin.d?.identidad || {};
console.log('8. estado final  :', i.estado, '| GID:', i.gid,
            '| documentoAceptable:', i.documentoAceptable, '| porFotos:', i.documentoPorFotos);
console.log('   la tarjeta NO dira «volve a subir el documento»:',
            (i.documentoAceptable === false && i.documentoPorFotos === true) ? 'correcto' : 'REVISAR');
console.log('\nLO IMPORTANTE · sin operador NO hay GID:', i.gid === null || i.gid === undefined ? 'correcto' : 'MAL: se aprobo sola');
