# Инструменты и проверка зависимостей

Node 24.22.1 закреплена в .node-version/.nvmrc, npm — в packageManager, версии devDependencies — точно в package.json и package-lock.json. Установка проверена через npm ci. Production-артефакт не имеет внешних runtime-зависимостей.

Выбран TypeScript 6.0.3: typescript-eslint 8.73.0 объявляет поддержку TypeScript <6.1; автоматический переход на TypeScript 7 не выполнялся. Штатный postinstall esbuild явно разрешён записью allowScripts для установленной версии. Проверка типов выполняется отдельно от Vite/tsx; эти инструменты преобразуют TS, но не заменяют tsc.

## Результат audit на 18 ноября 2026 года

npm audit сообщил 10 high в дереве dev-инструментов. Все ведут к одной транзитивной зависимости picomatch <=4.0.7 (ReDoS при передаче атакующим специально составленных glob-шаблонов): [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). На дату проверки advisory и npm registry не предоставляют исправленной версии.

Повторная проверка после сообщения npm install:

| Команда | Результат |
|---|---|
| `npm audit` | 10 high, один исходный advisory и цепочки зависимых пакетов |
| `npm audit --omit=dev` | 0 уязвимостей, exit 0 |
| `npm ls --omit=dev --all` | Внешних runtime-зависимостей нет |
| npm registry: picomatch latest | 4.0.7; исправленный релиз отсутствует |

`npm audit fix --force` предлагает понизить Vite 8.3.8 до 6.2.7 и typescript-eslint 8.73.0 до 8.47.0. У typescript-eslint 8.47.0 peerDependencies требуют TypeScript <6 и ESLint 8/9, тогда как проект использует TypeScript 6 и ESLint 10. Поэтому этот вариант несовместим с текущим набором инструментов и не применялся. Версии зависимостей и lockfile при проверке не менялись.

Полный audit остаётся с предупреждениями: проверка `--omit=dev` показывает только production-дерево. Игровой API не принимает glob-шаблоны, сервер комплектного dist не загружает dev-инструменты; dev по умолчанию закрыт loopback. Проверки используют доверенные фиксированные шаблоны проекта. При появлении исправления следует обновить совместимую зависимость и повторить CI.
