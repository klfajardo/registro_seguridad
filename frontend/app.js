import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  currentView: "registro",
  liveRange: "24h",
  histRange: "24h",
  searchType: "cedula",
  lastPerson: null,
  lastVehiculos: [],
  destinosRecientes: JSON.parse(localStorage.getItem("destinosRecientes") || "[]"),
  offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]"),
};

function startClock() {
  const el = $("#clock");
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleString("es-CR", { hour12: false });
  };
  tick();
  setInterval(tick, 1000 * 30);
}

function initTabs() {
  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      state.currentView = view;
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".view").forEach((v) =>
        v.classList.toggle("active", v.id === `view-${view}`)
      );
      if (view === "historial") refreshHistorial();
    })
  );
}

function initToggle() {
  const btnEntrada = $("#toggle-entrada");
  const btnSalida = $("#toggle-salida");
  [btnEntrada, btnSalida].forEach((b) =>
    b.addEventListener("click", () => {
      [btnEntrada, btnSalida].forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    })
  );
}

function initVehiculoCheckbox() {
  const cb = $("#conVehiculo");
  const fields = $("#vehiculo-fields");
  cb.addEventListener("change", () => {
    fields.classList.toggle("hidden", !cb.checked);
  });
}

function renderDestinos() {
  const dl = $("#destinos-sugeridos");
  dl.innerHTML = "";
  state.destinosRecientes.slice(0, 10).forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    dl.appendChild(opt);
  });
}
function pushDestino(dest) {
  if (!dest) return;
  state.destinosRecientes = [
    dest,
    ...state.destinosRecientes.filter((x) => x !== dest),
  ].slice(0, 10);
  localStorage.setItem(
    "destinosRecientes",
    JSON.stringify(state.destinosRecientes)
  );
  renderDestinos();
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
}

function debounce(fn, ms = 400) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function parseCedulaPayload(text) {
  if (!text) return null;
  const cleaned = text.replace(/\u0000/g, " ").trim();
  const parts = cleaned
    .split(/\n|\||\r/)
    .map((p) => p.trim())
    .filter(Boolean);

  let cedula = null;
  for (const p of parts) {
    const digits = p.replace(/\s+/g, "");
    if (/^\d{9,12}$/.test(digits)) {
      cedula = digits;
      break;
    }
  }

  let nombre = null;
  const letterParts = parts.filter((p) =>
    /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p)
  );
  if (letterParts.length) {
    nombre = letterParts.sort((a, b) => b.length - a.length)[0];
  }

  if (!cedula && !nombre) return null;
  return { cedula, nombre_completo: nombre };
}

/**
 * Descifra bytes de la cédula CR usando XOR (llave pública conocida)
 */
