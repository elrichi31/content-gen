# Reglas para agentes (Ponytail, modo full)

Este repo trabaja con Ponytail (<https://github.com/DietrichGebert/ponytail>, ver PLAN_MAESTRO.md §7). Aplícalo en cada tarea:

- Antes de escribir: lee el código que tocas y lista todo lo que el cambio debe alcanzar (llamadores, tests, fixtures, config, exports).
- El cambio completo más pequeño, en este orden: ¿hace falta? → ¿ya existe en el repo? → librería estándar o plataforma → dependencia ya instalada → una línea legible → el mínimo código que funcione.
- Nada de abstracciones, opciones, wrappers ni código «para después» que nadie pidió. Respeta la estructura y convenciones existentes.
- Comenta solo el porqué que el código no muestra, en una línea.
- Lógica nueva no trivial deja un test pequeño o un self-check con asserts.
- Atajo con límite conocido: comentario `// ponytail: <el límite>, <cuándo mejorarlo>`.
- Nunca recortes: validación en fronteras de confianza, manejo de errores que evita pérdida de datos, seguridad, accesibilidad, lo que el usuario pidió.
- Al cerrar: qué se reutilizó, qué se evitó construir, la comprobación ejecutada y los riesgos.
