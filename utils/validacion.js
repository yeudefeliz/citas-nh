// utils/validacion.js — Validaciones compartidas por varias rutas.
// IMPORTANTE: la validación del código postal (cualquier país) y de la
// edad (+18) se hace aquí, EN EL SERVIDOR. Nunca confíes en lo que valide
// el frontend.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Código postal de cualquier país: ZIP de USA (5 dígitos o ZIP+4) y
// formatos internacionales razonables (letras, dígitos, espacios y
// guiones, de 3 a 10 caracteres en total).
const ZIP_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

// ¿El email tiene un formato básico válido?
function emailValido(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// ¿El código postal tiene un formato válido (USA o internacional)?
// Antes solo se aceptaban ZIPs de New Hampshire; desde la apertura de
// ámbito de MTP (oct 2026) se acepta cualquier país. Si el código no
// tiene coordenadas conocidas, el registro se completa igual y el
// perfil simplemente no se filtra por distancia (ver utils/zipcoords.js).
function zipValido(zip) {
  if (typeof zip !== 'string') return false;
  const z = zip.trim();
  return z.length >= 3 && z.length <= 10 && ZIP_RE.test(z);
}

// ¿La fecha de nacimiento es una fecha real con formato YYYY-MM-DD?
function dobValida(dob) {
  if (typeof dob !== 'string' || !DOB_RE.test(dob)) return false;
  const [y, m, d] = dob.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  // Comparamos los componentes para rechazar fechas imposibles como 2000-02-30.
  return (
    fecha.getFullYear() === y &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d
  );
}

// Calcula la edad actual a partir de la fecha de nacimiento (YYYY-MM-DD).
function calcularEdad(dob) {
  const [y, m, d] = dob.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < m || (mesActual === m && hoy.getDate() < d)) {
    edad -= 1; // Todavía no cumplió años este año.
  }
  return edad;
}

// Limpia un texto: lo recorta y lo deja en '' si no es un string.
function limpiarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

module.exports = { emailValido, zipValido, dobValida, calcularEdad, limpiarTexto };
