# Проверки миграции Hockey Quiz

Дата начала: 18 ноября 2026 года. Production при реализации не изменяется.

## Исходный baseline

`npm test` до изменений: 10/10 (Node 24.22.1). Проверены:

1. Полный матч, счёт, перерывы, бинго и финал.
2. 18 вопросов, три периода по шесть вопросов, связи с 17 правилами и закрытая статика.
3. Восстановление сессии, роли, скрытие ответов и токенов.
4. Исключение в лобби, отзыв токена и замена участницы.
5. Закрытие комнаты и SSE.
6. TTL с управляемым временем.
7. Лимиты комнат/запросов и очистка лимитера.
8. SSE-лимиты и освобождение подключений.
9. Параллельные ответы, повтор, раскрытие и устаревшие действия.
10. Неверные данные и Origin.

Сохраняются ведущий и две участницы, +1 за верный ответ, скрытые варианты до reveal, два перерыва, реванш, персональное бинго, текущие тексты/правила. Hero, фон, размеры заголовка, логотипы и CSS-композиция не меняются. Эталон до миграции сохранён локально вне репозитория для сравнения.

## Ограничения

Физический iPhone пока не проверялся. Условия распространения изображений и лицензия собственного кода требуют отдельного решения владельца. Эти ограничения не подменяются техническими проверками.

## Защита партии в исходном JS

До исправления два новых теста answer/bingo после реванша воспроизвели ошибку: 200 вместо 409. После исправления: 13/13 Node-тестов. Браузерный тест с удержанным HTTP-ответом и уже доставленным SSE следующего вопроса подтвердил отсутствие неверной подсветки. Hero-эталоны четырёх ширин сохранены локально вне Git.

## Новая TS-версия: выполненные проверки

- TypeScript strict: клиент, сервер и инструменты компилируются без any/необоснованных assertions. Отдельный probe подтвердил ошибки nullable/index-доступа; ESLint ловит необработанный Promise.
- 17 Node unit/integration-тестов: прежние игровые сценарии, новый протокол, UTF-8/body, безопасные ошибки, storage и поздний SSE отменённой сессии.
- Chromium: 7/7 e2e, полный матч, замена, reload, offline/online, бинго, реванш, close; удержанный/потерянный HTTP-ответ и невалидный снимок.
- Hero на четырёх мобильных ширинах пиксельно совпадает с исходной версией при сравнении одним и тем же браузером.
- Независимая копия dist работает без src/node_modules: HTML/ресурсы, запрет приватных путей, SSE и завершение по SIGTERM/SIGINT проверены.
- Дополнительно `npm start` запущен из отдельной копии dist с HOST=127.0.0.2, PORT=0, TRUST_PROXY=1: HTML, API, SSE и остановка прошли. Невалидные HOST/PORT/TRUST_PROXY отклонены с exit 1. Build с намеренным TS2322 завершился с exit 2; временный файл удалён.
- Переносимые systemd/Caddy-шаблоны проверены локально через systemd-analyze verify и caddy validate; не установлены и не применены к службам.

Известный npm audit dev-дерева описан в DEPENDENCIES.md. Нулевой audit всех инструментов не заявляется. Для тестовых браузеров на минимальном VPS используются временно распакованные библиотеки и software Mesa; системные пакеты не устанавливались.

## Итоговый цикл из чистой копии

Результат: все команды итогового цикла завершились с exit 0. Копия состоит из файлов, видимых Git, без node_modules, dist, .agents, openspec, локальных env и истории VPS. Это проверка состава будущего checkout, без создания коммита или push.

Выполнены npm ci, typecheck, lint, format:check, test, build, test:release и test:e2e. Браузеры установлены текущим Playwright проекта; PLAYWRIGHT_MODULE и SHARP_MODULE не используются. В минимальном Linux нужны временные библиотеки браузера вне проекта; в обычном CI предусмотрен install --with-deps. Проверка системных библиотек при локальном запуске отключена только после успешного реального старта обоих движков; сами тесты не пропускаются.

