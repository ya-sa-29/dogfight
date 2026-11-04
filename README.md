# Dogfight — Lab 03: Asynchronous JavaScript, Asset Loading, and Web Audio

## Опис проєкту

Браузерна гра на JavaScript Canvas 2D, що продовжує Lab 01 та Lab 02.

Проєкт демонструє роботу з асинхронним JavaScript: `Promise`, `async/await`, `fetch`, `AbortController`, `Promise.all`, microtasks і tasks. Також реалізовано завантаження ресурсів, Web Audio API, подієву архітектуру та Lobby з вибором ігрової арени.

## Запуск

Потрібні Node.js 24.21.0 або сумісна версія та npm.

```bash
npm install
npm run dev
```

Додаткові перевірки:

```bash
npm run lint
npm run format:check
npm run build
```

Після відкриття гри натисніть **Enable Audio & Start**, щоб дозволити браузеру використовувати Web Audio API.

## Керування

- `W` / `↑` — прискорення.
- `A` / `←` — поворот ліворуч.
- `D` / `→` — поворот праворуч.
- `Space` — стрільба або запуск ракети.
- `E` — перемикання між кулями та ракетами, якщо ракети є в запасі.

Підбирання pickup збільшує запас ракет. Ракети наводяться на астероїди. Зіткнення завдають шкоди, знищення астероїдів збільшує рахунок, а знищений корабель відроджується через 2 секунди.

## Архітектура

### Asset Pipeline

- `public/assets/manifest.json` — централізований перелік ресурсів.
- `src/assets/loader.js` — функції завантаження зображень, аудіо та JSON.
- `loadImage()` — завантаження зображень із використанням `Image.decode()`.
- `loadAudio()` — отримання аудіоданих і декодування через `decodeAudioData()`.
- `loadJson()` — отримання JSON через `fetchJson()` із перевіркою HTTP-статусу.
- `withRetry()` — повторні спроби з експоненційною затримкою та випадковим jitter. HTTP-помилки 4xx і скасовані операції не повторюються.
- `loadAll()` — паралельне завантаження ресурсів через `Promise.all()` з відстеженням прогресу.

Усі функції завантаження підтримують `AbortSignal`, що дозволяє скасовувати операції.

### Web Audio API та події

- `src/audio/audio.js` — аудіосистема, яка відтворює звуки пострілу, влучання та вибуху.
- `src/events/gameEvents.js` — централізована система ігрових подій на основі `EventTarget`.

Симуляція не залежить від аудіосистеми. Вона генерує події `fired`, `hit` та `exploded` через `CustomEvent`.

Аудіомодуль підписується на ці події та відтворює відповідні звуки.

`AudioContext` створюється після взаємодії користувача з кнопкою запуску, оскільки браузери обмежують автоматичне відтворення аудіо.

### Lobby

- `public/api/rooms.json` — статичне джерело конфігурацій кімнат.
- `src/lobby/lobby.js` — клас `Lobby extends EventTarget`, який завантажує кімнати, оновлює їх список і обробляє приєднання гравця.
- `src/lobby/lobbyView.js` — DOM-інтерфейс Lobby.
- `src/lobby/lobby.css` — оформлення інтерфейсу.

Lobby отримує список кімнат через `GET /api/rooms.json`, періодично оновлює його та використовує `AbortSignal.timeout()` для обмеження часу запиту.

Після натискання Join генерується подія `join`, яка передає ім'я гравця та конфігурацію вибраної кімнати в ігровий модуль.

Кімнати мають різні параметри:

| Кімната | Розмір арени | Кількість астероїдів |
|---|---:|---:|
| Training Arena | 1600 × 900 | 8 |
| Combat Zone | 2400 × 1400 | 18 |
| Survival | 3000 × 1800 | 30 |

Кімнати є локальними конфігураціями, а не мережевими multiplayer-сесіями.

### Ігрова симуляція

- `src/sim/vector.js` — `Vector2` з методами роботи з векторами.
- `src/sim/entity.js` — базовий `Entity`, унікальні ID, стан сутності та приватне здоров'я `#hp`.
- `src/sim/ship.js` — `Ship extends Entity`, керування, стрільба та запуск ракет.
- `src/sim/bullet.js`, `src/sim/missile.js`, `src/sim/asteroid.js`, `src/sim/pickup.js`, `src/sim/explosion.js` — ігрові сутності.
- `src/sim/world.js` — зберігання сутностей у `Map`, ітерація, `ofKind()` та відкладене видалення через `sweep()`.
- `src/sim/collision.js` — окрема система колізій, пошкодження та створення вибухів.
- `src/sim/homing.js` — поведінка наведення.
- `src/main.js`, `src/render/` — ігровий цикл, введення, відображення та HUD.

Наслідування обмежене одним рівнем: `Ship extends Entity`. Зіткнення обчислюються окремою системою з наївною складністю O(n²).

## Послідовне та паралельне завантаження

Послідовне завантаження виконує кожну операцію після завершення попередньої:

```js
const ship = await loadImage("/assets/ship.png");
const shot = await loadAudio("/assets/shot.wav");
const rooms = await loadJson("/api/rooms.json");
```

Якщо тривалість операцій становить 300, 500 та 200 мс, загальний час приблизно дорівнюватиме 1000 мс.

Паралельне завантаження дозволяє виконувати незалежні операції одночасно:

```js
const [ship, shot, rooms] = await Promise.all([
    loadImage("/assets/ship.png"),
    loadAudio("/assets/shot.wav"),
    loadJson("/api/rooms.json"),
]);
```

