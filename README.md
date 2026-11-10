# Face Finder: juego de adivinar personas en inglés

Juego en vivo para clase: los estudiantes entran con un **código de 4 letras**, un **link** o un **código QR**, sin crear cuentas.

## Modos
Todo se juega **de forma oral**, como en persona. La app solo muestra los personajes, permite bajar cartas y hacer la adivinanza final. No hay chat ni descripciones escritas.

- **1 vs 1 Classic**: el sistema arma parejas al azar. Cada estudiante elige su persona secreta. Se hacen preguntas en voz alta ("Does your person have glasses?"), bajan las cartas que descartan y, cuando creen saberlo, pulsan **Make a guess**. Si hay un número impar, el que sobra espera hasta que otro quede libre.
- **Mystery Face (grupo)**: los *Guessers* reciben una persona que no pueden ver; solo ven el tablero. Los *Describers* ven la persona de cada guesser y responden en voz alta ("Yes, you are." / "No, you don't."). Puede haber uno o varios guessers; cada acierto suma un punto.

Si el profesor crea la partida sin marcar "I will play too", tiene una **vista de profesor** con todas las parejas, sus personas secretas y sus intentos.

## Probarlo en tu computador
Necesitas Node.js 18 o más reciente.
```
npm install
npm start
```
Abre http://localhost:3000. Los estudiantes en la misma red wifi pueden entrar con la IP de tu computador (por ejemplo http://192.168.1.20:3000).

## Publicarlo en internet gratis (Render)
1. Sube esta carpeta a un repositorio de GitHub (sin `node_modules`).
2. En https://render.com crea un **Web Service** conectado a ese repositorio.
3. Build command: `npm install` · Start command: `npm start` · Plan: Free.
4. Render te da un link como `https://face-finder.onrender.com`: ese es el link de tu juego.

Nota: en el plan gratuito el servidor se "duerme" después de 15 minutos sin uso; ábrelo 1 minuto antes de la clase para despertarlo. Las partidas se guardan en memoria y se borran si el servidor se reinicia.

## Cambiar los personajes
- Las imágenes están en `public/img/` (una por persona).
- Los rasgos (pelo, ojos, gafas, sombrero…) están en `public/characters.js`. De ahí salen las descripciones en inglés.
