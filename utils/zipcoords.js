// utils/zipcoords.js — Coordenadas aproximadas de los ZIPs principales de NH.
// Se usa para el filtro de distancia en Descubrir. Si un ZIP no está en el
// mapa, se devuelve null y el perfil se incluye igual (sin filtrar).

// lat/lng aproximadas por ciudad (centro del ZIP principal).
const ZIP_COORDS = {
  // Manchester
  '03101': [42.9956, -71.4548],
  '03102': [42.9650, -71.4680],
  '03103': [43.0097, -71.4381],
  '03104': [43.0125, -71.4358],
  '03109': [42.9830, -71.4350],
  '03110': [42.9462, -71.5172], // Bedford
  // Nashua
  '03060': [42.7654, -71.4676],
  '03061': [42.7710, -71.4930],
  '03062': [42.7420, -71.5000],
  '03063': [42.7300, -71.5200],
  '03064': [42.7654, -71.4676],
  // Alrededores sur
  '03079': [42.7886, -71.2424], // Salem
  '03038': [42.8806, -71.3273], // Derry
  '03053': [42.8651, -71.3739], // Londonderry
  '03054': [42.8653, -71.4931], // Merrimack
  '03051': [42.7654, -71.4344], // Hudson
  '03031': [42.8587, -71.5762], // Amherst
  '03049': [42.7437, -71.5923], // Hollis
  '03055': [42.8354, -71.6468], // Milford
  '03045': [43.0206, -71.5995], // Goffstown
  '03077': [43.0356, -71.1834], // Raymond
  '03042': [43.0437, -71.0762], // Epping
  // Capital y centro
  '03301': [43.2081, -71.5376], // Concord
  '03235': [43.4442, -71.6484], // Franklin
  '03246': [43.5722, -71.4784], // Laconia
  '03264': [43.7574, -71.6885], // Plymouth
  '03894': [43.5846, -71.2099], // Wolfeboro
  // Seacoast
  '03801': [43.0718, -70.7626], // Portsmouth
  '03824': [43.1340, -70.9267], // Durham
  '03820': [43.1979, -70.8737], // Dover
  '03878': [43.2629, -70.8653], // Somersworth
  '03867': [43.3045, -70.9756], // Rochester
  '03833': [42.9815, -70.9482], // Exeter
  '03857': [43.0821, -70.9356], // Newmarket
  '03842': [42.9376, -70.8173], // Hampton
  // Oeste
  '03431': [42.9337, -72.2781], // Keene
  '03458': [42.8709, -71.9598], // Peterborough
  '03743': [43.3737, -72.3359], // Claremont
  '03766': [43.6423, -72.2518], // Lebanon
  '03755': [43.7022, -72.2896], // Hanover
  // Norte
  '03570': [44.4687, -71.1851], // Berlin
  '03561': [44.3059, -71.7717], // Littleton
  '03818': [43.9783, -71.1209], // Conway
};

function coordsDeZip(zip) {
  if (typeof zip !== 'string') return null;
  const c = ZIP_COORDS[zip.trim().slice(0, 5)];
  return c ? { lat: c[0], lng: c[1] } : null;
}

// Distancia haversiana en millas entre dos coordenadas.
function distanciaMillas(a, b) {
  const R = 3958.8; // radio de la Tierra en millas
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distancia en millas entre dos ZIPs de NH (null si alguno no está en el mapa).
function distanciaEntreZips(zipA, zipB) {
  const a = coordsDeZip(zipA);
  const b = coordsDeZip(zipB);
  if (!a || !b) return null;
  return distanciaMillas(a, b);
}

module.exports = { coordsDeZip, distanciaMillas, distanciaEntreZips };
