import './styles.css';
import type { Endpoint, GameSnapshot, Session, VisualChoice } from '../shared/contracts.js';
import { isSession } from '../shared/validation.js';
import { HttpError, post } from './api.js';
import { createSessionStore } from './session.js';
import { createSoundEffects } from './audio.js';
import { cueForTransition } from './audio-events.js';
import { createSync } from './sync.js';
import { renderView, roomLink } from './views.js';
import type { Tab } from './views.js';
function element(selector: string) {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error('Missing element ' + selector);
  return el;
}
const app = element('#app'),
  status = element('#status'),
  statusRow = element('#statusRow'),
  roomBar = element('#roomBar'),
  roomInfo = element('#roomInfo'),
  closeRoom = element('#closeRoom'),
  audioToggle = element('#audioToggle'),
  audioDebugPanel = element('#audioDebugPanel'),
  audioDebugStatus = element('#audioDebugStatus'),
  audioDebugLog = element('#audioDebugLog');
const audioDebugMode = new URLSearchParams(location.search).get('audioDebug') === '1';
const debugStartedAt = performance.now();
const debugLines: string[] = [];
function debugLog(category: string, message: string) {
  if (!audioDebugMode) return;
  const now = new Date();
  const time = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  const elapsed = Math.round(performance.now() - debugStartedAt);
  const nearBottom = audioDebugLog.scrollHeight - audioDebugLog.scrollTop - audioDebugLog.clientHeight < 48;
  debugLines.push(`[${time}] +${elapsed}ms [${category}] ${message}`);
  if (debugLines.length > 200) debugLines.shift();
  audioDebugLog.textContent = debugLines.join('\n');
  if (nearBottom) audioDebugLog.scrollTop = audioDebugLog.scrollHeight;
}
const soundEffects = createSoundEffects((message) => debugLog('AUDIO', message));
debugLog('UI', 'Audio diagnostics enabled');
const store = createSessionStore(
  import.meta.env.DEV,
  location.search,
  {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  },
  {
    getItem: (k) => sessionStorage.getItem(k),
    setItem: (k, v) => sessionStorage.setItem(k, v),
    removeItem: (k) => sessionStorage.removeItem(k),
  },
);
const loaded = store.load();
let auth: Session | null = loaded.session,
  state: GameSnapshot | null = null,
  tab: Tab = 'game',
  err = loaded.error,
  syncError = '',
  online = false,
  busy = false;
let choice: VisualChoice | null = store.loadChoice(),
  lastScene = '',
  lastScores = new Map<string, number>(),
  scoreGains = new Set<string>();
