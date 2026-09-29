// utils/gifts.js — Catálogo de regalos virtuales (fuente única de verdad).
// El backend lo usa para el precio en Stripe; el frontend lo pide por
// GET /api/gifts/catalog para dibujar la tienda.

const GIFT_CATALOG = [
  {
    id: 'rosa',
    emoji: '🌹',
    priceCents: 99, // $0.99
    productName: 'Rosa virtual — Citas NH',
  },
  {
    id: 'trago',
    emoji: '🍹',
    priceCents: 299, // $2.99
    productName: 'Trago virtual — Citas NH',
  },
  {
    id: 'diamante',
    emoji: '💎',
    priceCents: 499, // $4.99
    productName: 'Diamante virtual — Citas NH',
  },
];

function getGift(id) {
  return GIFT_CATALOG.find((g) => g.id === id) || null;
}

module.exports = { GIFT_CATALOG, getGift };
