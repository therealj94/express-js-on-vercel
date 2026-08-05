import { Schema, model } from "mongoose";

// Sellos de idempotencia de los envios.
//
// Cada envio que sale de la app trae un sello que NO cambia si el usuario
// reintenta. Este registro es lo que permite reconocer un segundo intento del
// mismo envio y devolver el resultado del primero en vez de transferir otra vez.
//
// EL INDICE UNICO ES EL MECANISMO, NO UN ADORNO
//
// La proteccion no esta en "buscar y si no existe, crear": entre la busqueda y
// la creacion caben dos peticiones simultaneas, y las dos encontrarian vacio.
// Esta en que la insercion sea unica: cuando dos llegan a la vez, la base deja
// pasar una sola y la otra recibe un error de clave duplicada. Ese error es la
// señal de que alguien mas ya esta con este envio.
//
// Va por (clave, usuario) y no por clave sola: asi el sello de una persona no
// puede chocar —ni reutilizarse— contra el de otra.
const Idempotencia = new Schema(
  {
    clave: { type: String, required: true },
    usuario: { type: String, required: true },

    // Huella de lo que se pidio (destino, monto, cadena). Si llega el mismo
    // sello con datos distintos es un error del cliente, no un reintento, y
    // hay que decirlo en vez de devolver el resultado de otro envio.
    huella: { type: String, required: true },

    estado: {
      type: String,
      enum: ["en-curso", "listo", "dudoso"],
      default: "en-curso",
    },

    // Respuesta del primer intento, para devolverla tal cual en los siguientes.
    respuesta: { type: Object, default: null },
    error: { type: String, default: null },

    // Los sellos caducan solos a las 24 h. Guardarlos para siempre no aporta
    // nada —nadie reintenta un envio al dia siguiente— y la coleccion creceria
    // sin limite.
    creadoEn: { type: Date, default: Date.now, expires: 86400 },
  },
  { versionKey: false }
);

Idempotencia.index({ clave: 1, usuario: 1 }, { unique: true });

export default model("Idempotencia", Idempotencia);
