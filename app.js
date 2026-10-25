/* ============================================================
   CATÁLOGO DISTRIBUIDORA - LÓGICA (app.js)
   ============================================================
   Responsabilidades:
     1. Configuración (URL del CSV, número de WhatsApp)
     2. Estado (productos cargados, carrito)
     3. Utilidades (formato de precio, parseo)
     4. Carga del CSV
     5. Renderizado de productos
     6. Filtros (buscador + marca)
     7. Carrito
     8. Modal y envío por WhatsApp
   ------------------------------------------------------------
   MODELO DE DATOS

   Producto:
     { marca, numero, nombre, cant, precio,
       uniCaja, precioCaja, imagen, esPromo }

   Carrito (objeto clave-valor):
     clave = "numero__tipo"   (ej: "99__U", "99__F", "99__P")
     valor = { qty, precio, nombre, tipo, uniCaja, marca }

   Tipos de ítem:
     U = unidad  (precio unitario)
     F = fardo   (precio de fardo con 10% OFF)
     P = promo   (precio a confirmar con el vendedor)
   ============================================================ */


/* ---------- 1. CONFIGURACIÓN ---------- */
const URL_CSV  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTY7KHsuN6HDxt-xp4mH52cU_iW0x9yJB043eVr9lw8tcASVJeyoMq7lwCl2J6WTM_nBQQz-PgQVxFU/pub?output=csv";
const WHATSAPP = "5493874836526";


/* ---------- 2. ESTADO ---------- */

/** Lista de productos cargados del CSV. */
let todosLosProductos = [];

/** Carrito de compras. Clave = "numero__tipo". */
const carrito = {};


/* ---------- 3. UTILIDADES ---------- */

