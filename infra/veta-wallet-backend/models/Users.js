import { Schema, model } from "mongoose";

const Users = new Schema(
    {
        email:{
            type: String,
            required:true,
            unique: true,
            trim: true
        },
        password:{
            type: String,
            required:true,
        },
        address:{
            type: String,
            required:true,
            unique: true,
            trim: true,
        },
        privateKey:{
            type: String,
            required:true,
            unique: true,
            trim: true
        },
        /* La frase semilla, SOLO de las cuentas que nacieron aqui.
         *
         * Una billetera traida de afuera no tiene frase guardada a proposito:
         * la frase de su dueño manda sobre TODAS las cuentas de esa frase, no
         * solo sobre la que trajo, y guardarla nos daria mando sobre
         * billeteras que nadie nos entrego. Con la llave privada de la cuenta
         * importada alcanza para todo lo que este servicio hace.
         *
         * Por eso `required` es false y el indice es DISPERSO. Y por eso el
         * alta importada OMITE el campo en vez de escribirlo como null: un
         * indice disperso deja fuera lo que NO EXISTE, no lo que vale null —
         * escribir null mete a todas en el indice y la segunda importacion
         * choca con la primera. */
        seed:{
            type: String,
            required:false,
            unique: true,
            sparse: true,
        },

        /* Nacio afuera. Cambia lo que se le puede ofrecer: no tiene frase que
         * enseñar en «respaldo», y su llave existe tambien en otra billetera. */
        importada:{
            type: Boolean,
            default: false,
        },
        username:{
            type: String,
            unique: false,
            required:false,
            trim: true,
            
        },
        name:{
            type: String,
            unique: false,
            required:false,
            trim: true
        },
        phone:{
            type: Number,
            required:false,
            unique: false,
            trim: true
        },
        country:{
            type: String,
            required:false,
            unique: false,
            trim: true
        },
        private:{
            type: Boolean
        },
        token: {
            type: String,
            required:false,
        },
        transaction:{
            type: [],
            ref: 'Tx'
        },
        tokens:{
            type: [String]
        },
        nfts:{
            type: [String]
        },
        blocked_users:{
            type: [String]
        },
        role: {
            type: String,
            enum: ["admin", "user"],
            required: true
          },
          isVerified:{
            type: Boolean,
            required: true
          },   
        verificationToken:{
            type: String,
            required: true
        },
        verificationTokenPassword:{
            type: String,

        },
        // Vencimiento del token de reseteo. Antes no existia: un token servia
        // para siempre, aunque el usuario nunca lo hubiera usado.
        verificationTokenPasswordExp:{
            type: Date,
        },
        /* Quien pidio no recibir mas correos de aviso.
         *
         * NO apaga el correo transaccional —confirmar la cuenta, recuperar la
         * contrasena, avisar de un movimiento—: eso no es publicidad y quien
         * se da de baja de los avisos no esta renunciando a poder entrar a su
         * cuenta. Apaga UNICAMENTE las cartas que mandamos nosotros por
         * iniciativa propia.
         *
         * Se guarda la fecha y no un booleano por una razon practica: cuando
         * alguien reclama «me siguen llegando», lo primero que hace falta
         * saber es CUANDO se dio de baja, no solo que lo hizo. */
        sinAvisos: {
            type: Date,
        },

        /* Cuando se le mando la carta de novedades.
         *
         * Es lo que hace que el envio se pueda repetir sin repetirle a nadie:
         * el guion se salta a quien ya la tiene. Si el proceso se cae en la
         * persona 200, volver a correrlo sigue en la 201 en vez de escribirle
         * dos veces a las 199 primeras — y un correo repetido es la forma mas
         * rapida de que alguien lo marque como basura, con lo que se quema el
         * dominio para TODO, incluido el de recuperar la contrasena. */
        novedadesEnviadaEn: {
            type: Date,
        },

        /* Cuando se le mando la carta de bienvenida al ecosistema.
         *
         * Es un campo APARTE de `novedadesEnviadaEn` a proposito. Reusar aquel
         * habria dejado fuera a las 441 personas que ya recibieron la carta de
         * reactivacion, que son justo a las que hay que escribirles: todo el
         * que tiene cuenta, sin excepciones. Dos cartas distintas necesitan dos
         * marcas distintas, o la segunda hereda a quien la primera ya toco.
         *
         * A quien abre cuenta de hoy en adelante se le pone al CONFIRMAR el
         * correo, no al registrarse: una direccion sin confirmar puede ser una
         * errata, y cada errata es un rebote que acerca la cuenta al limite
         * donde Amazon la suspende. */
        bienvenidaEn: {
            type: Date,
        },

        // KYC - Veriff
        kycStatus: {
            type: String,
            enum: ["none", "pending", "approved", "declined", "resubmission_requested", "expired"],
            default: "none",
        },
        kycSessionId: {
            type: String,
        },
        kycSessionUrl: {
            type: String,
        },
        kycApprovedAt: {
            type: Date,
        },
        // Datos personales (requeridos para KYC + tarjeta)
        phone_country_code: { type: Number },
        phone_number:       { type: String },
        birth_date:         { type: String },   // "YYYY-MM-DD"
        second_name:        { type: String },
        gender:             { type: String, enum: ["male", "female"] },
        individual_identification_type: { type: String }, // "CC", "CE", "PA", etc.
        individual_identification:      { type: String }, // número de cédula / pasaporte
        expiration_date:    { type: String },   // "YYYY-MM-DD" vencimiento del doc
        occupation:         { type: String },
        annual_salary:      { type: Number },
        account_purpose:    { type: String },
        expected_monthly_volume: { type: Number },
        // Dirección física (≠ address que es la wallet ETH)
        home_address: {
            street_line_1: { type: String },
            city:          { type: String },
            state:         { type: String },
            postal_code:   { type: String },
            country:       { type: String },
        },
        // CryptoMate
        cryptomateClientId: {
            type: String,
        },
        // Compliance
        acceptedCardTermsAt: { type: Date },   // timestamp aceptación T&C tarjeta

        // Cuenta eliminada por el usuario. No se borra la fila: se anonimiza y
        // se marca aquí, para que la clave privada cifrada siga existiendo y
        // los fondos on-chain sigan siendo recuperables con la seed.
        // Por donde entro la persona: "google", "apple". Sin declararlo aqui
        // mongoose lo descarta en silencio al guardar, porque el esquema es
        // estricto por defecto.
        proveedores: { type: [String], default: undefined },
        deletedAt: { type: Date },

        // Revocación de sesiones. El refresh token lleva esta versión dentro;
        // subirla invalida de golpe todos los refresh tokens emitidos antes,
        // sin necesidad de guardar cada token en la base. Sube al eliminar la
        // cuenta y al cambiar la contraseña.
        tokenVersion: { type: Number, default: 0 },
    },
    {
        timestamps:true,
    }
)

export default model("Users",Users )