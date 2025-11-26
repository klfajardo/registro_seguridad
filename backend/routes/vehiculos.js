import express from "express";
import { airtableGet, airtablePost, getTableNames } from "../airtable.js";
import {
  sanitize,
  buildFilterByFormula,
  airtableEq,
  airtableContains,
} from "../utils.js";

const router = express.Router();
const { VEHICULOS, PERSONAS } = getTableNames();

// GET /api/vehiculos?placa=ABC123
// GET /api/vehiculos?cedula=123456789  (resuelve recordId de Persona y busca linked-record)
router.get("/", async (req, res) => {
  try {
    const placa = sanitize(req.query.placa);
    let cedula = sanitize(req.query.cedula);
    let persona_record_id = sanitize(req.query.persona_record_id);

    // Si viene cedula, resolvemos el recordId de la persona
    if (cedula && !persona_record_id) {
      const p = await airtableGet(PERSONAS, {
        filterByFormula: airtableEq("cedula", cedula),
        maxRecords: 1,
      });
      const pr = p.records?.[0];
      if (pr) persona_record_id = pr.id;
    }

    const clauses = [];
    if (placa) clauses.push(airtableEq("placa", placa));
    if (persona_record_id) {
      clauses.push(`FIND("${persona_record_id}", ARRAYJOIN({persona_cedula}))`);
    }

    const formula = buildFilterByFormula(clauses);

    const data = await airtableGet(VEHICULOS, {
      filterByFormula: formula || undefined,
      maxRecords: 50,
      sort: [{ field: "placa", direction: "asc" }],
    });

    res.json(data.records || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Búsqueda ligera por texto (placa)
router.get("/search", async (req, res) => {
  try {
    const q = sanitize(req.query.query);
    const formula = q
      ? buildFilterByFormula([airtableContains("placa", q)])
      : "";
    const data = await airtableGet(VEHICULOS, {
      filterByFormula: formula || undefined,
      maxRecords: 10,
    });
    res.json(data.records || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/vehiculos  { placa, persona_record_id }
router.post("/", async (req, res) => {
  try {
    const placa = sanitize(req.body.placa).toUpperCase();
    const persona_record_id = sanitize(req.body.persona_record_id);
    const tipo = sanitize(req.body.tipo);

    if (!placa || !persona_record_id) {
      return res
        .status(400)
        .json({ error: "placa y persona_record_id son requeridos" });
    }

    const existing = await airtableGet(VEHICULOS, {
      filterByFormula: buildFilterByFormula([
        airtableEq("placa", placa),
        `FIND("${persona_record_id}", ARRAYJOIN({persona_cedula}))`,
      ]),
      maxRecords: 1,
    });

    if (existing.records?.[0]) {
      return res.json({ created: false, record: existing.records[0] });
    }

    const created = await airtablePost(VEHICULOS, {
      records: [
        {
          fields: {
            placa,
            persona_cedula: [persona_record_id],
            tipo: tipo || undefined,
            activo: true,
          },
        },
      ],
    });

    res.json({ created: true, record: created.records[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
