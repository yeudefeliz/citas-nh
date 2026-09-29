// routes/icebreakers.js — Preguntas rompehielo aleatorias para el chat.
//   GET /api/icebreakers/random?lang=es|en → {question}

const express = require('express');
const { auth } = require('../middleware/auth');

const router = express.Router();

const PREGUNTAS_ES = [
  '¿Playa o montaña? 🏖️',
  '¿Cuál es tu comida dominicana favorita? 🍽️',
  '¿Qué haces un domingo perfecto?',
  '¿Café o té? ☕',
  '¿Cuál fue tu último viaje?',
  '¿Qué canción no te sacas de la cabeza? 🎵',
  '¿Prefieres salir o quedarte en casa viendo pelis? 🎬',
  '¿Cuál es tu restaurante favorito en NH?',
  '¿Tienes alguna meta para este año?',
  '¿Qué te hace reír sin control? 😂',
  '¿Madrugador o noctámbulo? 🌙',
  '¿Cuál es tu serie favorita del momento?',
  '¿Qué talento escondido tienes?',
  '¿Frío o calor? ❄️🔥',
  '¿Cuál es tu postre favorito? 🍰',
  '¿Qué es lo más loco que has hecho?',
  '¿Bachata, salsa o dembow? 💃',
  '¿Tienes mascotas? 🐶',
  '¿Qué te gusta hacer los fines de semana?',
  '¿Cuál es tu comida de confort?',
  '¿Prefieres la ciudad o el campo?',
  '¿Qué superpoder elegirías?',
  '¿Cuál es tu película favorita de todos los tiempos?',
  '¿Qué es lo primero que haces al levantarte?',
  '¿Te gusta cocinar? ¿Cuál es tu plato estrella? 👨‍🍳',
  '¿Qué lugar de NH recomiendas visitar?',
  '¿Cuál fue tu mejor cumpleaños?',
  '¿Qué aprendiste este año?',
  '¿Dulce o salado? 🍩',
  '¿Qué te pone de buen humor al instante?',
];

const PREGUNTAS_EN = [
  'Beach or mountains? 🏖️',
  'What’s your favorite Dominican dish? 🍽️',
  'What does a perfect Sunday look like for you?',
  'Coffee or tea? ☕',
  'What was your last trip?',
  'What song is stuck in your head right now? 🎵',
  'Do you prefer going out or staying in with movies? 🎬',
  'What’s your favorite restaurant in NH?',
  'Do you have a goal for this year?',
  'What makes you laugh uncontrollably? 😂',
  'Early bird or night owl? 🌙',
  'What’s your favorite show right now?',
  'Do you have a hidden talent?',
  'Cold or heat? ❄️🔥',
  'What’s your favorite dessert? 🍰',
  'What’s the craziest thing you’ve ever done?',
  'Bachata, salsa or dembow? 💃',
  'Do you have pets? 🐶',
  'What do you like to do on weekends?',
  'What’s your comfort food?',
  'Do you prefer the city or the countryside?',
  'What superpower would you choose?',
  'What’s your all-time favorite movie?',
  'What’s the first thing you do when you wake up?',
  'Do you like cooking? What’s your signature dish? 👨‍🍳',
  'What NH spot would you recommend visiting?',
  'What was your best birthday?',
  'What did you learn this year?',
  'Sweet or savory? 🍩',
  'What instantly puts you in a good mood?',
];

// GET /api/icebreakers/random?lang=es|en → {question}
router.get('/random', auth, (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  const lista = lang === 'en' ? PREGUNTAS_EN : PREGUNTAS_ES;
  const pregunta = lista[Math.floor(Math.random() * lista.length)];
  return res.json({ question: pregunta, lang });
});

module.exports = router;
