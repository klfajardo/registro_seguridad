export function sanitize(str) {
  if (!str) return "";
  return String(str).trim();
}

export function buildFilterByFormula(clauses) {
  const filtered = clauses.filter(Boolean);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  return `AND(${filtered.join(",")})`;
}

export function airtableEq(field, value) {
  const v = String(value).replace(/"/g, '\"');
  return `{${field}}="${v}"`;
}

export function airtableContains(field, value) {
  const v = String(value).replace(/"/g, '\"');
  return `FIND(LOWER("${v}"), LOWER({${field}}))`;
}

export function rangeFormula(range) {
  if (!range || range === "all") return null;
  const now = new Date();
  let start;
  if (range === "24h") {
    start = new Date(now.getTime() - 24*60*60*1000);
  } else if (range === "7d") {
    start = new Date(now.getTime() - 7*24*60*60*1000);
  } else {
    return null;
  }
  const iso = start.toISOString();
  return `IS_AFTER({fecha_hora}, "${iso}")`;
}