/** Formatea un número como precio argentino: 1234 → "1.234" */
function formatoPrecio(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** Convierte texto del CSV a número (acepta $, comas y puntos). */
function parseNum(valor) {
  if (!valor) return 0;
  let v = String(valor).replace(/"/g, "").replace(/\$/g, "").trim();

  if (v.includes(",") && v.includes(".")) {
    if (v.lastIndexOf(",") > v.lastIndexOf(".")) {
      v = v.replace(/\./g, "").replace(",", ".");
    } else {
      v = v.replace(/,/g, "");
    }
  } else if (v.includes(",")) {
    v = v.replace(",", ".");
  }

  const num = parseFloat(v);
  return isNaN(num) ? 0 : num;
}

/** Escapa caracteres especiales para insertar texto seguro en HTML. */
function escaparHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}


/* ---------- 4. CARGA DEL CSV ---------- */

async function cargarProductos() {
  try {
    const respuesta = await fetch(URL_CSV);
    const texto = await respuesta.text();
    procesarCSV(texto);
    poblarMarcas();
    renderizarProductos(todosLosProductos);
    document.getElementById("estado").innerText = `${todosLosProductos.length} productos`;
  } catch (error) {
    console.error("Error al cargar el CSV:", error);
    document.getElementById("estado").innerText = "Error al cargar el catálogo";
  }
}

function procesarCSV(texto) {
  const filas = texto.split("\n").filter(f => f.trim() !== "");
  const separador = texto.includes(";") ? ";" : ",";
  const regexSep = new RegExp(`${separador}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

  for (let i = 1; i < filas.length; i++) {
    const cols = filas[i].split(regexSep);
    if (cols.length < 3) continue;

    const limpiar = v => (v || "").replace(/^"+|"+$/g, "").trim();

    const marca  = limpiar(cols[0]) || "Otros";
    const numero = limpiar(cols[1]) || String(i);
    const nombre = limpiar(cols[2]);

    if (!nombre || nombre.toLowerCase() === "nombre") continue;

    const cant       = parseInt(limpiar(cols[3])) || 0;
    const precio     = parseNum(cols[4]);
    const uniCaja    = parseInt(limpiar(cols[5])) || 1;
    const imagen     = limpiar(cols[7]) ||
                       `https://placehold.co/300?text=${encodeURIComponent(nombre.slice(0, 15))}`;
    const esPromo    = /promo/i.test(nombre) || /promo/i.test(marca);
    const precioCaja = Math.round(precio * uniCaja * 0.9);   /* 10% OFF */

    todosLosProductos.push({
      marca, numero, nombre, cant,
      precio, uniCaja, precioCaja, imagen, esPromo
    });
  }
}

function poblarMarcas() {
  const marcas = [...new Set(todosLosProductos.map(p => p.marca))].sort();
  const cont = document.getElementById("carousel-marcas");

  let html = `<button class="marca-btn activo" data-marca="todas">Todas (${todosLosProductos.length})</button>`;

  for (const m of marcas) {
    html += `<button class="marca-btn" data-marca="${escaparHTML(m)}">${escaparHTML(m)}</button>`;
  }

  cont.innerHTML = html;
}


/* ---------- 5. RENDERIZADO ---------- */

/** Renderiza la lista de productos. Las promos reales van primero. */
function renderizarProductos(lista) {
  /* Orden: promos primero, resto después (sort estable conserva el orden interno) */
  const ordenada = [...lista].sort((a, b) => {
    if (a.esPromo && !b.esPromo) return -1;
    if (!a.esPromo && b.esPromo) return 1;
    return 0;
  });

  const cont = document.getElementById("productos");
  cont.innerHTML = ordenada.map(renderCard).join("");
}

/** Devuelve el HTML de una tarjeta de producto. */
function renderCard(p) {
  const qtyU = carrito[p.numero + "__U"]?.qty || 0;
  const qtyF = carrito[p.numero + "__F"]?.qty || 0;
  const qtyP = carrito[p.numero + "__P"]?.qty || 0;

  const botones = p.cant <= 0
    ? botonesSinStock(p, qtyP)
    : botonesNormales(p, qtyU, qtyF, qtyP);

  return `
    <div class="card">
      ${p.esPromo ? '<span class="badge-promo">PROMO</span>' : ""}
      <img
        src="${escaparHTML(p.imagen)}"
        alt="${escaparHTML(p.nombre)}"
        onerror="this.src='https://placehold.co/300?text=Sin+Foto'"
      >
      <small>${escaparHTML(p.marca)} - ${escaparHTML(p.numero)}</small>
      <h3>${escaparHTML(p.nombre)}</h3>
      ${botones}
    </div>
  `;
}

function botonesSinStock(p, qtyP) {
  const cod = escaparHTML(p.numero);
  return `
    <button disabled class="btn btn-sin-stock">Sin Stock</button>

    <div class="qty" style="margin-top:8px">
      <button data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="-1">-</button>
      <span id="qty-${cod}-P">${qtyP}</span>
      <button data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="1">+</button>
    </div>

    <div class="aviso-promo">Sujeto a promoción vigente</div>
    <button class="btn btn-promo" data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="1">PROMO</button>
  `;
}

function botonesNormales(p, qtyU, qtyF, qtyP) {
  const cod = escaparHTML(p.numero);

  return `
    <div style="font-size:11px;">Unidad: $${formatoPrecio(p.precio)}</div>

    <div class="qty">
      <button data-action="cambiar" data-cod="${cod}" data-tipo="U" data-delta="-1">-</button>
      <span id="qty-${cod}-U">${qtyU}</span>
      <button data-action="cambiar" data-cod="${cod}" data-tipo="U" data-delta="1">+</button>
    </div>
    <button class="btn btn-add" data-action="cambiar" data-cod="${cod}" data-tipo="U" data-delta="1">Unidad</button>

    ${p.uniCaja > 1 ? `
      <div style="font-size:11px;margin-top:6px;">
        Fardo x${p.uniCaja}: $${formatoPrecio(p.precioCaja)}
        <span style="color:green">10% OFF</span>
      </div>
      <div class="qty">
        <button data-action="cambiar" data-cod="${cod}" data-tipo="F" data-delta="-1">-</button>
        <span id="qty-${cod}-F">${qtyF}</span>
        <button data-action="cambiar" data-cod="${cod}" data-tipo="F" data-delta="1">+</button>
      </div>
      <button class="btn btn-fardo" data-action="cambiar" data-cod="${cod}" data-tipo="F" data-delta="1">Fardo x${p.uniCaja}</button>
    ` : ""}

    <div class="qty" style="margin-top:8px">
      <button data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="-1">-</button>
      <span id="qty-${cod}-P">${qtyP}</span>
      <button data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="1">+</button>
    </div>
    <div class="aviso-promo">Sujeto a promoción vigente</div>
    <button class="btn btn-promo" data-action="cambiar" data-cod="${cod}" data-tipo="P" data-delta="1">PROMO</button>
  `;
}


/* ---------- 6. FILTROS ---------- */

function filtrarTodo() {
  const texto = document.getElementById("buscador").value.toLowerCase();
  const marcaActiva = document.querySelector(".marca-btn.activo")?.dataset.marca || "todas";

  let lista = marcaActiva === "todas"
    ? todosLosProductos
    : todosLosProductos.filter(p => p.marca === marcaActiva);

  if (texto) {
    lista = lista.filter(p =>
      p.nombre.toLowerCase().includes(texto) ||
      p.numero.toLowerCase().includes(texto) ||
      p.marca.toLowerCase().includes(texto)
    );
  }

  renderizarProductos(lista);
  document.getElementById("estado").innerText = `${lista.length} productos`;
}

function filtrarPorMarca(marca) {
  document.querySelectorAll(".marca-btn").forEach(btn => {
    btn.classList.toggle("activo", btn.dataset.marca === marca);
  });
  filtrarTodo();
}


/* ---------- 7. CARRITO ---------- */

/** Suma (o resta) `delta` a la cantidad del ítem. tipo = "U" | "F" | "P" */
function cambiar(cod, tipo, delta) {
  const prod = todosLosProductos.find(p => p.numero === cod);
  if (!prod) return;

  const clave = cod + "__" + tipo;
  const precio = tipo === "F" ? prod.precioCaja : tipo === "P" ? 0 : prod.precio;

  if (!carrito[clave]) {
    carrito[clave] = {
      qty: 0, precio,
      nombre: prod.nombre, tipo,
      uniCaja: prod.uniCaja, marca: prod.marca
    };
  }

  carrito[clave].qty += delta;
  if (carrito[clave].qty <= 0) delete carrito[clave];

  /* Actualiza solo el span afectado (no re-renderiza toda la grilla) */
  const span = document.getElementById(`qty-${cod}-${tipo}`);
  if (span) span.innerText = carrito[clave]?.qty || 0;

  actualizarBarra();
}

function actualizarBarra() {
  let items = 0, total = 0, promos = 0;

  for (const clave in carrito) {
    const item = carrito[clave];
    items += item.qty;
    if (item.tipo !== "P") total += item.qty * item.precio;
    else promos += item.qty;
  }

  document.getElementById("carrito-count").innerText = items;
  document.getElementById("carrito-total").innerText =
    formatoPrecio(total) + (promos ? ` + ${promos} promo${promos > 1 ? "s" : ""}` : "");
}


/* ---------- 8. MODAL Y WHATSAPP ---------- */

function abrirModal() {
  if (!Object.keys(carrito).length) {
    alert("El carrito está vacío");
    return;
  }
  document.getElementById("modal-datos").classList.add("abierto");
}

function cerrarModal() {
  document.getElementById("modal-datos").classList.remove("abierto");
}

function confirmarEnvio() {
  const nombre    = document.getElementById("cli-nombre").value.trim();
  const direccion = document.getElementById("cli-dire").value.trim();
  const nota      = document.getElementById("cli-nota").value.trim();

  if (nombre.length < 3 || direccion.length < 3) {
    alert("Nombre y dirección son obligatorios");
    return;
  }

  let msg = `*NUEVO PEDIDO*%0A`;
  msg += `Cliente: ${nombre}%0A`;
  msg += `Dirección: ${direccion}%0A`;
  if (nota) msg += `Nota: ${nota}%0A`;
  msg += `%0A--- DETALLE ---%0A`;

  let total = 0;

  for (const clave in carrito) {
    const item = carrito[clave];
    if (item.tipo === "U") {
      msg += `• ${item.qty}x UNIDAD - ${item.nombre} = $${formatoPrecio(item.qty * item.precio)}%0A`;
      total += item.qty * item.precio;
    } else if (item.tipo === "F") {
      msg += `• ${item.qty}x FARDO x${item.uniCaja} - ${item.nombre} = $${formatoPrecio(item.qty * item.precio)}%0A`;
      total += item.qty * item.precio;
    } else {
      msg += `• ${item.qty}x PROMO - ${item.nombre} - (sujeto a promo vigente)%0A`;
    }
  }

  msg += `%0A*TOTAL (sin promos): $${formatoPrecio(total)}*`;

  cerrarModal();
  window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, "_blank");
}


/* ---------- 9. INICIALIZACIÓN ---------- */

function inicializarEventos() {
  /* Buscador */
  document.getElementById("buscador").addEventListener("input", filtrarTodo);

  /* Botones estáticos */
  document.getElementById("btn-pedir").addEventListener("click", abrirModal);
  document.getElementById("btn-enviar").addEventListener("click", confirmarEnvio);
  document.getElementById("btn-cancelar").addEventListener("click", cerrarModal);

  /* Delegación: clic en cualquier botón de marca */
  document.getElementById("carousel-marcas").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-marca]");
    if (btn) filtrarPorMarca(btn.dataset.marca);
  });

  /* Delegación: clic en cualquier botón +/-/agregar dentro de una tarjeta */
  document.getElementById("productos").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "cambiar") {
      cambiar(btn.dataset.cod, btn.dataset.tipo, parseInt(btn.dataset.delta));
    }
  });
}

inicializarEventos();
cargarProductos();
