import 'dotenv/config'
import mongoose from "mongoose";

const mongoDBURL = process.env.mongoDBURL;

const connectDB = async () => {
    await mongoose.connect(mongoDBURL)
        .then(() => {
            console.log('app connected to database');
            
        })
        .catch((err) => {
            console.log(err);
        });
};

export default connectDB;
