import mongoose from "mongoose";

// La cadena de conexion viene de MONGODB_URI. Antes estaba escrita aqui, en
// texto plano y con la contraseña a la vista de cualquiera que abriera el
// archivo — y el codigo desplegado se puede descargar entero desde Heroku, asi
// que esa contraseña estuvo expuesta a todo el que tuviera acceso a la cuenta.
// Al moverla a una variable de entorno, rotarla ya no obliga a tocar el codigo.
const uri = process.env.MONGODB_URI;

(async () => {
  if (!uri) {
    // Sin base de datos el explorador no puede responder nada util, asi que se
    // avisa fuerte y claro en vez de arrancar y fallar en cada peticion.
    console.error(
      "[db] Falta la variable MONGODB_URI. El servicio arranca pero no podra " +
      "consultar bloques ni transacciones. Definila en Heroku: " +
      "heroku config:set MONGODB_URI='mongodb+srv://...'"
    );
    return;
  }
  try {
    mongoose.set("strictQuery", true);
    const db = await mongoose.connect(uri);
    console.log("[db] conectado a", db.connection.name);
  } catch (error) {
    console.error("[db] no se pudo conectar:", error.message);
  }
})();