У цьому випадку загальний час буде приблизно 500 мс — тривалість найдовшої операції.

У проєкті використовується `Promise.all()` всередині `loadAll()`, оскільки завантаження окремих ресурсів не залежить одне від одного.

Це скорочує загальний час очікування, а callback `onProgress` дозволяє відображати поточний стан завантаження.

## Microtask та Task Puzzles

Наведені приклади демонструють порядок виконання синхронного коду, microtasks, tasks та `requestAnimationFrame`.

### Puzzle 1 — Promise та setTimeout

```js
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

console.log("D");
```

**Результат:**

```text
A
D
C
B
```

Пояснення: спочатку виконується синхронний код. Після нього обробляються microtasks (`Promise.then`), а потім tasks (`setTimeout`).

### Puzzle 2 — Promise всередині Promise

```js
console.log("A");

Promise.resolve().then(() => {
    console.log("B");

    Promise.resolve().then(() => {
        console.log("C");
    });
});

Promise.resolve().then(() => console.log("D"));

console.log("E");
```

**Результат:**

```text
A
E
B
D
C
```

Пояснення: `B` і `D` потрапляють до черги microtasks. Під час виконання `B` створюється нова microtask `C`, яка виконується після вже запланованої `D`.

### Puzzle 3 — async/await

```js
async function run() {
    console.log("A");

    await Promise.resolve();

    console.log("B");
}

console.log("C");

run();

console.log("D");
```

**Результат:**

```text
C
A
D
B
```

Пояснення: `await` призупиняє виконання async-функції до завершення Promise. Продовження функції виконується як microtask.

### Puzzle 4 — setTimeout всередині then

```js
console.log("A");

Promise.resolve().then(() => {
    console.log("B");

    setTimeout(() => console.log("C"), 0);
});

setTimeout(() => console.log("D"), 0);

Promise.resolve().then(() => console.log("E"));

console.log("F");
```

**Результат:**

```text
A
F
B
E
D
C
```

Пояснення: microtasks `B` та `E` виконуються раніше за tasks. Таймер `D` був запланований раніше за таймер `C`, тому виконується першим.

### Puzzle 5 — requestAnimationFrame

```js
console.log("A");

requestAnimationFrame(() => {
    console.log("B");

    Promise.resolve().then(() => console.log("C"));
});

Promise.resolve().then(() => console.log("D"));

setTimeout(() => console.log("E"), 0);

console.log("F");
```

**Результат (типовий порядок у браузері):**

```text
A
F
D
E
B
C
```

Пояснення: синхронний код виконується першим, потім microtask `D`. У типовому випадку таймер `E` виконується до наступного кадру, після чого викликається `requestAnimationFrame`. Microtask `C` виконується після callback `B`.

Примітка: точний момент виконання `requestAnimationFrame` залежить від циклу рендерингу браузера, частоти кадрів і моменту запланованого callback.

## Failure Gallery

Перевірка обробки помилок та відновлення роботи застосунку.

### 1. Відсутній ресурс (404)

**Сценарій:** змінити шлях до зображення в `public/assets/manifest.json` на неіснуючий файл.

**Очікувана поведінка:**
- Сервер повертає HTTP 404.
- `loadImage()` генерує HTTP-помилку.
- `withRetry()` не повторює запит, оскільки це помилка клієнта 4xx.
- `loadAll()` відхиляє Promise.
- Застосунок показує повідомлення про помилку та кнопку Retry.

**Відновлення:** повернути правильний шлях до ресурсу та натиснути Retry.

### 2. Мережевий timeout

**Сценарій:** уповільнити мережу або затримати відповідь сервера під час оновлення списку кімнат.

**Очікувана поведінка:**
- `AbortSignal.timeout()` обмежує очікування відповіді Lobby.
- Запит завершується за таймаутом.
- Помилка таймауту не перериває роботу Lobby.
- Наступне періодичне оновлення може повторити запит.

### 3. Abort під час завантаження

**Сценарій:** скасувати завантаження через `AbortController`.

```js
const controller = new AbortController();

const promise = loadJson("/api/rooms.json", {
    signal: controller.signal,
});

controller.abort();

try {
    await promise;
} catch (error) {
    console.log("Loading cancelled:", error.name);
}
```

**Очікувана поведінка:**
- Запит отримує сигнал скасування.
- Promise відхиляється.
- `AbortError` не запускає повторні спроби завантаження.

### 4. Пошкоджений JSON

**Сценарій:** замінити вміст `public/api/rooms.json` на некоректний JSON.

**Очікувана поведінка:**
- `fetchJson()` отримує відповідь сервера.
- `response.json()` не може розібрати вміст.
- Завантаження завершується помилкою після передбачених повторних спроб.
- Lobby або екран завантаження повідомляє про помилку.

**Відновлення:** повернути коректний JSON і повторити завантаження.

## Результат

У межах лабораторної роботи реалізовано:

- Асинхронне завантаження зображень, аудіо та JSON.
- Централізований manifest ресурсів.
- Паралельне завантаження через `Promise.all()`.
- Повторні спроби з експоненційною затримкою та jitter.
- Скасування запитів через `AbortController` та `AbortSignal`.
- Відображення прогресу завантаження.
- Відтворення аудіо через Web Audio API.
- Подієву взаємодію між симуляцією та аудіосистемою.
- Lobby з асинхронним отриманням конфігурацій кімнат.
- Обробку помилок завантаження та сценарії відновлення.
- Дослідження порядку виконання microtasks, tasks та `requestAnimationFrame`.

Проєкт продовжує попередні лабораторні роботи в тому самому репозиторії.