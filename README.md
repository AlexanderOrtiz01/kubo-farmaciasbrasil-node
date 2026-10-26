# Farmacias Brasil · Catálogo de productos (Node.js + Express + PostgreSQL)

Cliente 2 de **Kubo PaaS** (plan premium). API RESTful del catálogo de la cadena de farmacias (medicamentos,
vitaminas, cuidado personal, bebés, primeros auxilios y librería) con **foto por producto**, y una página que la consume
para listar, buscar, filtrar, crear, editar y eliminar.

> Proyecto académico de Informática en la Nube: caso simulado, sin relación oficial con Farmacias Brasil.
> El logo y los colores se usan solo para ambientar al cliente ficticio.

| | |
|---|---|
| Stack | Node.js 22 · Express 5 · PostgreSQL 17 (base administrada por Kubo) · drivers `pg` y `multer` |
| URL pública | El subdominio que asigne Kubo (por ejemplo `https://farmaciasbrasil.kubo.dpdns.org`) |
| Despliegue | Kubo vigila la rama `main`: cada `git push` construye la imagen con este `Dockerfile` y la despliega en menos de 1 minuto de detectarlo (sin configurar nada en GitHub) |

## Variables de entorno

| Variable | Quién la define | Dónde |
|---|---|---|
| `DATABASE_URL` (y `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) | Kubo | Secret de la base administrada, inyectado en el pod |
| `TZ` u otras de la empresa | El cliente | Panel de Kubo → *Variables de entorno* |
| `KUBO_COMMIT`, `KUBO_POD` | Kubo | Commit desplegado y réplica que atiende |

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/productos?buscar=&categoria=` | Lista de productos (sin la foto; trae `imagen_url`) |
| GET | `/api/productos/:id` | Un producto |
| POST | `/api/productos` | Crea un producto. JSON o `multipart/form-data` con el campo `imagen` |
| PUT / PATCH | `/api/productos/:id` | Actualiza los campos enviados; `imagen` la reemplaza y `quitar_imagen=true` la borra |
| DELETE | `/api/productos/:id` | Elimina el producto |
| GET | `/api/productos/:id/imagen` | Foto del producto (sale de PostgreSQL) |
| GET | `/api/categorias`, `/api/resumen` | Categorías y totales del inventario |
| GET | `/api/info`, `/salud` | Versiones de Node, Express y PostgreSQL, pod y commit |

Campos: `codigo`, `nombre`, `categoria` (obligatorios), `laboratorio`, `presentacion`, `precio`, `existencias`,
`requiere_receta`.

```bash
curl -X POST https://farmaciasbrasil.kubo.dpdns.org/api/productos \
  -F codigo=MED-010 -F "nombre=Paracetamol 500 mg" -F categoria=Medicamentos \
  -F precio=2.75 -F existencias=50 -F imagen=@foto.jpg
```

## Fotos

Las fotos (JPG, PNG o WebP, hasta 2 MB; el tipo se comprueba por el contenido del archivo) se guardan en la columna
`bytea` de la tabla `productos`. Así las ven todas las réplicas del plan premium y sobreviven a cada despliegue.

La imagen corre sin root (UID 1000) en el puerto 3000. Las tablas se crean al arrancar si no existen.
El pie de la página muestra el commit en línea: así se comprueba que cada `git push` llegó a producción.
