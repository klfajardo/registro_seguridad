import 'dotenv/config';

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

if (!BASE_ID || !TOKEN) {
  console.warn("Airtable Base ID o Token no configurados. Revisa backend/.env");
}

const API_URL = `https://api.airtable.com/v0/${BASE_ID}`;

function headers() {
  return {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json"
  };
}

export async function airtableGet(table, params = {}) {
  const url = new URL(`${API_URL}/${encodeURIComponent(table)}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable GET error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function airtablePost(table, body) {
  const res = await fetch(`${API_URL}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable POST error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function airtablePatch(table, recordId, fields) {
  const res = await fetch(`${API_URL}/${encodeURIComponent(table)}/${recordId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable PATCH error ${res.status}: ${text}`);
  }
  return res.json();
}

export function getTableNames() {
  return {
    PERSONAS: process.env.AIRTABLE_TABLE_PERSONAS || "Personas",
    VEHICULOS: process.env.AIRTABLE_TABLE_VEHICULOS || "Vehiculos",
    EVENTOS: process.env.AIRTABLE_TABLE_EVENTOS || "EventosAcceso",
  };
}
