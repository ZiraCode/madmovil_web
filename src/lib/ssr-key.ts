// Fase 11A (junto al W1 del server): secret compartido que exime a nuestro SSR del rate
// limit del API vía el header X-SSR-Key. El valor vive SOLO en el runtime del worker
// (wrangler secret put API_SSR_KEY) y lo deposita aquí el middleware por request — el único
// sitio con acceso tipado a cloudflare:workers, porque este módulo debe poder importarse
// desde código isomorfo (api.ts también se bundlea para CLIENTE, donde jamás puede llegar
// un import de cloudflare:workers). En el cliente nadie llama a setSsrApiKey: ssrApiKey()
// devuelve undefined y el header no se envía. Sin secret en el env (dev, build, fail-closed)
// el comportamiento es el de siempre: fetch normal bajo rate limit.
// INVARIANTES: jamás loguear el valor, ni incluirlo en mensajes de error ni respuestas.
let ssrKey: string | undefined;

export function setSsrApiKey(value: string | undefined): void {
  ssrKey = typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function ssrApiKey(): string | undefined {
  return ssrKey;
}
