// utils/validacion.js — Validaciones compartidas por varias rutas.
// IMPORTANTE: la validación de New Hampshire (zip) y de la edad (+18) se hace
// aquí, EN EL SERVIDOR. Nunca confíes en lo que valide el frontend.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Zips de New Hampshire: 030xx a 038xx.
const ZIP_NH_RE = /^03[0-8]\d{2}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

// ¿El email tiene un formato básico válido?
function emailValido(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// ¿El zip pertenece a New Hampshire (03000–03899)?
function zipValido(zip) {
  return typeof zip === 'string' && ZIP_NH_RE.test(zip.trim());
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
