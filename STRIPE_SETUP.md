# Activar Premium con Stripe — paso a paso

El código ya está listo. Solo falta conectar tu cuenta de Stripe.
Stripe es gratis (solo cobra 2.9% + $0.30 por cada pago que recibas).

## Paso 1: Crea tu cuenta de Stripe
1. Entra a **stripe.com** y toca *Start now* / *Crear cuenta*.
2. Regístrate con tu correo y activa la cuenta (te pide datos básicos
   de tu negocio: nombre, dirección, cuenta de banco para recibir el dinero).

## Paso 2: Crea el producto Premium
1. En el dashboard de Stripe ve a **Product catalog** → **Create product**.
2. Nombre: `Citas NH Premium`.
3. Precio: **$4.99**, **mensual** (recurring).
4. Guarda y copia el **Price ID** (empieza con `price_...`).

## Paso 3: Copia tus claves
1. Ve a **Developers** → **API keys**.
2. Copia la **Secret key** (empieza con `sk_live_...`).
   - Mientras pruebas puedes usar la de test (`sk_test_...`), pero para
     cobrar de verdad usa la *live*.

## Paso 4: Crea el webhook
1. Ve a **Developers** → **Webhooks** → **Add endpoint**.
2. URL: `https://citas-nh.onrender.com/api/billing/webhook`
3. En *Events*, agrega estos 3:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
4. Guarda y copia el **Signing secret** (empieza con `whsec_...`).

## Paso 5: Pon las claves en Render
1. En render.com abre tu servicio **citas-nh** → **Environment**.
2. Agrega estas 3 variables:
   - `STRIPE_SECRET_KEY` = tu secret key (`sk_live_...`)
   - `STRIPE_PRICE_ID` = tu price ID (`price_...`)
   - `STRIPE_WEBHOOK_SECRET` = tu signing secret (`whsec_...`)
3. Guarda — Render redespliega solo.

## Paso 6 (opcional): Portal del cliente
Para que los usuarios puedan cancelar solos:
1. En Stripe ve a **Settings** → **Billing** → **Customer portal**.
2. Actívalo (viene con una configuración por defecto que sirve).

## Cómo probar
1. Regístrate en la app y entra a **Ajustes → Ver planes**.
2. Paga con la tarjeta de prueba `4242 4242 4242 4242` (si usas claves test).
3. Vuelve a la app: debes ver "Premium activo 👑".

## Qué incluye el Premium ($4.99/mes)
- Ver quién te dio like 💛
- Likes ilimitados (gratis: 10 por día) ❤️‍🔥
- Cancelación en un toque desde el portal