function decodeCedulaCR(byteArray) {
  if (!byteArray || !byteArray.length) return "";
  const key = [
    0x27, 0x30, 0x04, 0xA0, 0x00, 0x0F, 0x93, 0x12,
    0xA0, 0xD1, 0x22, 0xE0, 0x03, 0xD0, 0x00, 0xDF, 0x00,
  ];
  let index = 0;
  let out = "";

  for (let i = 0; i < byteArray.length; i++) {
    const b = byteArray[i];
    const decrypted = b ^ key[index];
    index++;
    if (index >= key.length) index = 0;

    const ch = String.fromCharCode(decrypted);
    if (/[0-9A-Za-z]/.test(ch)) {
      out += ch;
    } else {
      out += " ";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

// --- ESCÁNER DE CÉDULA ---

let scannerReader = null;

function getScanner() {
  if (!scannerReader) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.PDF_417,
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    scannerReader = new BrowserMultiFormatReader(hints);
  }
  return scannerReader;
}

function handleScanResult(result) {
  const statusEl = $("#scan-status");

  let rawText = "";
  let rawBytes = null;

  if (result) {
    if (typeof result.getText === "function") {
      rawText = result.getText() || "";
    } else {
      rawText = result.text || "";
    }

    if (typeof result.getRawBytes === "function") {
      rawBytes = result.getRawBytes();
    } else if (result.rawBytes) {
      rawBytes = result.rawBytes;
    }
  }

  console.log("RAW SCAN:", rawText);

  // 1) Intentar parseo directo
  let parsed = parseCedulaPayload(rawText);

  // 2) Si no, intentamos con XOR sobre bytes
  if (!parsed) {
    let bytes = null;

    if (rawBytes && rawBytes.length) {
      bytes = rawBytes;
    } else if (rawText && rawText.length) {
      // fallback: usamos los charCodes del texto crudo
      bytes = Array.from(rawText, (ch) => ch.charCodeAt(0));
    }

    if (bytes && bytes.length) {
      const decrypted = decodeCedulaCR(bytes);
      console.log("DECRYPTED:", decrypted);
      parsed = parseCedulaPayload(decrypted);
    }
  }

  if (!parsed) {
    if (statusEl) {
      statusEl.textContent =
        "Código leído pero no reconocido. Ingresa los datos manualmente.";
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Cédula leída. Rellenando datos…";
  }
  fillFromScan(parsed);
  toast("Cédula leída");
}

async function openScanner() {
  const modal = $("#scanner-modal");
  const statusEl = $("#scan-status");

  if (!modal) {
    console.error("No se encontró el modal del escáner.");
    return;
  }

  modal.classList.remove("hidden");
  if (statusEl) statusEl.textContent = "Buscando código...";

  const reader = getScanner();

  try {
    await reader.decodeFromVideoDevice(
      null, // cámara por defecto
      "video", // id del <video>
      (result, err) => {
        if (result) {
          if (statusEl) {
            statusEl.textContent = "Código leído, procesando...";
          }
          try {
            handleScanResult(result);
          } finally {
            closeScanner();
          }
          return;
        }

        if (err && !(err instanceof NotFoundException)) {
          console.error("Error del escáner:", err);
          if (statusEl) {
            statusEl.textContent =
              "Error al leer el código. Intenta de nuevo o ingresa manual.";
          }
        }
      }
    );
  } catch (e) {
    console.error("No se pudo iniciar la cámara:", e);
    if (statusEl) {
      statusEl.textContent =
        "No se pudo iniciar la cámara. Revisa permisos o ingresa manual.";
    }
  }
}

function closeScanner() {
  const modal = $("#scanner-modal");
  if (modal) modal.classList.add("hidden");

  if (scannerReader) {
    try {
      scannerReader.reset();
    } catch (e) {
      console.warn("Error reseteando scannerReader:", e);
    }
  }
}

$("#btn-scan").addEventListener("click", openScanner);
$("#close-scan").addEventListener("click", closeScanner);
$("#scanner-modal").addEventListener("click", (e) => {
  if (e.target.id === "scanner-modal") closeScanner();
});

async function fillFromScan({ cedula, nombre_completo }) {
  if (cedula) $("#cedula").value = cedula;
  if (nombre_completo) $("#nombre").value = nombre_completo;
  $("#destino").focus();

  if (cedula) {
    const p = await api(`/api/personas/${cedula}`);
    if (p.found) {
      state.lastPerson = p.record;
      $("#nombre").value =
        p.record.fields.nombre_completo || nombre_completo || "";
      await loadVehiculosForPerson(p.record);
      suggestSalidaIfNeeded(cedula);
    } else {
      state.lastPerson = null;
      state.lastVehiculos = [];
      renderPlacasSugeridas([]);
    }
  }
}

async function suggestSalidaIfNeeded(cedula) {
  try {
    const events = await api(
      `/api/eventos?range=all&search=${encodeURIComponent(cedula)}`
    );
    const last = events[0];
    if (last?.fields?.tipo_evento === "entrada") {
      setTipo("salida");
    } else {
      setTipo("entrada");
    }
  } catch {}
}

function setTipo(tipo) {
  $$("#view-registro .toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.value === tipo);
  });
}

async function loadVehiculosForPerson(personRecord) {
  try {
    const allVeh = await api(
      `/api/vehiculos?cedula=${encodeURIComponent(
        personRecord.fields.cedula || ""
      )}`
    );
    state.lastVehiculos = allVeh || [];
    renderPlacasSugeridas(state.lastVehiculos);
  } catch {
    state.lastVehiculos = [];
    renderPlacasSugeridas([]);
  }
}

function renderPlacasSugeridas(records) {
  const wrap = $("#placas-sugeridas");
  wrap.innerHTML = "";
  records.forEach((r) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = r.fields.placa;
    chip.type = "button";
    chip.addEventListener("click", () => {
      $("#conVehiculo").checked = true;
      $("#vehiculo-fields").classList.remove("hidden");
      $("#placa").value = r.fields.placa;
    });
    wrap.appendChild(chip);
  });
}

$("#cedula").addEventListener(
  "input",
  debounce(async () => {
    const cedula = $("#cedula").value.trim().replace(/\s+/g, "");
    if (cedula.length < 9) return;
    try {
      const p = await api(`/api/personas/${cedula}`);
      if (p.found) {
        state.lastPerson = p.record;
        $("#nombre").value = p.record.fields.nombre_completo || "";
        await loadVehiculosForPerson(p.record);
        suggestSalidaIfNeeded(cedula);
      } else {
        state.lastPerson = null;
        state.lastVehiculos = [];
        renderPlacasSugeridas([]);
      }
    } catch {}
  }, 500)
);

$("#btn-registrar").addEventListener("click", async () => {
  const cedulaRaw = $("#cedula").value.trim().replace(/\s+/g, "");
  const nombre = $("#nombre").value.trim();
  const destino = $("#destino").value.trim();
  const conVehiculo = $("#conVehiculo").checked;
  const placa = $("#placa").value.trim().toUpperCase();
  const tipo_evento = $("#toggle-salida").classList.contains("active")
    ? "salida"
    : "entrada";

  const msg = $("#form-msg");
  msg.textContent = "";

  if (!cedulaRaw || !nombre) {
    msg.textContent = "Cédula y nombre son requeridos.";
    msg.style.color = "var(--red)";
    return;
  }
  if (!destino) {
    msg.textContent = "Destino es requerido.";
    msg.style.color = "var(--red)";
    return;
  }

  pushDestino(destino);

  const metodo =
    state.lastPerson && state.lastPerson.fields.cedula === cedulaRaw
      ? "escaneo"
      : "manual";

  const payload = {
    cedula: cedulaRaw,
    nombre_completo: nombre,
    destino,
    tipo_evento,
    metodo_registro: metodo,
    placa: conVehiculo ? placa : null,
  };

  if (!navigator.onLine) {
    enqueueOffline(payload);
    clearForm();
    toast("Guardado offline");
    refreshLive();
    return;
  }

  try {
    await registerEvent(payload);
    clearForm();
    toast(`${tipo_evento === "entrada" ? "Entrada" : "Salida"} registrada`);
    refreshLive();
  } catch (e) {
    console.error(e);
    msg.textContent = "Error registrando. Intenta de nuevo.";
    msg.style.color = "var(--red)";
  }
});

function clearForm() {
  $("#cedula").value = "";
  $("#nombre").value = "";
  $("#destino").value = "";
  $("#conVehiculo").checked = false;
  $("#vehiculo-fields").classList.add("hidden");
  $("#placa").value = "";
  renderPlacasSugeridas([]);
  state.lastPerson = null;
  state.lastVehiculos = [];
  setTipo("entrada");
}

async function registerEvent({
  cedula,
  nombre_completo,
  destino,
  tipo_evento,
  metodo_registro,
  placa,
}) {
  const personaRes = await api("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cedula, nombre_completo }),
  });
  const personaRecord = personaRes.record;
  state.lastPerson = personaRecord;

  let vehiculoRecord = null;
  if (placa) {
    vehiculoRecord = state.lastVehiculos.find(
      (v) => v.fields.placa === placa
    );
    if (!vehiculoRecord) {
      const vehRes = await api("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa, persona_record_id: personaRecord.id }),
      });
      vehiculoRecord = vehRes.record;
      state.lastVehiculos = [vehiculoRecord, ...state.lastVehiculos];
    }
  }

  const evRes = await api("/api/eventos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      persona_record_id: personaRecord.id,
      vehiculo_record_id: vehiculoRecord?.id || null,
      destino,
      tipo_evento,
      metodo_registro,
    }),
  });
  return evRes.record;
}

