<div align="center">

<img src="public/favicon.svg" width="96" alt="Logo de MadMovil">

# MadMovil

**El transporte público de Madrid en tiempo real: bus, metro y cercanías.**<br>
Sin anuncios. Sin rastreo. Sin cuentas.

**[www.madmovil.es](https://www.madmovil.es)**

[![Astro](https://img.shields.io/badge/Astro-7-FF5D01?logo=astro&logoColor=white)](#tecnologías)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](#tecnologías)
[![Sin cuentas](https://img.shields.io/badge/cuentas-ninguna-0F7B5F)](#qué-no-hace)
[![Sin rastreo](https://img.shields.io/badge/rastreo-ninguno-0F7B5F)](#qué-no-hace)
[![Idiomas](https://img.shields.io/badge/idiomas-2-0F7B5F)](#idiomas)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-0F7B5F)](LICENSE)
[![100 % código escrito por IA](https://img.shields.io/badge/c%C3%B3digo-100%25%20escrito%20por%20IA-8A5CF6)](#desarrollo)

[English](README.md) · **Español**

</div>

---

## Por qué MadMovil

Moverse por Madrid no debería exigir una app por red. MadMovil las reúne todas
en un solo sitio y deja tus datos en paz:

- 🚊 **Todas las redes** — bus urbano de la EMT, interurbanos y urbanos del CRTM, Metro Ligero, Metro y Cercanías de Renfe.
- ⚡ **Tiempo real** — llegadas con estimación en vivo: SAE de la EMT, GTFS-RT oficial de Renfe para Cercanías (retrasos, vía, cancelaciones) y SAE del CRTM para el resto.
- 🔒 **Privada de serie** — sin cuentas: tus favoritos se quedan en tu navegador y la copia de sincronización opcional se cifra de extremo a extremo, así que el servidor solo ve un blob opaco.
- 🌍 **Código abierto** — licencia MIT. La [API](https://github.com/ZiraCode/madmovil_server) también es abierta.

## Qué hace

- **Fichas de parada** de todas las redes, con tablón de llegadas en tiempo real y salidas teóricas de hoy.
- **Fichas de línea** con el recorrido dibujado en mapa, horarios por dirección y patrón de servicio, e incidencias.
- **Buscador unificado** de líneas y paradas de todas las redes, desde una sola caja.
- **Mapa** de paradas cercanas con iconos por red, a partir de tu ubicación.
- **Favoritos sin cuenta**: guardados en tu navegador, con copia de seguridad y restauración por archivo, código QR o enlace, y sincronización multi-dispositivo opcional (cifrada de extremo a extremo, protegida con Turnstile).
- **Español e inglés**, con sitemaps por idioma para buscadores.
- Tema claro y oscuro según tu sistema, y soporte offline básico (service worker).

## Qué NO hace

- ❌ Sin cuentas, registro ni inicios de sesión
- ❌ Sin anuncios
- ❌ Sin analíticas, rastreo ni scripts de terceros (una CSP estricta con hashes por build bloquea todo lo no autorizado explícitamente)
- ❌ Sin datos personales legibles en el servidor: el blob de sincronización de favoritos se cifra en tu navegador

## Privacidad

Todo ocurre en tu navegador. Los favoritos viven en el almacenamiento local, y
la copia de sincronización opcional se cifra en tu dispositivo antes de salir
— el servidor guarda un blob opaco que no puede descifrar. La creación del
vault está protegida con Turnstile de Cloudflare para evitar abusos.

Lee la política de privacidad completa:
[Español](https://www.madmovil.es/privacidad) ·
[Inglés](https://www.madmovil.es/en/privacidad).

## Requisitos

Cualquier navegador moderno. Las páginas se renderizan en el servidor; los
tablones de llegadas y el mapa necesitan JavaScript.

## Idiomas

La interfaz sigue a la URL: **Español** (por defecto,
[www.madmovil.es](https://www.madmovil.es)) · **English**
([www.madmovil.es/en](https://www.madmovil.es/en)).

## Úsalo

**[www.madmovil.es](https://www.madmovil.es)** está en vivo: gratis y sin
cuenta.

## Puesta en marcha

Necesitas **Node 22.12+** y, para datos reales, la
[API](https://github.com/ZiraCode/madmovil_server) corriendo en local
(`npm run dev` allí → http://localhost:8787).

```bash
git clone https://github.com/ZiraCode/madmovil_web.git
cd madmovil_web
npm install
npm run dev       # http://localhost:4321
npm run check     # astro check, debe pasar con 0 errores
npm run build     # build de producción a dist/
```

| Variable | Para |
| --- | --- |
| `PUBLIC_API_BASE_URL` | URL base del API. `.env.development` (incluido) apunta a `http://localhost:8787` |
| `PUBLIC_TURNSTILE_SITEKEY` | Sitekey de Turnstile para el vault de favoritos (público por diseño; el dummy oficial siempre pasa en desarrollo) |

<details>
<summary>Desplegar en Cloudflare</summary>

`npm run deploy` compila y despliega con Wrangler. Necesitas tu propia cuenta
de Cloudflare; `wrangler.jsonc` espera el binding de assets de Workers y el
binding de rate limit que usa el middleware. Los hashes de la CSP se verifican
en cada build del CI con `scripts/check-csp.mjs`.

</details>

## Tecnologías

| | |
|---|---|
| Framework | Astro 7 (output server, SSR) con el adaptador de Cloudflare |
| Estilos | Tailwind CSS 4 |
| Mapa | Leaflet |
| i18n | Middleware propio: español por defecto, inglés bajo `/en` |
| Seguridad | CSP con hashes por build, HSTS, rate limit por IP |
| Datos | [API de MadMovil](https://github.com/ZiraCode/madmovil_server) |

## Desarrollo

MadMovil lo ha construido un pequeño equipo de humano e IA:

| Rol | Quién |
|---|---|
| Líder de proyecto | [Ziracode](https://ziracode.github.io) |
| Programador senior | **GLM** (Z.ai) |
| Revisión de código y auditorías | **Claude** (Anthropic) |

Ziracode y GLM planificaron y construyeron el proyecto juntos, y el **100 %
del código lo escribió GLM**. Claude aportó revisiones de código y auditorías
de seguridad independientes durante el desarrollo.

## Licencia

Publicada bajo la [licencia MIT](LICENSE). Los datos de transporte que
consume el sitio (EMT, CRTM, Renfe) pertenecen a sus titulares, con la
atribución gestionada por la [API](https://github.com/ZiraCode/madmovil_server).

---

<div align="center">
<sub>Hecha por <a href="https://ziracode.github.io">Ziracode</a></sub>
</div>
