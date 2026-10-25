// Ilustraciones SVG del catálogo de ejemplo. Desde la página se reemplazan por fotos reales.
const escapar = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const FIGURAS = {
  caja: (c) => `<rect x="70" y="95" width="180" height="130" rx="10" fill="#fff" stroke="${c}" stroke-width="6"/>
    <rect x="70" y="95" width="180" height="38" rx="10" fill="${c}"/><rect x="92" y="150" width="70" height="10" rx="5" fill="${c}" opacity=".35"/>
    <rect x="92" y="170" width="110" height="10" rx="5" fill="${c}" opacity=".2"/><circle cx="215" cy="185" r="18" fill="#a3bf35"/>`,
  frasco: (c) => `<rect x="118" y="70" width="84" height="30" rx="6" fill="${c}"/><rect x="100" y="98" width="120" height="150" rx="22" fill="#fff" stroke="${c}" stroke-width="6"/>
    <rect x="112" y="140" width="96" height="62" rx="8" fill="${c}"/><rect x="124" y="158" width="56" height="9" rx="4" fill="#fff" opacity=".8"/>`,
  tubo: (c) => `<path d="M95 90 H225 L205 230 H115 Z" fill="${c}"/><rect x="130" y="230" width="60" height="26" rx="5" fill="#0b256e"/>
    <rect x="112" y="120" width="96" height="40" rx="8" fill="#fff" opacity=".85"/><circle cx="160" cy="190" r="16" fill="#fff" opacity=".5"/>`,
  paquete: (c) => `<rect x="70" y="80" width="180" height="160" rx="18" fill="${c}"/><rect x="70" y="80" width="180" height="40" rx="18" fill="#fff" opacity=".35"/>
    <circle cx="160" cy="172" r="36" fill="#fff"/><circle cx="148" cy="166" r="5" fill="#0b256e"/><circle cx="172" cy="166" r="5" fill="#0b256e"/>
    <path d="M146 184 Q160 196 174 184" stroke="#0b256e" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  cuaderno: (c) => `<rect x="90" y="70" width="150" height="190" rx="10" fill="${c}"/><rect x="104" y="70" width="10" height="190" fill="#fff" opacity=".5"/>
    <rect x="132" y="110" width="88" height="46" rx="6" fill="#fff"/><rect x="142" y="124" width="60" height="7" rx="3" fill="#a3bf35"/><rect x="142" y="138" width="40" height="7" rx="3" fill="#a3bf35"/>`,
};

export function ilustracion(figura, color, nombre) {
  const dibujo = (FIGURAS[figura] || FIGURAS.caja)(color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><title>${escapar(nombre)}</title>
    <rect width="320" height="320" fill="#f3f7fc"/><circle cx="160" cy="165" r="125" fill="#e4edf8"/>
    <path d="M262 46 h14 v-14 h12 v14 h14 v12 h-14 v14 h-12 v-14 h-14 z" fill="#a3bf35"/>${dibujo}</svg>`;
}
