import express from "express";
import cors from "cors";
import 'dotenv/config';
import path from "path";
import { fileURLToPath } from "url";

import personasRouter from "./routes/personas.js";
import vehiculosRouter from "./routes/vehiculos.js";
import eventosRouter from "./routes/eventos.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/personas", personasRouter);
app.use("/api/vehiculos", vehiculosRouter);
app.use("/api/eventos", eventosRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, "..", "frontend");

app.use(express.static(frontendPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));
