import express from "express";
import { airtableGet, airtablePost, getTableNames } from "../airtable.js";
import {
  sanitize,
  buildFilterByFormula,
  airtableEq,
  airtableContains,
  rangeFormula,
} from "../utils.js";

const router = express.Router();
const { EVENTOS } = getTableNames();

// GET /api/eventos?range=24h&search=algo&type=entrada
// Busca por: cédula, nombre, placa, destino, tipo_evento, y campos derivados persona_nombre / vehiculo_placa_texto
router.get("/", async (req, res) => {
  try {
    const range = sanitize(req.query.range) || "24h";
    const search = sanitize(req.query.search);
    const type = sanitize(req.query.type);

    const clauses = [];

    const rf = rangeFormula(range);
    if (rf) clauses.push(rf);

    if (type) clauses.push(airtableEq("tipo_evento", type));

    if (search) {
      const searchFormula = `OR(
        ${airtableContains("cedula", search)},
        ${airtableContains("nombre_completo", search)},
        ${airtableContains("placa", search)},
        ${airtableContains("destino", search)},
        ${airtableContains("tipo_evento", search)},
        ${airtableContains("persona_nombre", search)},
        ${airtableContains("vehiculo_placa_texto", search)}
      )`;
      clauses.push(searchFormula);
    }

    const formula = buildFilterByFormula(clauses);

    const data = await airtableGet(EVENTOS, {
      filterByFormula: formula || undefined,
      maxRecords: 50,
      sort: [{ field: "fecha_hora", direction: "desc" }],
    });

    res.json(data.records || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/eventos
router.post("/", async (req, res) => {
  try {
    const persona_record_id = sanitize(req.body.persona_record_id);
    const vehiculo_record_id = sanitize(req.body.vehiculo_record_id);
    const destino = sanitize(req.body.destino);
    const tipo_evento = sanitize(req.body.tipo_evento) || "entrada";
    const metodo_registro = sanitize(req.body.metodo_registro) || "manual";
    const observacion_corta = sanitize(req.body.observacion_corta);

    // Campos de texto plano para búsquedas y UI
    const cedula = sanitize(req.body.cedula);
    const nombre_completo = sanitize(req.body.nombre_completo);
    const placa = sanitize(req.body.placa);

    if (!persona_record_id || !destino) {
      return res
        .status(400)
        .json({ error: "persona_record_id y destino son requeridos" });
    }

    const fields = {
      // links
      persona_cedula: [persona_record_id],
      destino,
      tipo_evento,
      fecha_hora: new Date().toISOString(),
      metodo_registro,
      observacion_corta: observacion_corta || undefined,
    };

    if (vehiculo_record_id) {
      fields.vehiculo_placa = [vehiculo_record_id];
    }

    // Copias en texto para que el search y la UI funcionen sin depender de fórmulas
    if (cedula) fields.cedula = cedula;
    if (nombre_completo) fields.nombre_completo = nombre_completo;
    if (placa) fields.placa = placa;

    const created = await airtablePost(EVENTOS, {
      records: [{ fields }],
    });

    res.json({ created: true, record: created.records[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
