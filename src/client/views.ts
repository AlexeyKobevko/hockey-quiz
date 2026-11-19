import type { GameSnapshot, Session, VisualChoice } from '../shared/contracts.js';
import { rules as hockeyRules } from '../shared/content.js';
export type Tab = 'game' | 'rules' | 'bingo';
export interface ViewContext {
  auth: Session | null;
  state: GameSnapshot | null;
  tab: Tab;
  err: string;
  scoreGains: Set<string>;
  choice: VisualChoice | null;
}
export const esc = (s: string | number | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[c] ?? c;
  });
export const roomLink = (code: string) =>
  `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
export function renderView(context: ViewContext): string {
  const { auth, state, tab, err, scoreGains, choice } = context;
  const requireState = () => {
    if (!state) throw new Error('Missing state');
    return state;
  };
  const me = () => state?.players.find((p) => p.id === state.selfId);
  const isHost = () => state?.role === 'host';
  const currentChoice = () =>
    choice &&
    state &&
    choice.code === state.code &&
    choice.matchId === state.matchId &&
    choice.selfId === state.selfId &&
    choice.index === state.index
      ? choice.answer
      : undefined;
  const derby = () =>
    `<div class="derby"><div><img src="/assets/dynamo.png" alt="Эмблема ХК Динамо Москва" width="64" height="64"><span>Динамо · Москва</span></div><span class="versus">ДЕРБИ<br>22 НОЯБРЯ</span><div><img src="/assets/cska.svg" alt="Эмблема ХК ЦСКА Москва" width="64" height="64"><span>ЦСКА · Москва</span></div></div>`;
  const gameTitle = () =>
    `<div class="panel game-intro"><div class="lead">18 ситуаций на льду. Две участницы и ведущий — каждый со своего телефона. Сначала изучим правила, потом сыграем!</div>${derby()}<div class="chips"><span class="chip">📅 22 ноября</span><span class="chip">🏟️ ВТБ Арена</span><span class="chip">🏒 Болеем за ЦСКА</span></div></div>`;
  const errorHTML = () => (err ? `<div class="msg" role="alert">⚠️ ${esc(err)}</div>` : '');
  const btn = (label: string, action: string, type = 'primary', disabled = false) =>
    `<button class="btn ${type} full" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function startScreen() {
    const code = new URLSearchParams(location.search).get('room') || '';
    return `${gameTitle()}
  <div class="panel"><h3>Новичок на льду?</h3><p>Полные правила открыты всем: 17 коротких карточек подготовят ко всем вопросам. За верный ответ — +1 игровое очко.</p>${btn('📖 Изучить правила', 'rules', 'secondary')}</div><div class="panel"><div class="eyebrow">🎤 Роль ведущего</div><h2>Собрать команду</h2><p>Создай комнату, отправь ссылку двум участницам и управляй игрой со своего телефона.</p>${btn('Создать игровую комнату →', 'create')}</div>
  <div class="panel"><div class="eyebrow">🏒 Роль участницы</div><h2>Войти в игру</h2><p>Никакой регистрации — только код комнаты и ник.</p><form id="joinForm" class="stack"><div><label class="label" for="roomCode">Код комнаты</label><input id="roomCode" class="field" maxlength="6" minlength="6" inputmode="text" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="characters" required placeholder="Например, ABC123" value="${esc(code.toUpperCase())}"></div><div><label class="label" for="nickname">Твой ник</label><input id="nickname" class="field" minlength="2" maxlength="24" autocomplete="off" required placeholder="Например, Красно-синяя королева"></div><button type="submit" class="btn secondary full">Присоединиться →</button></form></div>${errorHTML()}`;
  }
  const playersHTML = () => {
    const state = requireState();
    return `<div class="stack">${[0, 1]
      .map((i) => {
        const p = state.players[i];
        return `<div class="member"><div class="member-icon">${i + 1}</div><div class="mname">${p ? esc(p.name) : 'Ожидаем участницу...'}</div><div class="mstate ${p ? 'ready' : ''}">${p ? '✓ Готова' : '○'}</div>${p && isHost() ? `<button class="kick" data-kick="${esc(p.id)}" aria-label="Исключить ${esc(p.name)}">Убрать</button>` : ''}</div>`;
      })
      .join('')}</div>`;
  };
  const scoreboard = () => {
    const state = requireState();
    return `<div class="scoreboard">${[0, 1]
      .map((i) => {
        const p = state.players[i];
        return `<div class="score ${p?.id === state.selfId ? 'me' : ''} ${scoreGains.has(p?.id ?? '') ? 'score-gained' : ''}"><strong>${p?.score ?? 0}</strong><span>${esc(p?.name || 'Ожидание')}</span><div class="sub">${p?.answered && state.phase === 'question' ? '✓ Ответила' : state.phase === 'question' ? 'Выбирает ответ' : 'Игровых очков'}</div></div>${i === 0 ? '<div class="dash">:</div>' : ''}`;
      })
      .join('')}</div>`;
  };
  function lobby() {
    const state = requireState();
    if (isHost())
      return `${derby()}<div class="screen-intro glass"><div class="eyebrow">Комната создана · Ты ведущий</div><h2>Зови игроков!</h2></div><div class="panel center"><div class="eyebrow">Код комнаты</div><div class="hugecode">${esc(state.code)}</div><div class="copyline" id="shareLink">${esc(roomLink(state.code))}</div><div class="split">${btn('📋 Скопировать ссылку', 'copy', 'secondary')}${btn('📲 Поделиться', 'share', 'secondary')}</div><p class="hint">Участницы открывают ссылку на своих телефонах и выбирают ники.</p></div><div class="panel"><h3>Кто уже в раздевалке?</h3>${playersHTML()}<div style="height:17px"></div>${btn('🏒 Начать матч →', 'start', 'primary', state.players.length !== 2)}${state.players.length < 2 ? '<div class="note">Стартуем, когда подключатся обе девушки.</div>' : ''}</div>${errorHTML()}`;
    return `${derby()}<div class="screen-intro glass"><div class="eyebrow">Ты в игре · Комната ${esc(state.code)}</div><h2>Привет, ${esc(me()?.name || 'болельщица')}!</h2></div><div class="panel center"><div class="bigemoji">🧊</div><h2>Разминка перед матчем</h2><p>Пока ведущий собирает состав. Вопросы общие, но ответ каждая выбирает самостоятельно. Соперница играет на своём телефоне.</p>${playersHTML()}<div class="note">Можно вернуться с этого устройства: участие сохранено в браузере. Матч начнётся автоматически.</div></div>${errorHTML()}`;
  }
  function progressBar() {
    const state = requireState();
    return `<div class="meta"><span class="eyebrow">${state.question?.period || Math.min(3, Math.ceil((state.index + 1) / 6))}-й период · Хоккейный баттл</span><span class="counter">${Math.min(state.index + 1, state.total)} / ${state.total}</span></div><div class="progress"><div style="width:${Math.min(100, ((state.index + 1) * 100) / state.total)}%"></div></div>`;
  }
  function questionScreen() {
    const state = requireState();
    if (state.phase !== 'question' && state.phase !== 'reveal') throw new Error('Not a question');
    const q = {
      ...state.question,
      correct: state.phase === 'reveal' ? state.question.correct : -1,
      explanation: state.phase === 'reveal' ? state.question.explanation : undefined,
    };
    const player = me();
    const voted = player?.answered;
    const reveal = state.phase === 'reveal';
    const options = q.options
      .map((name, i) => {
        const own =
          (reveal && player && 'answer' in player
            ? player.answer
            : voted
              ? currentChoice()
              : undefined) === i;
        const cl = reveal
          ? i === q.correct
            ? 'correct'
            : own
              ? 'wrong'
              : ''
          : own
            ? 'chosen'
            : '';
        const status = reveal
          ? i === q.correct
            ? own
              ? '✓ Ваш ответ · верно'
              : '✓ Правильный ответ'
            : own
              ? '× Ваш ответ · неверно'
              : ''
          : own
            ? '✓ Ваш ответ принят'
            : '';
        return `<button class="option ${cl}" data-answer="${i}" ${isHost() || voted || reveal ? 'disabled' : ''} ${own ? 'aria-pressed="true"' : 'aria-pressed="false"'}><span class="letter" aria-hidden="true">${reveal && i === q.correct ? '✓' : reveal && own ? '×' : 'АБВГ'[i]}</span><span class="option-copy">${esc(name)}${status ? `<span class="option-status">${status}</span>` : ''}</span></button>`;
      })
      .join('');
    return `<section class="arena-board" aria-label="Табло викторины"><div class="board-heading"><span>Очки викторины · за ответ +1</span><span class="board-light">НА ЛЬДУ</span></div>${progressBar()}${scoreboard()}</section><div class="panel question-card"><div class="eyebrow">${reveal ? 'Финальный свисток вопроса' : isHost() ? 'Обе участницы отвечают' : voted ? 'Твой ответ принят' : 'Время подумать'}</div><div class="qtext">${esc(q.text)}</div><div class="options">${options}</div>
 ${!reveal ? (isHost() ? `<div class="pending"><strong>Ожидаем ответы</strong>${state.players.filter((p) => p.answered).length} из 2 ответили</div>${btn('Показать ответ (пропустить ожидающих)', 'reveal', 'ghost')}` : voted ? '<div class="pending"><strong>✅ Ответ записан!</strong>Ждём второго игрока. Ничего не нажимай, всё обновится само.</div>' : '<p class="note">Выбирай ответ: изменить его потом уже нельзя.</p>') : `<div class="feedback"><h3>✅ ${esc(q.options[q.correct])}</h3><p>${esc(q.explanation)}</p></div><div style="height:13px"></div>${state.players.map((p) => `<div class="member"><div class="member-icon">${'correct' in p && p.correct ? '🥅' : '🧤'}</div><div class="mname">${esc(p.name)}</div><div class="mstate ${'correct' in p && p.correct ? 'ready' : ''}">${'correct' in p && p.correct ? '+1 очко' : 'answer' in p && p.answer === -1 ? 'Пропуск' : '0 очков'}</div></div>`).join('')}${isHost() ? `<div style="height:15px"></div>${btn(state.index === state.total - 1 ? '🏆 Финальная сирена →' : (state.index + 1) % 6 === 0 ? '🧊 Перерыв между периодами →' : 'Следующий вопрос →', 'next')}` : '<div class="pending center"><strong>Вопрос разобран!</strong>Ждём, пока ведущий откроет следующий.</div>'}`}
 </div>${errorHTML()}`;
  }
  function breakScreen() {
    const state = requireState();
    const p = state.index / 6;
    return `<div class="panel center"><div class="bigemoji">🧊</div><div class="eyebrow">Перерыв между периодами</div><h2>${p}-й период окончен!</h2><p>Можно выдохнуть, обсудить моменты и проверить счёт.</p>${scoreboard()}<p>${p === 1 ? 'Впереди — офсайды, пробросы и удаления.' : 'Впереди — овертаймы, буллиты и хоккейные ловушки.'}</p>${isHost() ? btn(`Начать ${p + 1}-й период →`, 'next') : '<div class="pending center">Ведущий скоро даст старт следующему периоду.</div>'}</div>${errorHTML()}`;
  }
  function finishScreen() {
    const state = requireState();
    const a = state.players[0],
      b = state.players[1];
    if (!a || !b) throw new Error('Missing players');
    const name =
      a.score === b.score
        ? 'Боевая ничья! 🤝'
        : `${esc(a.score > b.score ? a.name : b.name)} — чемпионка!`;
    return `${derby()}<div class="panel center victory"><div class="celebration" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--x:${7 + i * 8}%;--c:${i % 2 ? '#8fcfff' : '#ff8da5'};--delay:${(i % 4) * 0.08}s"></i>`).join('')}</div><div class="bigemoji">🏆</div><div class="eyebrow">Финальная сирена</div><h1 style="font-size:38px">Матч окончен!</h1><div class="podium">${a.score} : ${b.score}</div><h2>${name}</h2><p>Теперь можно ехать на дерби и кричать «СУДЬЯ, ТЫ ЧЕГО?!» — иногда даже по делу. 😁</p>${btn('🎯 Хоккейное бинго на арене', 'bingo', 'secondary')}${isHost() ? `<div style="height:12px"></div>${btn('🔁 Реванш', 'restart', 'ghost')}` : ''}</div>${errorHTML()}`;
  }
  function bingoScreen() {
    const current = requireState();
    const open = current.phase === 'finished';
    const closed = current.bingoClosed;
    const checked = me()?.bingo || [];
    const players = current.players;
    const [first, second] = players;
    const title = closed ? 'Бинго завершено' : 'Бинго на арене';
    const intro = `<div class="screen-intro glass"><div class="eyebrow">Вторая часть · ВТБ Арена</div><h1>Хоккейное<br>бинго</h1><p class="lead">${closed ? 'Финальная сирена прозвучала! Результаты зафиксированы.' : 'Лови события на льду во время настоящего дерби. У каждой участницы — собственный список!'}</p></div>`;
    if (!open) return intro +
      '<div class="panel"><h3>Сначала — три периода викторины</h3><p>Отмечать события можно будет после 18-го вопроса. На арене продолжим игру!</p></div>';
    const tally = (player: typeof first) => player?.bingo.length ?? 0;
    const winner = !first || !second
      ? 'Ожидание игроков'
      : tally(first) === tally(second)
        ? 'Ничья в бинго! 🤝'
        : `${esc(tally(first) > tally(second) ? first.name : second.name)} — победительница бинго! 🏆`;
    const summary = `<div class="bingo-totals" aria-label="Счёт бинго">${players.map((p) =>
      `<div class="bingo-total"><strong>${esc(p.name)}</strong><span>${p.bingo.length} / ${current.missions.length}</span></div>`
    ).join('')}</div>`;
    const final = closed
      ? `<div class="feedback" role="status"><h3>🏆 ${winner}</h3><p>Итоги бинго зафиксированы ведущим. Изменить отметки уже нельзя.</p></div>`
      : '';
    if (isHost()) {
      const matrix = current.missions.map((m, i) => `<div class="bingo-host-row"><div class="bingo-host-task">${m.icon} ${esc(m.title)}</div>${players.map((p) =>
        `<span class="bingo-host-mark" aria-label="${esc(p.name)}: ${p.bingo.includes(i) ? 'выполнено' : 'не выполнено'}">${p.bingo.includes(i) ? '✓' : '—'}</span>`
      ).join('')}</div>`).join('');
      return intro + `<div class="panel"><div class="eyebrow">${closed ? 'Финальные результаты' : 'Живой прогресс участниц'}</div><h2>${title}</h2><p>${closed ? 'Результаты можно посмотреть и обсудить после матча.' : 'Отметки обновляются автоматически. После финальной сирены останови бинго — результаты будут зафиксированы.'}</p>${summary}<div class="bingo-host-grid"><div class="bingo-host-row bingo-host-heading"><span>Событие</span>${players.map((p) => `<span title="${esc(p.name)}">${esc(p.name)}</span>`).join('')}</div>${matrix}</div>${final}${!closed ? `<div style="height:16px"></div>${btn('🏁 Завершить бинго и показать итоги', 'finish-bingo', 'primary')}` : ''}</div>${errorHTML()}`;
    }
    return intro + `<div class="panel"><div class="meta"><h3>${closed ? 'Мои результаты' : 'Миссии на трибуне'}</h3><span class="counter">${checked.length} / ${current.missions.length}</span></div><div class="progress"><div style="width:${(checked.length * 100) / current.missions.length}%"></div></div>${closed ? summary : ''}<div class="bingo">${current.missions.map((m, i) => `<button class="mission ${checked.includes(i) ? 'done' : ''}" data-mission="${i}" ${closed ? 'disabled' : ''}><div class="ico">${m.icon}</div><div><div class="mtitle">${esc(m.title)}</div><div class="mdesc">${esc(m.desc)}</div></div><div class="mstatus">${checked.includes(i) ? '✓ Выполнено' : '○ Найти на льду'}</div></button>`).join('')}</div>${final}${!closed && checked.length === current.missions.length ? '<div class="feedback"><h3>🏆 Все миссии выполнены!</h3><p>Красно-синий — самый сильный!</p></div>' : ''}</div>${errorHTML()}`;
  }
  function rulesScreen() {
    return `<div class="screen-intro glass"><div class="eyebrow">Открыто всем · До игры и во время матча</div><h1>Правила<br>с трибуны</h1><p class="lead">17 коротких карточек — всё, что понадобится для 18 вопросов. В викторине за верный ответ +1, а турнирные очки клубов считаются отдельно.</p></div><div class="rules-grid">${hockeyRules.map(({ id, title, text }) => `<article class="rule" id="rule-${id}"><strong>${esc(title)}</strong><p>${esc(text)}</p></article>`).join('')}</div><div class="panel small"><strong>Источники · сезон 2026/27</strong><p>Объяснения упрощены для первого знакомства. В спорном эпизоде решают судьи по полным правилам.</p><a href="https://cska-hockey.ru/club/documents/" target="_blank" rel="noopener noreferrer">Спортивный регламент КХЛ</a> · <a href="https://vks.fhr.ru/docs/93/" target="_blank" rel="noopener noreferrer">Правила ФХР</a></div>`;
  }

  if (tab === 'rules') return rulesScreen() + errorHTML();
  if (!auth)
    return tab === 'game'
      ? startScreen()
      : '<div class="panel"><h2>Сначала войди в комнату</h2><p>Чтобы у каждого было своё бинго, сначала создай комнату или присоединись к ней.</p>' +
          btn('К игре', 'game', 'secondary') +
          '</div>';
  if (!state)
    return `<div class="panel center"><div class="bigemoji">⏳</div><h2>Подключаемся к игре...</h2><p>Комната ${esc(auth.code)}</p>${errorHTML()}${btn('Повторить подключение', 'reconnect', 'secondary')}${btn('Выйти из комнаты', 'leave', 'ghost')}</div>`;
  if (tab === 'bingo') return bingoScreen();
  switch (state.phase) {
    case 'lobby':
      return lobby();
    case 'question':
    case 'reveal':
      return questionScreen();
    case 'break':
      return breakScreen();
    case 'finished':
      return finishScreen();
  }
}