| Проверка | Результат |
|---|---|
| npm ci по lockfile | exit 0; установлены собственные зависимости проекта |
| typecheck / lint / format:check | все exit 0 |
| npm test | 17/17, exit 0 |
| npm run build | exit 0; dist/server + dist/shared + dist/client + package metadata |
| npm run test:release | оба сигнала завершения, exit 0; src/node_modules отсутствуют |
| npm run test:e2e | 9/9, exit 0; Chromium 7, WebKit 1, dev 1 |
| Дополнительный повтор dev | 2/2 последовательных запуска |
| Неверный тип при build | ожидаемый TS2322, exit 2 |
| npm start из отдельного dist | HTML/API/SSE, нестандартный loopback и сигнал завершения — пройдено |
| Занятый порт / Origin / proxy / SSE | пройдено, оба занятых dev-порта диагностируются явно |
| Завершение проверок | 4173/45173/45174/44173 свободны, тестовые процессы завершились |
| Соответствие проверенной копии | src (20), tests (10), scripts (3), dist (17 файлов) совпадают побайтово с рабочим проектом |

Первый общий прогон выявил гонку в e2e-проверке overlay при одновременном reload трёх вкладок. Диагностика теперь проверяется с одной подключённой вкладкой; три независимые роли, HMR во время вопроса и полный матч сохранены отдельными шагами того же теста. После исправления прошли два повтора dev и общий запуск всех девяти сценариев. Исходники после тестовых правок восстановлены.

## Матрица сценариев OpenSpec

Названия ниже точно соответствуют пяти delta specs. «Пройдено» относится к указанной автоматизированной проверке либо явно указанному ревью документации. Физический iPhone, удалённый CI и будущая установка на VPS не выдаются за выполненные действия.

### game-session-integrity

| Сценарий | Статус | Подтверждение |
|---|---|---|
| Delayed answer from the previous match | Пройдено | api.test.ts: старые answer/bingo/host-команды; 409 без мутации |
| Delayed bingo command | Пройдено | api.test.ts: старое бинго после реванша |
| Required identity is missing | Пройдено | contracts.test.ts / api.test.ts: отсутствующие matchId/index → 400 |
| Duplicate next command | Пройдено | api.test.ts: параллельные команды next, один переход |
| Missing host version | Пройдено | contracts.test.ts / api.test.ts: обязательная version |
| Parallel answers and duplicate submission | Пройдено | api.test.ts: параллельные ответы и запрет повторов |
| Forced reveal | Пройдено | game.test.ts / api.test.ts: пропуск, 0 очков, поздний ответ |
| Full match and rematch | Пройдено | game.test.ts / game.spec.ts: 18 вопросов, перерывы, счёт, реванш |
| Unauthorized control | Пройдено | api.test.ts: роли и токен чужой комнаты |
| Answer committed but response lost | Пройдено | game.spec.ts: принятый ответ с потерянным HTTP-ответом и reload |
| Session changed during reconnect | Пройдено | sync.test.ts: позднее событие отменённого потока |
| Kick and close release resources | Пройдено | api.test.ts: kick/close, завершение потоков и освобождение слота |
| TTL with controlled time | Пройдено | api.test.ts: управляемое время для трёх TTL |

### api-contracts

| Сценарий | Статус | Подтверждение |
|---|---|---|
| Invalid nickname type | Пройдено | api.test.ts: {}, [], число, null не занимают слот |
| Answer or mission outside its domain | Пройдено | contracts.test.ts / api.test.ts: границы answer/bingo |
| Existing nickname normalization | Пройдено | api.test.ts: нормализация; game.spec.ts: ник с HTML отображён текстом |
| Hidden answer before reveal | Пройдено | contracts.test.ts / api.test.ts: question без correct/ex/ответов соперницы |
| Invalid snapshot | Пройдено | contracts.test.ts / game.spec.ts: отклонённый снимок сохраняет валидный UI |
| Damaged persisted session | Пройдено | session.test.ts / game.spec.ts: повреждённые данные дают гостевой экран |
| Termination event | Пройдено | contracts.test.ts / game.spec.ts: закрытие и исключение очищают участие |
| Public resource inspection | Пройдено | check-release.mjs: закрытые пути и отсутствие вопросного ключа в bundle |
| Share and reconnect | Пройдено | game.spec.ts / dev.spec.ts и проверка sync.ts: URL без токенов/namespace |
| Internal exception | Пройдено | api.test.ts: безопасный 500 без внутренних подробностей |
| Rate limited client | Пройдено | api.test.ts: 429/Retry-After; api.ts не повторяет POST автоматически |
| Split Unicode character | Пройдено | api.test.ts: кириллический символ разделён между чанками |
| Oversized or malformed body | Пройдено | api.test.ts: 4096 байт, malformed JSON и следующий health |

