// Serializa datos para islands JSON (<script type="application/json" set:html>): escapa
// <, U+2028 y U+2029 tras stringify para que el payload no pueda cerrar el script
// (</script> inyectado) ni romper el parser JS
export function jsonForIsland(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