const scoreGlowUntil = new Map<string, number>();
let activeRequest: AbortController | null = null;
const isHost = () => state?.role === 'host';
const me = () => state?.players.find((p) => p.id === state?.selfId);
function setStatus(value: boolean) {
  online = value;
  status.classList.toggle('offline', !online);
  const label = status.querySelector('span');
  if (label)
    label.textContent = !auth ? 'Готовы к игре' : online ? 'На связи' : 'Переподключаемся…';
}
function render() {
  const scene = `${tab}:${auth?.code ?? 'guest'}:${state?.matchId ?? ''}:${state?.phase ?? 'start'}:${state?.index ?? ''}`,
    animate = scene !== lastScene;
  scoreGains = new Set();
  for (const p of state?.players ?? []) {
    const previous = lastScores.get(p.id);
    if (previous !== undefined && p.score > previous) scoreGlowUntil.set(p.id, Date.now() + 500);
    if ((scoreGlowUntil.get(p.id) ?? 0) > Date.now()) scoreGains.add(p.id);
  }
  if (!auth || state?.phase === 'lobby') {
    scoreGlowUntil.clear();
    choice = null;
    store.saveChoice(null);
  }
  roomBar.hidden = !auth;
  closeRoom.hidden = auth?.role !== 'host';
  audioToggle.hidden = auth?.role !== 'player';
  audioDebugPanel.hidden = !(audioDebugMode && auth?.role === 'player');
  audioToggle.setAttribute('aria-pressed', String(soundEffects.enabled));
  audioToggle.textContent = soundEffects.enabled ? '🔊 Звук включён' : '🔇 Включить звук';
  roomInfo.textContent = auth
    ? `${auth.role === 'host' ? '🎤 Ведущий' : '🏒 Участница'} · ${auth.code}`
    : '';
  for (const b of document.querySelectorAll('[data-tab]')) {
    if (b instanceof HTMLElement) b.classList.toggle('selected', b.dataset.tab === tab);
  }
  app.innerHTML = renderView({
    auth,
    state,
    tab,
    err: err || syncError,
    scoreGains,
    choice: store.choiceFor(choice, state),
  });
  (app.querySelector('.game-intro') ?? app.querySelector('.panel,.screen-intro') ?? app).prepend(
    statusRow,
  );
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    app.animate(
      [
        { opacity: 0.65, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'ease-out' },
    );
  if (!animate) app.querySelectorAll('.victory .celebration').forEach((el) => el.remove());
  lastScene = scene;
  lastScores = new Map((state?.players ?? []).map((p) => [p.id, p.score]));
}
function forget(message = '') {
  soundEffects.disable();
  sync.stop();
  activeRequest?.abort();
  auth = null;
  state = null;
  tab = 'game';
  syncError = '';
  err = store.save(null) || message;
  history.replaceState({}, '', store.clearedUrl(location.pathname));
  setStatus(false);
  render();
}
const sync = createSync({
  session: () => auth,
  status: (value) => {
    debugLog('SSE', `connection=${value ? 'online' : 'offline'}`);
    setStatus(value);
  },
  ended: (message) => {
    debugLog('SSE', 'session ended');
    forget(message);
  },
  error: (message) => {
    debugLog('SSE', `error ${message}`);
    syncError = message;
    render();
  },
  state: (next) => {
    if (state && next.code === state.code && next.version < state.version) return;
    const oldIndex = state?.index,
      oldPhase = state?.phase,
      oldVersion = state?.version,
      cue = cueForTransition(state, next);
    debugLog('SSE', `snapshot v${oldVersion ?? '-'} → v${next.version} ${oldPhase ?? '?'}[${oldIndex ?? '-'}] → ${next.phase}[${next.index}] role=${next.role}`);
    debugLog('CUE', `cue=${cue ?? 'none'}`);
    state = next;
    syncError = '';
    render();
    if (audioDebugMode && next.role === 'player') {
      audioDebugStatus.textContent =
        `v${next.version} ${oldPhase ?? '?'}[${oldIndex ?? '-'}] → ${next.phase}[${next.index}]; ` +
        `cue: ${cue ?? 'нет'}; AudioContext: ${soundEffects.contextState}`;
    }
    if (cue) {
      void soundEffects.play(cue, 'sse').then((result) => {
        if (audioDebugMode && next.role === 'player')
          audioDebugStatus.textContent =
            `${cue}: ${result} (не гарантирует слышимый звук); AudioContext: ${soundEffects.contextState}`;
      });
    }
    if (
      oldIndex !== undefined &&
      (oldIndex !== next.index || oldPhase !== next.phase) &&
      tab === 'game'
    )
      window.scrollTo({
        top: 0,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  },
});
async function request(endpoint: Endpoint, data: Record<string, unknown> = {}) {
  if (busy) return null;
  busy = true;
  err = '';
  const captured = auth;
  const controller = new AbortController();
  activeRequest = controller;
  try {
    const payload = {
      ...data,
      ...(auth
        ? {
            code: auth.code,
            token: auth.token,
            ...(state
              ? {
                  matchId: state.matchId,
                  ...(auth.role === 'host' ? { version: state.version } : { index: state.index }),
                }
              : {}),
          }
        : {}),
    };
    const result = await post(endpoint, payload, controller.signal);
    return auth === captured ? result : null;
  } catch (error) {
    if (auth === captured && !controller.signal.aborted) {
      err = error instanceof Error ? error.message : 'Ошибка соединения';
      if (error instanceof HttpError && (error.status === 409 || error.status === 0))
        void sync.connect();
      render();
    }
    return null;
  } finally {
    if (activeRequest === controller) activeRequest = null;
    busy = false;
  }
}
function enterSession(value: Session) {
  soundEffects.disable();
  sync.stop();
  auth = value;
  state = null;
  syncError = '';
  err = store.save(auth);
  tab = 'game';
  render();
  void sync.connect();
}
async function act(action: string) {
  if (action === 'audio-clear-logs' && audioDebugMode && auth?.role === 'player') {
    debugLines.length = 0;
    audioDebugLog.textContent = '';
    audioDebugStatus.textContent = 'Журнал очищен';
    return;
  }
  if (action === 'audio-copy-logs' && audioDebugMode && auth?.role === 'player') {
    const content = debugLines.join('\n');
    try {
      await navigator.clipboard.writeText(content);
      audioDebugStatus.textContent = 'Журнал скопирован';
    } catch {
      prompt('Скопируй журнал:', content);
    }
    return;
  }
  if (action === 'audio-test-delay' && audioDebugMode && auth?.role === 'player') {
    const started = performance.now();
    debugLog('TIMER', 'scheduled period-end in 3000ms');
    setTimeout(() => {
      if (auth?.role !== 'player') {
        debugLog('TIMER', 'cancelled: player session no longer active');
        return;
      }
      debugLog('TIMER', `fired after ${Math.round(performance.now() - started)}ms`);
      void soundEffects.play('period-end', 'timer-3s').then((result) => {
        audioDebugStatus.textContent = `period-end (timer): ${result}; AudioContext: ${soundEffects.contextState}`;
      });
    }, 3000);
    return;
  }
  if (action === 'audio-test-siren' || action === 'audio-test-whistle') {
    if (!audioDebugMode || auth?.role !== 'player') return;
    const cue = action === 'audio-test-siren' ? 'period-end' : 'period-start';
    debugLog('UI', `manual test ${cue}`);
    const result = await soundEffects.play(cue, 'manual-test');
    audioDebugStatus.textContent =
      `${cue}: ${result}; AudioContext: ${soundEffects.contextState}`;
    return;
  }
  if (action === 'audio') {
    if (auth?.role !== 'player') return;
    if (soundEffects.enabled) soundEffects.disable();
    else if (await soundEffects.enable()) {
      const result = await soundEffects.play('puck-hit', 'enable-feedback');
      if (audioDebugMode)
        audioDebugStatus.textContent = `puck-hit: ${result}; AudioContext: ${soundEffects.contextState}`;
    }
    else err = 'Не удалось включить звук. Проверь подключение и настройки браузера.';
    render();
    return;
  }
  if (action === 'rules' || action === 'game' || action === 'bingo') {
    tab = action;
    render();
    return;
  }
  if (action === 'reconnect') {
    void sync.connect();
    return;
  }
  if (action === 'leave') {
    if (
      confirm(
        'Забыть участие на этом устройстве? Вернуться с прежним счётом будет нельзя. Чтобы просто сделать паузу, закрой вкладку.',
      )
    )
      forget('Участие забыто на этом устройстве. Ведущий может освободить слот в лобби.');
    return;
  }
  if (action === 'finish-bingo') {
    if (!confirm('Завершить бинго после финальной сирены? Отметки обеих участниц будут зафиксированы.')) return;
    await request('finish-bingo');
    return;
  }
  if (action === 'close') {
    if (!confirm('Закрыть комнату для всех? Очки и бинго будут удалены.')) return;
    const value = await request('close');
    if (value) forget('Комната закрыта. Можно создать новую игру.');
    return;
  }
  if (action === 'create') {
    const value = await request('create');
    if (isSession(value)) enterSession(value);
    return;
  }
  if (action === 'copy' || action === 'share') {
    if (!state) return;
    const url = roomLink(state.code);
    if (action === 'share' && navigator.share) {
      try {
        await navigator.share({
          title: 'Хоккейный баттл',
          text: `Твой код игры: ${state.code}`,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      const el = document.querySelector('#shareLink');
      if (el) el.textContent = '✓ Ссылка скопирована!';
    } catch {
      prompt('Скопируй ссылку:', url);
    }
    return;
  }
  if (action === 'restart' && !confirm('Начать заново? Очки и бинго обнулятся.')) return;
  if (action === 'start' || action === 'reveal' || action === 'next' || action === 'restart')
    await request(action);
}
async function submit(event: SubmitEvent) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'joinForm') return;
  event.preventDefault();
  const code = form.querySelector('#roomCode'),
    name = form.querySelector('#nickname');
  if (!(code instanceof HTMLInputElement) || !(name instanceof HTMLInputElement)) return;
  const value = await request('join', {
    code: code.value.trim().toUpperCase(),
    name: name.value.trim(),
  });
  if (isSession(value)) enterSession(value);
}
async function click(event: MouseEvent) {
  const target = event.target,
    button = target instanceof Element ? target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  soundEffects.resumeOnGesture();
  if (button.dataset.kick) {
    if (confirm('Освободить слот этой участницы? Её прежний доступ перестанет работать.'))
      await request('kick', { playerId: button.dataset.kick });
    return;
  }
  const nextTab = button.dataset.tab;
  if (nextTab === 'game' || nextTab === 'rules' || nextTab === 'bingo') {
    tab = nextTab;
    render();
    return;
  }
  if (button.dataset.action) {
    await act(button.dataset.action);
    return;
  }
  const snapshot = state;
  if (
    button.dataset.answer !== undefined &&
    snapshot?.phase === 'question' &&
    snapshot.role === 'player' &&
    snapshot.selfId &&
    !me()?.answered
  ) {
    const number = Number(button.dataset.answer),
      captured: VisualChoice = {
        code: snapshot.code,
        matchId: snapshot.matchId,
        selfId: snapshot.selfId,
        index: snapshot.index,
        answer: number,
      };
    const accepted = await request('answer', { answer: number });
    if (accepted && state?.matchId === captured.matchId && state.index === captured.index) {
      choice = captured;
      store.saveChoice(choice);
      render();
    }
    if (navigator.vibrate) navigator.vibrate(12);
  }
  if (button.dataset.mission !== undefined && state && !isHost())
    await request('bingo', { mission: Number(button.dataset.mission) });
}
document.addEventListener('submit', (event) => {
  void submit(event);
});
document.addEventListener('click', (event) => {
  void click(event);
});
let glassScrollTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener(
  'scroll',
  () => {
    document.body.classList.add('is-scrolling');
    clearTimeout(glassScrollTimer);
    glassScrollTimer = setTimeout(() => document.body.classList.remove('is-scrolling'), 160);
  },
  { passive: true },
);
window.addEventListener('pageshow', () => {
  debugLog('PAGE', 'pageshow');
  if (auth && !sync.active) void sync.connect();
});
window.addEventListener('pagehide', () => {
  debugLog('PAGE', 'pagehide');
  soundEffects.stop('pagehide');
  sync.stop();
  clearTimeout(glassScrollTimer);
});
window.addEventListener('online', () => {
  debugLog('NETWORK', 'online');
  void sync.connect();
});
window.addEventListener('offline', () => {
  debugLog('NETWORK', 'offline');
  sync.stop();
  setStatus(false);
});
document.addEventListener('visibilitychange', () => {
  debugLog('PAGE', `visibility=${document.visibilityState}`);
  if (document.hidden) {
    soundEffects.stop('visibility-hidden');
    sync.stop();
    setStatus(false);
  } else if (auth) void sync.connect();
});
window.addEventListener('storage', (event) => {
  if (event.key === store.key && event.newValue !== JSON.stringify(auth)) {
    sync.stop();
    activeRequest?.abort();
    const next = store.load();
    auth = next.session;
    state = null;
    err = next.error;
    render();
    setStatus(false);
    if (auth) void sync.connect();
  }
});
render();
setStatus(false);
if (auth) void sync.connect();