### local-development

| Сценарий | Статус | Подтверждение |
|---|---|---|
| Fresh clone | Пройдено | Чистая копия: установка по lockfile; e2e сам запускает npm run dev |
| Stop or port conflict | Пройдено | Отдельный probe: оба занятых порта → EADDRINUSE; SIGINT освобождает оба |
| Three roles on one origin | Пройдено | dev.spec.ts: 18 вопросов в трёх вкладках одного context, счёт 18:0, бинго |
| Reload one tab | Пройдено | dev.spec.ts: reload с выбранным ответом; leave не меняет другие роли |
| CSS update during a match | Пройдено | dev.spec.ts: новый CSS виден, performance.timeOrigin не изменился |
| Client code reload | Пройдено | dev.spec.ts: клиентский edit/reload восстанавливает принятый ответ и роль |
| Backend source update | Пройдено | dev.spec.ts: изменение серверного TS, потеря dev-комнат и новая игра |
| Type error without syntax error | Пройдено | dev.spec.ts: намеренный TS2322 в журнале watcher |
| Client transform failure | Пройдено | dev.spec.ts: синтаксическая ошибка, overlay и восстановление после правки |
| Default startup | Пройдено | dev.mjs/vite.config.ts и network probe: клиент/API только на loopback |
| iPhone on the same Wi-Fi | LAN проверен автоматически; iPhone недоступен | LAN probe: отдельный адрес 127.0.0.2 (имитация адреса клиента), API на 127.0.0.1, POST/SSE и Origin; WebKit touch smoke. Физического iPhone нет |
| Insecure-context sharing fallback | Пройдено | dev.spec.ts: Clipboard/Share отключены, prompt содержит ссылку текущего origin и код без namespace |
| Development and release checks | Пройдено | Чистая копия: стандартные команды, комплектный dist и локальный запуск |

### production-delivery

| Сценарий | Статус | Подтверждение |
|---|---|---|
| Start the assembled application | Пройдено | check-release.mjs: dist отдельно от src/node_modules; npm start дополнительно проверен локально |
| Build has a type error | Пройдено | Намеренный build-error-probe.ts: TS2322 и exit 2, файл удалён |
| Private path or traversal | Пройдено | api.test.ts / check-release.mjs: приватные файлы и traversal отклонены |
| Missing generated asset | Пройдено | check-release.mjs: отсутствующий ресурс → 404, следующий health → 200 |
| New VPS configuration | Пройдено | Обезличенные deploy-шаблоны: caddy validate и systemd-analyze verify без установки; HOST/PORT/TRUST_PROXY probe |
| Process shutdown | Пройдено | check-release.mjs: SIGTERM и SIGINT, room-closed, выход 0 и закрытый порт |
| Operator follows the deployment guide | Пройдено | Ревью deploy/README.md: один процесс, эфемерные комнаты, HTTPS и flush_interval -1 |
| Local release verification | Пройдено | Отдельные локальные порты и копия артефакта; действующие службы не изменялись |
| Future deployment failure | Пройдено | Ревью deploy/README.md: предыдущий комплектный артефакт, health/HTTPS/SSE и потеря комнат |

### repository-publication

| Сценарий | Статус | Подтверждение |
|---|---|---|
| Inspect publishable files | Пройдено | git check-ignore: локальные пути исключены, исходники/lockfile/deploy видимы; исторические файлы сохранены |
| Clean checkout verification | Пройдено | Чистая копия без node_modules, dist и локальных инструментов: полный цикл с собственными devDependencies |
| Regression suite | Пройдено | 17 Node-тестов; TTL по внедрённым часам, SSE завершение по условию |
| Browser verification | Пройдено | Chromium: полный матч и 320/375/390/430; WebKit: мобильный touch/SSE/reload/offline/close |
| Failing change | Локально проверено; GitHub run не выполнялся | Workflow push/PR проверен локально: read-only, без deploy/secrets; отрицательный build-probe. Удалённый GitHub run не выполнялся |
| New developer | Пройдено | README Local Development и чистая установка; dev/HMR/LAN-проверки. Реальный телефон отмечен отдельно |
| No license decision from the owner | Пройдено | README (источники изображений), README и UNLICENSED: неизвестные права не считаются полученными |

