# Fútbol de los Miércoles

Aplicación web estática para organizar un partido fijo de **7 vs 7**, los miércoles a las 20:00.

## Qué garantiza

- Exactamente 14 jugadores disponibles y 7 por equipo.
- Los puestos son opcionales: alcanza con escribir `FEDE ARQ`, `NICO DEF` o solamente el nombre.
- Si hay dos arqueros y cuatro defensores, asigna un ARQ y dos DEF por lado.
- Si no se cargan puestos, sortea normalmente sin bloquear la fecha.
- Los primeros 14 son titulares y el resto queda como suplente.
- Evita repetir los mismos compañeros de las fechas recientes.
- Guardado separado del sorteo y del resultado final.
- Historial local y recuperación del último plantel.
- Texto listo para WhatsApp con cancha, equipos, suplentes y frase del Chiqui Mafia.
- Modo oscuro y animación con sonido de bolillero.
- Relator del Chiqui Mafia con 24 frases futboleras que rotan automáticamente.
- Tipografía deportiva para títulos y tipografía de alta legibilidad para la interfaz.
- Placa JPG vertical con equipos, cancha, suplentes, resultado y frase, lista para compartir.
- Historial visual completo para compartir o descargar en JPG y PDF.

## Carga de jugadores

Un jugador por línea. Formato recomendado:

```text
1. FEDE ARQ
2. NICO DEF
3. MARTÍN DEF
4. LUCAS
```

Se puede pegar directamente una lista numerada o con viñetas de WhatsApp. Los únicos puestos reconocidos son `ARQ` y `DEF`, y ambos son opcionales. `AUS` deja al jugador guardado, pero fuera del sorteo de esa fecha.

## Desarrollo local

No requiere instalación ni build. Servir la carpeta con cualquier servidor estático:

```bash
python -m http.server 4173
```

Abrir `http://localhost:4173`.

## Pruebas

```bash
node tests/logic.test.js
```
