# JEV en Radar: piloto de observación

## Alcance

JEV recomienda relevancia para el negocio/enfoque y posibles repeticiones respecto a títulos recientes. No descarta, reordena, cambia puntuaciones ni genera piezas. Investigación web y redacción mantienen sus modelos actuales. Este piloto añade consumo; todavía no demuestra ahorro.

## Activación

En el servidor, configura `TYPESAFE_API_KEY` mediante el gestor de secretos del hosting y `JEV_RADAR_MODE=observe`. Nunca uses variables `NEXT_PUBLIC_*` ni envíes la clave al navegador. El valor predeterminado es `off`: configurar solo la clave no activa llamadas pagadas. Para apagarlo, vuelve a `off`.

Se envían a TypeSafe una muestra de temas, títulos recientes y el contexto comercial de los verticales/marcas correspondientes. No se envían claves ni artículos completos. Revisa que estos datos puedan compartirse con ese proveedor antes de activar el piloto.

## Contrato y límites

Modelo fijado: `jev-1.13.0`, sin alias dinámico. POST a `https://api.typesafe.ai/v1/systemone`, con preguntas Noul. Documentación consultada el 2026-10-06:

https://docs.typesafe.ai/api
https://docs.typesafe.ai/models

Máximo una solicitud adicional, 10 temas y 30 títulos recientes por búsqueda o reinterpretación. El estado se limita a 24.000 bytes UTF-8 de forma conservadora, reduciendo la muestra si es necesario. Se muestra la cobertura efectiva; no equivale a revisar todo el historial. Timeout de 15 segundos y sin reintentos automáticos. La cancelación de una búsqueda también aborta su solicitud JEV.

Señales >=0.8 o <=0.2 producen recomendaciones claras; los casos intermedios se marcan para revisar. Son umbrales iniciales del piloto, no umbrales validados en español. Sin títulos recientes, no se atribuye una repetición del historial.

## Historial y costos

La observación se conserva en el JSON de la búsqueda y se muestra plegada en Radar. Reinterpretar devuelve su propia observación, visible durante esa sesión, sin sobrescribir el costo ni las recomendaciones de la búsqueda original.

Cada solicitud se registra como `radar-jev-observe`, proveedor `typesafe`, modelo fijado. Se usa el consumo que devuelve la API; no se inventa consumo ausente. La tarifa pública consultada es US$0.042 por millón de tokens de entrada, con salida gratuita. Los importes se congelan al terminar cada operación. Un consumo potencial no medido deja el total de la corrida incompleto, no como un cero gratuito.

Si el proveedor falla, falta la clave o el resultado no respeta el contrato, Radar conserva su flujo actual. No se guardan cuerpos de errores ni excepciones de red sin sanitizar. La integración no requiere nuevas tablas: usa campos JSON existentes y el proveedor es TEXT en el esquema SQL del repositorio.

## Evaluación antes de filtrar

Compara los temas señalados con las decisiones humanas de guardar/descartar; comprueba especialmente novedades que comparten tecnología pero no el mismo evento/ángulo. Mide costo por evaluación y falsos positivos en español antes de usar JEV para evitar generaciones. No se atribuye ahorro observado ni se activa descarte automático en esta implementación.

## Verificación local

`npm run test:jev-radar`, `npm run test:jev-radar-flow` y `npm run test:jev-radar-ui` están registrados en la suite. El test del scanner ejecuta la implementación real y simula únicamente los límites HTTP/persistencia. La interfaz se revisó con el componente y CSS reales, en fixture con datos simulados. La llamada a TypeSafe con credenciales reales y la persistencia contra PostgreSQL siguen siendo verificaciones separadas.
