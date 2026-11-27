export const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'https://api.madmovil.es';
// Widget invisible "madmovil-vault" (Turnstile): sitekey PÚBLICO por diseño; para E2E local,
// PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA (dummy que siempre pasa)
export const TURNSTILE_SITEKEY = import.meta.env.PUBLIC_TURNSTILE_SITEKEY ?? '0x4AAAAAAEfcQ5OLRYQ7gd9F';
