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
        seed:{
            type: String,
            required:true,
            unique: true,

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