# Seguridad The Navy - Registro de Visitantes (Full funcional)

Proyecto web phone-first para casetas de seguridad en condominios.  
Incluye registro de entradas y salidas, escaneo de cédula tica (PDF417) por cámara,
reuso de visitantes y vehículos, historial/búsqueda, lista live de eventos, y modo offline light.

## Stack
- Frontend: HTML + CSS + JS (SPA ligera, responsive).
- Scanner: ZXing (@zxing/browser + @zxing/library). Soporta PDF417 y QR.
  Nota: la lectura de PDF417 puede requerir buena luz/enfoque. Si el cliente quiere
  99% de confiabilidad en cédulas, se puede cambiar a SDK comercial sin tocar la UI.
- Backend: Node.js + Express (proxy seguro).
- DB: Airtable (3 tablas: Personas, Vehiculos, EventosAcceso).

## Estructura
- backend/  servidor Express + rutas a Airtable
- frontend/ app SPA, servida como estática por el backend

## Setup rápido

### 1) Crear base en Airtable
Crea una base nueva con estas tablas y campos:

**Personas**
- cedula (Single line text)  [UNICA]
- nombre_completo (Single line text)
- ultima_visita (Date time)
- notas (Long text)

**Vehiculos**
- placa (Single line text)
- persona_cedula (Link to Personas)
- tipo (Single line text)
- activo (Checkbox)

**EventosAcceso**
- persona_cedula (Link to Personas)
- vehiculo_placa (Link to Vehiculos)
- destino (Single line text)
- tipo_evento (Single select: entrada, salida)
- fecha_hora (Date time)
- metodo_registro (Single select: escaneo, manual)
- observacion_corta (Single line text)

### 2) Configurar backend
En `backend/.env` (ver `.env.example`):

```env
PORT=3000
AIRTABLE_TOKEN=pat_xxx
AIRTABLE_BASE_ID=app_xxx
AIRTABLE_TABLE_PERSONAS=Personas
AIRTABLE_TABLE_VEHICULOS=Vehiculos
AIRTABLE_TABLE_EVENTOS=EventosAcceso
```

### 3) Instalar y correr
Requisitos: Node 18+.

```bash
cd backend
npm install
npm run dev
```

Abre:
`http://localhost:3000`

El backend sirve el frontend.

## Deploy
- Render, Railway, Fly, cualquier Node host.
- Recuerda setear variables de entorno del backend.

## Notas sobre escaneo PDF417
- El modal usa cámara trasera si está disponible.
- Si no detecta, el guarda puede ingresar manual.
- El parser de PDF417 es heurístico porque el formato puede variar.
  Ajusta `parseCedulaPayload` en `frontend/app.js` si hace falta.

## Offline light
Si no hay internet, los eventos se guardan en localStorage como pendientes.
Al volver internet, se sincronizan automáticamente.

---

Hecho para Kevin.
