/* Mira la lista ANTES de escribirle, sin mandar nada.
 *
 *   node scripts/revisar-lista.js
 *
 * POR QUE
 *
 * Amazon suspende la cuenta si rebota mas del 10% de lo que sale, y avisa
 * sobre el 5%. Esa lista son 441 direcciones que nadie ha escrito nunca: las
 * que tengan una errata llevan ahi desde que la persona se registro, y no hay
 * forma de enterarse hasta que rebotan todas juntas.
 *
 * Y lo que se pierde no es la carta. Si suspenden la cuenta, deja de salir
 * TAMBIEN el correo de recuperar la contrasenia. Mandar sin mirar arriesga lo
 * segundo por conseguir lo primero.
 *
 * Esto no valida buzones -eso solo se sabe mandando- pero saca lo que si se
 * puede ver desde fuera: sintaxis rota, dominios de usar y tirar, y erratas en
 * los dominios comunes, que son la mayoria de los rebotes duros.
 */
import mongoose from "mongoose";
import Users from "../models/Users.js";

const COMUNES = ["gmail.com","hotmail.com","outlook.com","yahoo.com","icloud.com",
  "live.com","yahoo.es","hotmail.es","outlook.es","proton.me","protonmail.com"];
const TIRAR = ["mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
  "yopmail.com","trashmail.com","sharklasers.com","temp-mail.org","getnada.com"];

// Distancia de edicion, para pillar gmial.com y hotnail.com.
function dist(a,b){
  const m=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);
  for(let j=0;j<=b.length;j++)m[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)
    m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return m[a.length][b.length];
}

await mongoose.connect(`mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`);

const gente = await Users.find({
  email:{$exists:true,$nin:[null,""]}, sinAvisos:{$exists:false}, novedadesEnviadaEn:{$exists:false},
}).select("email").lean();

const RE=/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
const rotas=[], tirar=[], erratas=[], repes=[];
const vistas=new Set(); const dominios={};
for(const u of gente){
  const e=(u.email||"").trim().toLowerCase();
  if(vistas.has(e)) repes.push(e); else vistas.add(e);
  if(!RE.test(e)){ rotas.push(e); continue; }
  const d=e.split("@")[1];
  dominios[d]=(dominios[d]||0)+1;
  if(TIRAR.includes(d)) tirar.push(e);
  else for(const c of COMUNES){ const k=dist(d,c); if(k>0&&k<=1){ erratas.push(`${e}  (parece ${c})`); break; } }
}
const tapar=(e)=>e.split("@")[0].slice(0,3)+"…@"+e.split("@")[1];
console.log(`\n  Direcciones            : ${gente.length}`);
console.log(`  Sintaxis rota          : ${rotas.length}`);
rotas.slice(0,10).forEach(e=>console.log(`     · ${tapar(e)}`));
console.log(`  Dominios de usar y tirar: ${tirar.length}`);
tirar.slice(0,10).forEach(e=>console.log(`     · ${tapar(e)}`));
console.log(`  Erratas en el dominio  : ${erratas.length}`);
erratas.slice(0,15).forEach(e=>console.log(`     · ${e.split("@")[0].slice(0,3)}…@${e.split("@")[1]}`));
console.log(`  Repetidas              : ${repes.length}`);
const sos=rotas.length+tirar.length+erratas.length;
console.log(`\n  Rebote seguro estimado : ${sos} de ${gente.length}  (${(100*sos/gente.length).toFixed(1)}%)`);
console.log(`  (a esto hay que sumarle los buzones cerrados, que desde fuera no se ven)\n`);
console.log("  Los diez dominios mas frecuentes:");
Object.entries(dominios).sort((a,b)=>b[1]-a[1]).slice(0,10)
  .forEach(([d,n])=>console.log(`     ${String(n).padStart(4)}  ${d}`));
await mongoose.disconnect();
