import express from "express";
import { airtableGet, airtablePost, airtablePatch, getTableNames } from "../airtable.js";
import { sanitize, buildFilterByFormula, airtableEq, airtableContains } from "../utils.js";

const router = express.Router();
const { PERSONAS } = getTableNames();

router.get("/:cedula", async (req, res) => {
  try {
    const cedula = sanitize(req.params.cedula);
    const data = await airtableGet(PERSONAS, {
      filterByFormula: airtableEq("cedula", cedula),
      maxRecords: 1
    });
    const record = data.records?.[0];
    if (!record) return res.json({ found: false });
    res.json({ found: true, record });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const q = sanitize(req.query.query);
    const formula = q ? buildFilterByFormula([
      `OR(${airtableContains("cedula", q)}, ${airtableContains("nombre_completo", q)})`
    ]) : "";
    const data = await airtableGet(PERSONAS, {
      filterByFormula: formula || undefined,
      maxRecords: 20,
      sort: JSON.stringify([{ field: "ultima_visita", direction: "desc" }])
    });
    res.json(data.records || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const cedula = sanitize(req.body.cedula);
    const nombre_completo = sanitize(req.body.nombre_completo);
    if (!cedula || !nombre_completo) {
      return res.status(400).json({ error: "cedula y nombre_completo son requeridos" });
    }

    const existing = await airtableGet(PERSONAS, {
      filterByFormula: airtableEq("cedula", cedula),
      maxRecords: 1
    });
    const record = existing.records?.[0];
    if (record) {
      const updated = await airtablePatch(PERSONAS, record.id, {
        nombre_completo,
        ultima_visita: new Date().toISOString()
      });
      return res.json({ created: false, record: updated });
    }

    const created = await airtablePost(PERSONAS, {
      records: [{
        fields: { cedula, nombre_completo, ultima_visita: new Date().toISOString() }
      }]
    });
    res.json({ created: true, record: created.records[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
