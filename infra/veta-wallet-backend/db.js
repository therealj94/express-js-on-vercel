import mongoose from "mongoose";

(async ()=>{
    try {
        mongoose.set('strictQuery', true)
        const db = await mongoose.connect(`mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`)
        console.log("db", db.connection.name)
    } catch (error) {
        console.log(error)
    }
})()