// Conexión a la base de datos administrada de Kubo (PostgreSQL 17).
// Kubo inyecta DATABASE_URL (y DB_HOST, DB_PORT…) desde el Secret de la base: nada va en el código.
import pg from "pg";
import { ilustracion } from "./ilustraciones.js";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: en Kubo la inyecta la base de datos administrada del plan");
  process.exit(1);
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export const CATEGORIAS = ["Medicamentos", "Vitaminas", "Cuidado personal", "Bebés", "Primeros auxilios", "Librería"];

export async function esperarBase() {
  for (let i = 1; ; i++) {
    try { await pool.query("SELECT 1"); return; } catch (e) {
      if (i >= 60) throw e;
      console.log(`Esperando a PostgreSQL (${i})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Migración idempotente + catálogo de ejemplo la primera vez.
// La foto va en la base (bytea): así la ven todas las réplicas y sobrevive a cada despliegue.
export async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id              serial PRIMARY KEY,
      codigo          varchar(20) UNIQUE NOT NULL,
      nombre          varchar(120) NOT NULL,
      laboratorio     varchar(80),
      categoria       varchar(40) NOT NULL,
      presentacion    varchar(80),
      precio          numeric(8,2) NOT NULL CHECK (precio >= 0),
      existencias     integer NOT NULL DEFAULT 0 CHECK (existencias >= 0),
      requiere_receta boolean NOT NULL DEFAULT false,
      imagen          bytea,
      imagen_tipo     varchar(40),
      creado          timestamptz NOT NULL DEFAULT now(),
      actualizado     timestamptz NOT NULL DEFAULT now()
    );`);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM productos");
  if (rows[0].n > 0) return;
  const ejemplos = [
    ["MED-001", "Acetaminofén 500 mg", "Laboratorios Cuscatlán", "Medicamentos", "Caja 100 tabletas", 3.25, 240, false, "caja", "#0b256e"],
    ["MED-002", "Ibuprofeno 400 mg", "Laboratorios Izalco", "Medicamentos", "Caja 30 tabletas", 4.10, 180, false, "caja", "#d8262f"],
    ["MED-003", "Amoxicilina 500 mg", "Laboratorios Lempa", "Medicamentos", "Caja 21 cápsulas", 6.75, 60, true, "caja", "#7b3fa0"],
    ["MED-004", "Loratadina 10 mg", "Laboratorios Cuscatlán", "Medicamentos", "Caja 10 tabletas", 2.40, 0, false, "caja", "#1f9bd1"],
    ["VIT-001", "Vitamina C 1000 mg", "Natural Plus", "Vitaminas", "Frasco 60 tabletas", 8.95, 75, false, "frasco", "#f39200"],
    ["VIT-002", "Complejo B", "Natural Plus", "Vitaminas", "Frasco 100 tabletas", 7.50, 42, false, "frasco", "#a3bf35"],
    ["CUI-001", "Bloqueador solar FPS 50", "Dermacare", "Cuidado personal", "Tubo 120 ml", 12.90, 30, false, "tubo", "#f7c300"],
    ["CUI-002", "Shampoo anticaspa", "Dermacare", "Cuidado personal", "Botella 400 ml", 5.60, 55, false, "frasco", "#173589"],
    ["BEB-001", "Pañales etapa 3", "Bebé Feliz", "Bebés", "Paquete 40 unidades", 11.25, 25, false, "paquete", "#7cc4ef"],
    ["PRI-001", "Alcohol gel 70 %", "Asepsia", "Primeros auxilios", "Botella 250 ml", 2.95, 150, false, "frasco", "#2fa84f"],
    ["PRI-002", "Curitas surtidas", "Asepsia", "Primeros auxilios", "Caja 30 unidades", 1.80, 90, false, "caja", "#e94e77"],
    ["LIB-001", "Cuaderno universitario", "Escolar SV", "Librería", "100 hojas rayado", 1.95, 120, false, "cuaderno", "#0b256e"],
  ];
  for (const [codigo, nombre, lab, cat, pres, precio, exist, receta, figura, color] of ejemplos)
    await pool.query(
      `INSERT INTO productos (codigo, nombre, laboratorio, categoria, presentacion, precio, existencias, requiere_receta, imagen, imagen_tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'image/svg+xml')`,
      [codigo, nombre, lab, cat, pres, precio, exist, receta, Buffer.from(ilustracion(figura, color, nombre))]);
  console.log("Catálogo de ejemplo cargado");
}