function enqueueOffline(payload) {
  state.offlineQueue.push({ payload, ts: Date.now() });
  localStorage.setItem(
    "offlineQueue",
    JSON.stringify(state.offlineQueue)
  );
}

async function flushOffline() {
  if (!navigator.onLine || state.offlineQueue.length === 0) return;
  const queue = [...state.offlineQueue];
  const kept = [];
  for (const item of queue) {
    try {
      await registerEvent(item.payload);
    } catch {
      kept.push(item);
    }
  }
  state.offlineQueue = kept;
  localStorage.setItem(
    "offlineQueue",
    JSON.stringify(state.offlineQueue)
  );
  if (queue.length && kept.length === 0) {
    toast("Pendientes sincronizados");
    refreshLive();
  }
}
window.addEventListener("online", flushOffline);

async function refreshLive() {
  try {
    await flushOffline();
    const search = $("#search-live").value.trim();
    const events = await api(
      `/api/eventos?range=${state.liveRange}&search=${encodeURIComponent(
        search
      )}`
    );
    renderEvents($("#live-list"), events);
  } catch {}
}

function renderEvents(container, records) {
  container.innerHTML = "";
  if (!records.length) {
    const li = document.createElement("li");
    li.className = "item-sub";
    li.textContent = "No hay registros.";
    container.appendChild(li);
    return;
  }
  records.forEach((r) => {
    const f = r.fields || {};
    const li = document.createElement("li");
    li.className = "list-item";

    const fecha = f.fecha_hora ? new Date(f.fecha_hora) : null;
    const hora = fecha
      ? fecha.toLocaleTimeString("es-CR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
    const tipo = f.tipo_evento || "";

    const nombre = (f.persona_nombre || f.nombre_completo || "").toUpperCase();
    const destino = f.destino || "";
    const placa = f.vehiculo_placa_texto || f.placa || "";

    li.innerHTML = `
      <div class="item-top">
        <div>${hora}  ${nombre || "VISITANTE"}</div>
        <div class="item-tag ${
          tipo === "salida" ? "tag-salida" : "tag-entrada"
        }">${tipo}</div>
      </div>
      <div class="item-sub">Destino: ${destino}${
      placa ? ` · Placa: ${placa}` : ""
    }</div>
    `;
    container.appendChild(li);
  });
}

$("#view-registro .filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const range = btn.dataset.range;
  if (!range) return;
  state.liveRange = range;
  $$("#view-registro .filters .chip").forEach((b) =>
    b.classList.toggle("active", b === btn)
  );
  refreshLive();
});

$("#search-live").addEventListener("input", debounce(refreshLive, 400));

async function refreshHistorial() {
  try {
    const q = $("#search-hist").value.trim();
    const events = await api(
      `/api/eventos?range=${state.histRange}&search=${encodeURIComponent(q)}`
    );
      renderEvents($("#hist-list"), events);
  } catch {}
}

$("#search-hist").addEventListener("input", debounce(refreshHistorial, 450));

$("#view-historial .historial-header").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  if (btn.dataset.searchtype) {
    state.searchType = btn.dataset.searchtype;
    $$("#view-historial .search-tabs .chip").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
  }
  if (btn.dataset.range) {
    state.histRange = btn.dataset.range;
    $$("#view-historial .filters .chip").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    refreshHistorial();
  }
});

startClock();
initTabs();
initToggle();
initVehiculoCheckbox();
renderDestinos();
refreshLive();
setInterval(refreshLive, 12000);
flushOffline();
