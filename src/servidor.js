// Farmacias Brasil: API REST del catálogo de productos con fotos. Desplegada en Kubo PaaS (plan premium).
import express from "express";
import multer from "multer";
import os from "node:os";
import { createRequire } from "node:module";
import { pool, CATEGORIAS, esperarBase, migrar } from "./bd.js";

const require = createRequire(import.meta.url);
const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.static(new URL("../public", import.meta.url).pathname));

// La foto llega como multipart (campo "imagen") y se guarda en PostgreSQL: nada se escribe en el disco del pod
const MAX_FOTO = 2 * 1024 * 1024;
const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FOTO, files: 1, fields: 20 } });

// El tipo se decide por los primeros bytes del archivo, no por lo que diga el navegador
function tipoImagen(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const COLUMNAS = "id, codigo, nombre, laboratorio, categoria, presentacion, precio, existencias, requiere_receta, imagen_tipo, creado, actualizado";
const RE_ID = /^\d{1,9}$/;
const texto = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const opcional = (v, max) => v === undefined || v === null || v === "" || texto(v, max);
const siNo = (v) => v === true || v === "true" || v === "1" || v === "on";

// La URL de la foto lleva la fecha de actualización: el navegador la guarda en caché hasta que cambie
const publico = ({ imagen_tipo, ...p }) => ({
  ...p, precio: Number(p.precio),
  imagen_url: imagen_tipo ? `/api/productos/${p.id}/imagen?v=${new Date(p.actualizado).getTime()}` : null,
});

function validar(b, parcial = false) {
  const errores = [];
  const obligatorios = { codigo: 20, nombre: 120 };
  for (const [c, max] of Object.entries(obligatorios))
    if ((!parcial || c in b) && !texto(b[c], max)) errores.push(`${c}: obligatorio, hasta ${max} caracteres`);
  for (const [c, max] of Object.entries({ laboratorio: 80, presentacion: 80 }))
    if (!opcional(b[c], max)) errores.push(`${c}: hasta ${max} caracteres`);
  if ((!parcial || "categoria" in b) && !CATEGORIAS.includes(b.categoria)) errores.push(`categoria: una de ${CATEGORIAS.join(", ")}`);
  if ((!parcial || "precio" in b) && !(Number(b.precio) >= 0 && Number(b.precio) < 10000 && b.precio !== "")) errores.push("precio: número entre 0 y 9999.99");
  if ((!parcial || "existencias" in b) && !(Number.isInteger(Number(b.existencias)) && Number(b.existencias) >= 0 && Number(b.existencias) <= 1000000 && b.existencias !== ""))
    errores.push("existencias: entero de 0 en adelante");
  return errores;
}

function valores(b) {
  const v = {};
  for (const c of ["codigo", "nombre", "categoria"]) if (c in b) v[c] = String(b[c]).trim();
  for (const c of ["laboratorio", "presentacion"]) if (c in b) v[c] = String(b[c] ?? "").trim() || null;
  if ("precio" in b) v.precio = Number(b.precio);
  if ("existencias" in b) v.existencias = Number(b.existencias);
  if ("requiere_receta" in b) v.requiere_receta = siNo(b.requiere_receta);
  return v;
}

function foto(req) {
  if (!req.file) return null;
  const tipo = tipoImagen(req.file.buffer);
  return tipo ? { imagen: req.file.buffer, imagen_tipo: tipo } : false;
}

const envuelve = (fn) => (req, res, next) => fn(req, res).catch(next);
const duplicado = (e) => e.code === "23505";

// ── CRUD de productos ──
app.get("/api/categorias", (req, res) => res.json(CATEGORIAS));

app.get("/api/productos", envuelve(async (req, res) => {
  const filtros = [], params = [];
  const buscar = String(req.query.buscar ?? "").trim().slice(0, 80);
  if (buscar) { params.push(`%${buscar}%`); filtros.push(`(nombre ILIKE $${params.length} OR codigo ILIKE $${params.length} OR laboratorio ILIKE $${params.length})`); }
  if (CATEGORIAS.includes(req.query.categoria)) { params.push(req.query.categoria); filtros.push(`categoria = $${params.length}`); }
  const donde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM productos ${donde} ORDER BY categoria, nombre LIMIT 200`, params);
  res.json(rows.map(publico));
}));

app.get("/api/resumen", envuelve(async (req, res) => {
  const { rows: [r] } = await pool.query(`SELECT count(*)::int AS productos, COALESCE(sum(existencias),0)::int AS unidades,
    count(*) FILTER (WHERE existencias = 0)::int AS agotados, count(*) FILTER (WHERE requiere_receta)::int AS con_receta,
    COALESCE(sum(precio * existencias),0)::float AS valor FROM productos`);
  res.json(r);
}));

app.get("/api/productos/:id", envuelve(async (req, res) => {
  if (!RE_ID.test(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
  const { rows: [p] } = await pool.query(`SELECT ${COLUMNAS} FROM productos WHERE id = $1`, [req.params.id]);
  if (!p) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(publico(p));
}));

app.get("/api/productos/:id/imagen", envuelve(async (req, res) => {
  if (!RE_ID.test(req.params.id)) return res.status(404).end();
  const { rows: [p] } = await pool.query("SELECT imagen, imagen_tipo FROM productos WHERE id = $1 AND imagen IS NOT NULL", [req.params.id]);
  if (!p) return res.status(404).json({ error: "El producto no tiene foto" });
  res.set({ "Content-Type": p.imagen_tipo, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" }).send(p.imagen);
}));

app.post("/api/productos", subir.single("imagen"), envuelve(async (req, res) => {
  const b = req.body || {};
  const errores = validar(b);
  const f = foto(req);
  if (f === false) errores.push("imagen: debe ser JPG, PNG o WebP");
  if (errores.length) return res.status(400).json({ errores });
  const v = { ...valores(b), ...(f || {}) };
  const cols = Object.keys(v);
  try {
    const { rows: [p] } = await pool.query(
      `INSERT INTO productos (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING ${COLUMNAS}`,
      Object.values(v));
    res.status(201).location(`/api/productos/${p.id}`).json(publico(p));
  } catch (e) {
    if (duplicado(e)) return res.status(409).json({ errores: [`codigo: ya existe un producto con el código ${v.codigo}`] });
    throw e;
  }
}));

// PUT y PATCH actualizan solo los campos enviados; "quitar_imagen=true" borra la foto
async function actualizar(req, res) {
  if (!RE_ID.test(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
  const b = req.body || {};
  const errores = validar(b, true);
  const f = foto(req);
  if (f === false) errores.push("imagen: debe ser JPG, PNG o WebP");
  if (errores.length) return res.status(400).json({ errores });
  const v = { ...valores(b), ...(siNo(b.quitar_imagen) ? { imagen: null, imagen_tipo: null } : {}), ...(f || {}) };
  const cols = Object.keys(v);
  if (!cols.length) return res.status(400).json({ errores: ["Nada que actualizar"] });
  try {
    const { rows: [p] } = await pool.query(
      `UPDATE productos SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, actualizado = now() WHERE id = $1 RETURNING ${COLUMNAS}`,
      [req.params.id, ...Object.values(v)]);
    if (!p) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(publico(p));
  } catch (e) {
    if (duplicado(e)) return res.status(409).json({ errores: [`codigo: ya existe un producto con el código ${v.codigo}`] });
    throw e;
  }
}
app.put("/api/productos/:id", subir.single("imagen"), envuelve(actualizar));
app.patch("/api/productos/:id", subir.single("imagen"), envuelve(actualizar));

app.delete("/api/productos/:id", envuelve(async (req, res) => {
  if (!RE_ID.test(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
  const { rowCount } = await pool.query("DELETE FROM productos WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Producto no encontrado" });
  res.status(204).end();
}));

// ── Plataforma: lo que corre de verdad (para comprobar el despliegue en Kubo) ──
async function info() {
  const { rows: [r] } = await pool.query("SHOW server_version");
  return {
    "Node.js": process.versions.node,
    Express: require("express/package.json").version,
    PostgreSQL: r.server_version.split(" ")[0],
    "pg (driver)": require("pg/package.json").version,
    Pod: process.env.KUBO_POD || os.hostname(),
    Commit: (process.env.KUBO_COMMIT || "local").slice(0, 7),
  };
}
app.get("/api/info", envuelve(async (req, res) => res.json(await info())));
app.get("/salud", envuelve(async (req, res) => res.json({ estado: "ok", ...(await info()) })));

app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ errores: ["JSON mal formado"] });
  if (err instanceof multer.MulterError)
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ errores: [err.code === "LIMIT_FILE_SIZE" ? "imagen: la foto no puede pesar más de 2 MB" : `imagen: ${err.message}`] });
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

const PUERTO = Number(process.env.PORT || 3000);
await esperarBase();
await migrar();
const servidor = app.listen(PUERTO, () => console.log(`Farmacias Brasil escuchando en :${PUERTO}`));
process.on("SIGTERM", () => servidor.close(() => pool.end().then(() => process.exit(0))));
