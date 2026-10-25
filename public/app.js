// Página del catálogo: consume la API REST de la misma app (/api/productos)
const $ = (s) => document.querySelector(s);
const dinero = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });
const estado = { categoria: "", buscar: "", editando: null, productos: [] };

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, opciones);
  if (r.status === 204) return null;
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || "Error"), { errores: datos.errores || [datos.error || `Error ${r.status}`] });
  return datos;
}

function elemento(etiqueta, props = {}, ...hijos) {
  const e = Object.assign(document.createElement(etiqueta), props);
  e.append(...hijos.filter((h) => h !== null && h !== undefined));
  return e;
}

function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.hidden = true), 4000);
}

async function cargarResumen() {
  const r = await api("/api/resumen");
  const datos = [["Productos", r.productos], ["Unidades", r.unidades.toLocaleString("es-SV")], ["Agotados", r.agotados, r.agotados > 0],
    ["Con receta", r.con_receta], ["Valor del inventario", dinero.format(r.valor)]];
  $("#resumen").replaceChildren(...datos.map(([t, v, alerta]) =>
    elemento("div", {}, elemento("span", { textContent: t }), elemento("strong", { textContent: v, className: alerta ? "alerta" : "" }))));
}

async function cargar() {
  const q = new URLSearchParams();
  if (estado.buscar) q.set("buscar", estado.buscar);
  if (estado.categoria) q.set("categoria", estado.categoria);
  estado.productos = await api(`/api/productos?${q}`);
  $("#vacio").hidden = estado.productos.length > 0;
  $("#rejilla").replaceChildren(...estado.productos.map(tarjeta));
}

function tarjeta(p) {
  const foto = p.imagen_url ? elemento("img", { src: p.imagen_url, alt: p.nombre, loading: "lazy" }) : elemento("span", { className: "sin-foto", textContent: "Sin foto" });
  const editar = elemento("button", { className: "boton boton-sec", textContent: "Editar", onclick: () => abrir(p) });
  const borrar = elemento("button", { className: "enlace-peligro", textContent: "Eliminar", onclick: () => eliminar(p) });
  return elemento("li", { className: "tarjeta" },
    elemento("div", { className: "foto" }, foto,
      p.requiere_receta ? elemento("span", { className: "chip chip-receta", textContent: "Con receta" }) : null),
    elemento("div", { className: "tarjeta-cuerpo" },
      elemento("span", { className: "categoria", textContent: p.categoria }),
      elemento("h3", { textContent: p.nombre }),
      elemento("p", { className: "detalle", textContent: [p.presentacion, p.laboratorio].filter(Boolean).join(" · ") }),
      elemento("div", { className: "precio-fila" },
        elemento("strong", { className: "precio", textContent: dinero.format(p.precio) }),
        elemento("span", { className: p.existencias === 0 ? "alerta" : "stock", textContent: p.existencias === 0 ? "Agotado" : `${p.existencias} disp.` })),
      elemento("code", { textContent: p.codigo })),
    elemento("div", { className: "acciones" }, editar, borrar));
}

function abrir(p = null) {
  estado.editando = p;
  const f = $("#formulario");
  f.reset();
  $("#errores").hidden = true;
  $("#titulo-form").textContent = p ? `Editar «${p.nombre}»` : "Nuevo producto";
  $("#guardar").textContent = p ? "Guardar cambios" : "Agregar al catálogo";
  for (const c of ["codigo", "nombre", "laboratorio", "presentacion", "precio", "existencias"]) f.elements[c].value = p ? (p[c] ?? "") : "";
  f.elements.categoria.value = p ? p.categoria : "Medicamentos";
  f.elements.requiere_receta.checked = p ? p.requiere_receta : false;
  if (!p) f.elements.existencias.value = 0;
  mostrarVista(p?.imagen_url || null);
  $("#quitar-envoltura").hidden = !p?.imagen_url;
  $("#dialogo").showModal();
}

function mostrarVista(src) {
  $("#vista").hidden = !src;
  if (src) $("#vista").src = src; else $("#vista").removeAttribute("src");
  $("#sin-vista").hidden = !!src;
}

async function guardar(e) {
  e.preventDefault();
  const f = $("#formulario");
  const datos = new FormData(f);
  if (!datos.get("imagen")?.size) datos.delete("imagen");
  datos.set("requiere_receta", f.elements.requiere_receta.checked ? "true" : "false");
  const p = estado.editando;
  $("#guardar").disabled = true;
  try {
    const r = await api(p ? `/api/productos/${p.id}` : "/api/productos", { method: p ? "PUT" : "POST", body: datos });
    $("#dialogo").close();
    avisar(p ? `«${r.nombre}» actualizado.` : `«${r.nombre}» agregado al catálogo.`);
    await Promise.all([cargar(), cargarResumen()]);
  } catch (err) {
    $("#errores").replaceChildren(...err.errores.map((t) => elemento("li", { textContent: t })));
    $("#errores").hidden = false;
  } finally {
    $("#guardar").disabled = false;
  }
}

async function eliminar(p) {
  if (!confirm(`¿Eliminar «${p.nombre}» del catálogo?`)) return;
  try {
    await api(`/api/productos/${p.id}`, { method: "DELETE" });
    avisar(`«${p.nombre}» eliminado del catálogo.`);
    await Promise.all([cargar(), cargarResumen()]);
  } catch (err) { avisar(err.errores.join(" ")); }
}

async function iniciar() {
  const categorias = await api("/api/categorias");
  $("#sel-categoria").replaceChildren(...categorias.map((c) => elemento("option", { textContent: c })));
  const botones = ["", ...categorias].map((c) => elemento("button", {
    type: "button", textContent: c || "Todo", role: "tab",
    onclick: (e) => {
      estado.categoria = c;
      for (const b of $("#categorias").children) b.setAttribute("aria-selected", String(b === e.currentTarget));
      cargar();
    },
  }));
  botones[0].setAttribute("aria-selected", "true");
  $("#categorias").replaceChildren(...botones);

  $("#buscar").addEventListener("submit", (e) => { e.preventDefault(); estado.buscar = $("#texto").value.trim(); cargar(); });
  $("#texto").addEventListener("search", () => { estado.buscar = $("#texto").value.trim(); cargar(); });
  $("#nuevo").addEventListener("click", () => abrir());
  $("#cancelar").addEventListener("click", () => $("#dialogo").close());
  $("#formulario").addEventListener("submit", guardar);
  $("#imagen").addEventListener("change", (e) => { const a = e.target.files[0]; if (a) mostrarVista(URL.createObjectURL(a)); });

  await Promise.all([cargar(), cargarResumen()]);
  const info = await api("/api/info");
  $("#stack").replaceChildren(...Object.entries(info).map(([k, v]) => elemento("li", {}, elemento("b", { textContent: k }), ` ${v}`)));
}

iniciar().catch((e) => avisar(`No se pudo cargar el catálogo: ${e.message}`));
