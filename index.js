import express from "express";
import 'dotenv/config'
import connectDB from "./config/db.js";
import companyRoute from './routes/companyRoutes.js';
import deliveryRoute from './routes/deliveryRoute.js';
import packRoute from './routes/packRoutes.js';
import itemRoute from './routes/itemRoutes.js';
import authRoutes from './routes/authRoutes.js';
import issuanceRoutes from './routes/issuanceRoutes.js';
import usageRoutes from './routes/usageRoutes.js';
import dispatchRoutes from './routes/dispatchRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import cors from "cors";

import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

//Middleware for handling CORS Policy
app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

//Middleware for parsing request body
app.use(express.json());

connectDB();

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use('/api/v1/companies', companyRoute);
app.use('/api/v1/packs', packRoute);
app.use('/api/v1/delivery', deliveryRoute);
app.use('/api/v1/items', itemRoute);
app.use("/api/v1/eal_issuance", issuanceRoutes);
app.use("/api/v1/eal_usage", usageRoutes);
app.use("/api/v1/dispatch", dispatchRoutes);

// to be removed later
app.use("/api/v1/eal_dispatch", dispatchRoutes);

// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("Server running in port: " + PORT);
});