## Ограничения результата

- Реальный iPhone Safari: **не проверен**, физическое устройство недоступно. WebKit smoke этого не заменяет. На телефоне остаются ручные проверки Wi-Fi, блокировки/возврата и смены сети по README.
- GitHub Actions: конфигурация и команды проверяются локально; push и удалённый workflow не запускались.
- Права на изображения и выбор лицензии: **решение владельца не получено**, статус источников сохранён в README (источники изображений), package.json остаётся UNLICENSED.
- npm audit: известная проблема picomatch в инструментах разработки с отсутствующим исправленным релизом описана в DEPENDENCIES.md. Runtime-дерево внешних зависимостей пустое.
- Production: действующие systemd/Caddy, firewall, DNS, runtime и комнаты не менялись. Новая TS-версия не опубликована. Проверки шли на отдельных локальных портах; шаблоны только валидировались.

## Очистка после миграции

18 ноября 2026 года выполнена отдельная уборка по запросу владельца:

- Удалён каталог deployment со 171 историческим файлом, включая старые JS-установщики, smoke-скрипты, конфиги, отчёты и локальные копии. Удалено выполненное CODEX_TASK_FINAL.md. Объём удаления отдельно подтверждён владельцем.
- Перед удалением проверен локальный архив .local-archive/before-legacy-cleanup-20261118T122651Z.tar.gz: 233 исходных и исторических файла, проверка содержимого по SHA-256. Архив игнорируется Git и содержит резервные копии прежних развёртываний.
- Удалён неиспользуемый исходник ice_box.png и корневой assets/. Приложение использует rink-bg.webp; сведения об источниках изображений сокращены до абзаца в README.
- Проверка хоккейных правил перенесена в docs/RULES_REVIEW.md. TECHNICAL_AUDIT.md сохранён как исторический снимок, с указателем на актуальную документацию.
- CODEX_DEPLOY.md заменён инструкцией для комплектного dist и актуальных deploy-шаблонов. Убраны устаревшие пути и избыточные gitignore-правила для удалённой папки.
- Из CSS удалены 19 селекторов старой шапки и неиспользуемой анимации (шесть имён классов), а также keyframes scene-in. Текущая шапка и используемые эффекты сохранены.
- Удалены старый /rules.js и fallback авторизации из query string. Клиент уже использует shared/content и Authorization; тесты проверяют 404 для старого скрипта и 403 для query-only токена на state/events. Нормальное восстановление сохранённых сессий осталось доступным.

Результаты проверки очистки: typecheck, lint, форматирование, build и test:release — exit 0; Node — 17/17; Chromium — 7/7; WebKit — 1/1; dev — два последовательных успешных запуска после уточнения fixture. Мобильные скриншоты 320/375/390/430 до и после удаления CSS совпали побайтово. Все тестовые порты освобождены, временный TS-модуль и сгенерированные результаты удалены.

Во время проверки обнаружены два неустойчивых e2e-шага. Один запуск Chromium не отрисовал гостевой экран за 15 секунд; в повторном прогоне это не повторилось, причина не установлена, добавлена диагностика JS/загрузки ресурсов без записи токенов. В dev проверка синтаксической ошибки entry point теряла overlay при full reload Vite: теперь ошибка вносится во временный self-accepting TS-модуль, подключённый только на время теста. Это проверяет настоящий transform error/HMR, сохраняя страницу диагностики. Итоговый dev проверен отдельно дважды; последний общий прогон до исправления fixture имел 8 успешных сценариев и один сбой dev. Эти результаты не выдаются за единый зелёный общий прогон.

Действующая служба проверена только на чтение: active/running, WorkingDirectory=/opt/hockey-quiz. Конфиги Caddy не ссылаются на удалённый каталог проекта. Переключений релиза, рестартов службы и изменений конфигурации VPS при очистке не выполнялось.
