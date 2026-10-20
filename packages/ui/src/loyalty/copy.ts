export type CardLocale = "en" | "es";

export type CardCopy = {
  loading: string;
  progress: string;
  reward: string;
  toGoOne: string;
  toGo: string;
  readyTitle: string;
  readyBody: string;
  codeLabel: string;
  codeHint: string;
  stampAdded: string;
  pausedTitle: string;
  pausedBody: string;
  closedTitle: string;
  closedBody: string;
  notFoundTitle: string;
  notFoundBody: string;
  invalidTitle: string;
  invalidBody: string;
  deviceTitle: string;
  deviceBody: string;
  limitedTitle: string;
  limitedBody: string;
  offline: string;
  offlineTitle: string;
  offlineBody: string;
  errorTitle: string;
  errorBody: string;
  joining: string;
  hint: string;
  hintDismiss: string;
  emailTitle: string;
  emailOptional: string;
  emailLabel: string;
  consent: string;
  unsubscribe: string;
  emailSubmit: string;
  emailDone: string;
  emailInvalid: string;
  emailUnavailable: string;
  savedTitle: string;
  savedNone: string;
  savedOpen: string;
};

export const CARD_COPY: Record<CardLocale, CardCopy> = {
  en: {
    loading: "Loading your card…",
    progress: "{n} of {total} stamps",
    reward: "Reward: {reward}",
    toGoOne: "1 more to your reward",
    toGo: "{k} more to your reward",
    readyTitle: "Your reward is ready",
    readyBody: "Show this card to the staff to redeem {reward}.",
    codeLabel: "Your card code",
    codeHint: "Show this code or the QR to the staff when you pay.",
    stampAdded: "Stamp added. {n} of {total}.",
    pausedTitle: "This card is paused",
    pausedBody: "The venue has paused its card for now. Your stamps are kept.",
    closedTitle: "This card is closed",
    closedBody: "It can no longer collect stamps. Ask at the venue for a new one.",
    notFoundTitle: "We could not find this card",
    notFoundBody: "Scan the QR at the venue to get a new one.",
    invalidTitle: "This QR no longer works",
    invalidBody: "Ask the staff for the current one.",
    deviceTitle: "You already got a card here today",
    deviceBody: "Open it from this phone's browser, or try again tomorrow.",
    limitedTitle: "Too many tries",
    limitedBody: "Wait a few minutes and try again.",
    offline: "No connection. Showing your card as it was.",
    offlineTitle: "No connection",
    offlineBody: "We could not reach your card. We will keep trying.",
    errorTitle: "Something went wrong",
    errorBody: "We could not get your card. Try scanning the QR again in a moment.",
    joining: "Getting your card…",
    hint: "Add this page to your home screen to open your card in one tap.",
    hintDismiss: "Got it",
    emailTitle: "Tell me about my rewards",
    emailOptional: "Optional. Your card works without it.",
    emailLabel: "Email",
    consent: "I agree to receive emails from {venue} about my card and its offers.",
    unsubscribe: "Every email has a link to unsubscribe in one click.",
    emailSubmit: "Keep me posted",
    emailDone: "Done. We will write to you about your rewards.",
    emailInvalid: "Check the email address.",
    emailUnavailable: "We could not link it this time.",
    savedTitle: "Your cards",
    savedNone: "Scan the QR at a venue to get a card.",
    savedOpen: "Open card",
  },
  es: {
    loading: "Cargando tu tarjeta…",
    progress: "{n} de {total} sellos",
    reward: "Premio: {reward}",
    toGoOne: "Te falta 1 para tu premio",
    toGo: "Te faltan {k} para tu premio",
    readyTitle: "Tu premio está listo",
    readyBody: "Enseña esta tarjeta al personal para canjear {reward}.",
    codeLabel: "Código de tu tarjeta",
    codeHint: "Enseña este código o el QR al personal al pagar.",
    stampAdded: "Sello añadido. {n} de {total}.",
    pausedTitle: "Esta tarjeta está en pausa",
    pausedBody: "El local ha pausado su tarjeta por ahora. Tus sellos se conservan.",
    closedTitle: "Esta tarjeta está cerrada",
    closedBody: "Ya no puede sumar sellos. Pide una nueva en el local.",
    notFoundTitle: "No encontramos esta tarjeta",
    notFoundBody: "Escanea el QR del local para conseguir una nueva.",
    invalidTitle: "Este QR ya no funciona",
    invalidBody: "Pide al personal el actual.",
    deviceTitle: "Ya conseguiste una tarjeta aquí hoy",
    deviceBody: "Ábrela desde el navegador de este móvil, o vuelve a intentarlo mañana.",
    limitedTitle: "Demasiados intentos",
    limitedBody: "Espera unos minutos y vuelve a intentarlo.",
    offline: "Sin conexión. Mostramos tu tarjeta como estaba.",
    offlineTitle: "Sin conexión",
    offlineBody: "No pudimos llegar a tu tarjeta. Seguiremos intentándolo.",
    errorTitle: "Algo salió mal",
    errorBody: "No pudimos conseguir tu tarjeta. Vuelve a escanear el QR en un momento.",
    joining: "Preparando tu tarjeta…",
    hint: "Añade esta página a tu pantalla de inicio para abrir tu tarjeta con un toque.",
    hintDismiss: "Entendido",
    emailTitle: "Avísame de mis premios",
    emailOptional: "Opcional. Tu tarjeta funciona sin esto.",
    emailLabel: "Correo electrónico",
    consent: "Acepto recibir correos de {venue} sobre mi tarjeta y sus ofertas.",
    unsubscribe: "Cada correo trae un enlace para darte de baja con un clic.",
    emailSubmit: "Avisadme",
    emailDone: "Listo. Te escribiremos sobre tus premios.",
    emailInvalid: "Revisa el correo.",
    emailUnavailable: "No hemos podido vincularlo esta vez.",
    savedTitle: "Tus tarjetas",
    savedNone: "Escanea el QR de un local para conseguir una tarjeta.",
    savedOpen: "Abrir tarjeta",
  },
};

/** Replaces each `{name}` with its value; an unknown name is left as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export type PosterCopy = { title: string; scan: string; reward: string };

/** The printed poster and table cards. The guest reads these, so they follow the sheet's language. */
export const POSTER_COPY: Record<CardLocale, PosterCopy> = {
  en: {
    title: "Collect stamps at {venue}",
    scan: "Scan with your phone camera. No app, no sign-up.",
    reward: "{stamps} stamps: {reward}",
  },
  es: {
    title: "Colecciona sellos en {venue}",
    scan: "Escanea con la cámara del móvil. Sin app, sin registro.",
    reward: "{stamps} sellos: {reward}",
  },
};
