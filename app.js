/* PURPLE — Safe controller; build with tools/build_safe.py. */
'use strict';
(() => {
  const LOOKS = window.PURPLE_LOOKS;
  const REPLIES = window.PURPLE_REPLIES || {};
  const WARDROBE_DIALOGUES = window.PURPLE_WARDROBE_DIALOGUES || {};
  const AVAILABLE = LOOKS.map((_, i) => i).filter(i => !LOOKS[i].locked);
  const isPlayable = i => Number.isInteger(i) && AVAILABLE.includes(i);
  // Resolve display chapters without moving the saved catalog indices.
  const indices = ids => ids.map(id => LOOKS.findIndex(look => look.id === id));
  const CLASSIC_CHAPTERS = [
    { name: '日常靠近', looks: [0, 1, 3, 5] },
    { name: '慢慢心动', looks: [2, 4, 6, 7] },
    { name: '心意新章', looks: indices(['09', 'classic-20', 'classic-24']) },
    { name: '没说完的话', looks: indices(['10', '11', '12']) }
  ];
  // Display order is independent of the stable IDs used for media and saved preferences.
  const WARDROBES = [
    {id: 'classic', name: '咫尺偏爱', english: 'CLOSER, TOGETHER', defaultLook: 3, empty: 'empty.jpg', chapters: CLASSIC_CHAPTERS},
    {id: 'sit', name: '片刻倾心', english: 'A SEAT IN PURPLE', defaultLook: indices(['sit-02'])[0], empty: 'empty-purple.jpg', chapters: [
      {name: '坐叙 · 日常', looks: indices(['sit-02', 'sit-04', 'sit-05', 'sit-06'])},
      {name: '坐叙 · 余闲', looks: indices(['sit-07', 'sit-12', 'sit-14', 'sit-16'])},
      {name: '坐叙 · 私语', looks: indices(['sit-13', 'sit-01', 'sit-03', 'sit-09'])}
    ]},
    {id: 'recline', name: '慵懒依偎', english: 'SLOW AFTERNOONS', defaultLook: indices(['recline-01'])[0], empty: 'empty-purple.jpg', chapters: [
      {name: '小憩 · 轻柔', looks: indices(['recline-01', 'recline-02', 'recline-03', 'recline-04'])},
      {name: '小憩 · 随心', looks: indices(['recline-05', 'recline-06', 'recline-07'])}
    ]}
  ];
  // Keep chapter order, but fill each page before starting another. Removed
  // outfits must not leave an empty slot while later cards still exist.
  for (const group of WARDROBES) {
    const chapters = group.chapters;
    const ordered = chapters.flatMap(chapter => chapter.looks);
    group.chapters = Array.from({length: Math.ceil(ordered.length / 4)}, (_, page) => ({
      name: chapters[page].name, looks: ordered.slice(page * 4, page * 4 + 4)
    }));
  }
  const wardrobeFor = index => WARDROBES.find(group => group.chapters.some(chapter => chapter.looks.includes(index))) || WARDROBES[0];
  const orderFor = group => group.chapters.flatMap(chapter => chapter.looks);
  const displayNumber = index => String(orderFor(wardrobeFor(index)).indexOf(index) + 1).padStart(2, '0');
  const pageFor = i => wardrobeFor(i).chapters.findIndex(chapter => chapter.looks.includes(i));
  const $ = id => document.getElementById(id);
  let video = $('film');
  let spare = $('filmNext');
  const decks = [video, spare];
  const body = document.body;
  const root = document.documentElement;
  // Keep the historic storage identity so existing favorites and frames survive a rename.
  const KEY = 'frac-hinata.safe.we.wardrobe-v1';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const number = (value, fallback, lo, hi) => Number.isFinite(Number(value)) ? clamp(Number(value), lo, hi) : fallback;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
  const CATALOG_REVISION = 2;
  // The first public removal retires old indices 31 and 35. Migrate all
  // index-based records together; the prior netdisk edition is already compact.
  if ((Number(saved.catalogRevision) || 0) < 1 && !KEY.endsWith('.netdisk-v1')) {
    const remap = index => !Number.isInteger(index) || index === 31 || index === 35 ? undefined : index > 31 ? index - 1 : index;
    const oldCurrent = saved.current;
    saved = {...saved,
      current: oldCurrent === 31 ? WARDROBES.find(group => group.id === 'recline').defaultLook : remap(oldCurrent),
      favorites: Array.isArray(saved.favorites) ? saved.favorites.map(remap).filter(Number.isInteger) : [],
      freezes: Array.isArray(saved.freezes) ? saved.freezes.filter((_, index) => index !== 31 && index !== 35) : [],
      wardrobeLooks: Object.fromEntries(Object.entries(saved.wardrobeLooks || {}).map(([id, index]) => [id, remap(index)]))
    };
  }
  // Revision 2 removes one closed card from the compact revision-1 catalog.
  // Both public and netdisk records need this step; keep custom frames aligned.
  if ((Number(saved.catalogRevision) || 0) < 2) {
    const remap = index => !Number.isInteger(index) || index === 31 ? undefined : index > 31 ? index - 1 : index;
    saved = {...saved,
      current: remap(saved.current),
      favorites: Array.isArray(saved.favorites) ? saved.favorites.map(remap).filter(Number.isInteger) : [],
      freezes: Array.isArray(saved.freezes) ? saved.freezes.filter((_, index) => index !== 31) : [],
      wardrobeLooks: Object.fromEntries(Object.entries(saved.wardrobeLooks || {}).map(([id, index]) => [id, remap(index)]))
    };
  }
  const FREEZE_REVISION = 2;
  const playbackModes = ['freeze', 'single', 'all', 'favorites'];
  const defaults = {
    current: 3, favorites: [], freezes: LOOKS.map((look, index) => isPlayable(index) ? look.freeze : null),
    catalogRevision: CATALOG_REVISION, freezeRevision: FREEZE_REVISION, sound: false, volume: 35, brightness: 100,
    autoHide: true, fit: 'contain', interval: 0, playbackMode: 'freeze',
    wardrobeLooks: Object.fromEntries(WARDROBES.map(group => [group.id, group.defaultLook])),
    wardrobeModes: Object.fromEntries(WARDROBES.map(group => [group.id, 'freeze'])),
    wardrobeRandomScopes: Object.fromEntries(WARDROBES.map(group => [group.id, 'all'])),
    welcomeSeen: true
  };
  const FREEZE_MIGRATIONS = [
    {revision: 1, previous: {'02': 11.7, '05': 11.2, '07': 10.5, '08': 11.7, '09': 10.5}},
    {revision: 2, previous: {'recline-03': 11.7, 'recline-05': 11.7}}
  ];
  function initialFreeze(look, index) {
    if (!isPlayable(index)) return null;
    const stored = saved.freezes?.[index];
    if (stored == null) return look.freeze;
    // Migrate remembered old defaults once; retain custom frames, including any
    // old-default timestamp explicitly chosen again after this update.
    if (FREEZE_MIGRATIONS.some(migration => (saved.freezeRevision || 0) < migration.revision &&
        Math.abs(Number(stored) - migration.previous[look.id]) < .008)) return look.freeze;
    return number(stored, look.freeze, .1, look.duration - .05);
  }
  const prefs = {
    current: isPlayable(saved.current) ? saved.current : LOOKS[saved.current] ? wardrobeFor(saved.current).defaultLook : defaults.current,
    favorites: Array.isArray(saved.favorites) ? [...new Set(saved.favorites.filter(isPlayable))] : [],
    freezes: LOOKS.map(initialFreeze),
    wardrobeLooks: Object.fromEntries(WARDROBES.map(group => {
      const value = saved.wardrobeLooks?.[group.id];
      return [group.id, isPlayable(value) && wardrobeFor(value) === group ? value : group.defaultLook];
    })),
    // Migrate the old shared mode once. Each wardrobe then keeps its own choice.
    wardrobeModes: Object.fromEntries(WARDROBES.map(group => {
      const value = saved.wardrobeModes?.[group.id] ?? saved.playbackMode;
      return [group.id, playbackModes.includes(value) ? value : 'freeze'];
    })),
    wardrobeRandomScopes: Object.fromEntries(WARDROBES.map(group => {
      const value = saved.wardrobeRandomScopes?.[group.id];
      // Existing users keep their former favorites-only random pool on upgrade.
      const hasFavorites = Array.isArray(saved.favorites) && saved.favorites.some(i => isPlayable(i) && wardrobeFor(i) === group);
      return [group.id, hasFavorites && (value === 'favorites' || value == null) ? 'favorites' : 'all'];
    })),
    // Existing users already know the interface. Only a genuinely new visit gets the hint.
    welcomeSeen: saved.welcomeSeen === true || (saved.welcomeSeen == null && Number.isInteger(saved.current) && Boolean(LOOKS[saved.current])),
    catalogRevision: CATALOG_REVISION,
    freezeRevision: FREEZE_REVISION,
    sound: saved.sound === true,
    volume: number(saved.volume, defaults.volume, 0, 100),
    brightness: number(saved.brightness, defaults.brightness, 65, 115),
    autoHide: saved.autoHide !== false,
    fit: saved.fit === 'cover' ? 'cover' : 'contain',
    interval: [0, 5, 15, 30].includes(Number(saved.interval)) ? Number(saved.interval) : 0,
    playbackMode: ['single', 'all', 'favorites'].includes(saved.playbackMode) ? saved.playbackMode : 'freeze',
    nativeValues: saved.nativeValues && typeof saved.nativeValues === 'object' ? saved.nativeValues : {}
  };
  let current = prefs.current;
  let wardrobe = wardrobeFor(current);
  let CHAPTERS = wardrobe.chapters;
  prefs.playbackMode = effectiveWardrobeMode(wardrobe);
  let page = pageFor(current);
  let dialogue = window.createPurpleDialogue({looks: LOOKS, replies: REPLIES, affection: window.PURPLE_AFFECTION, wardrobes: WARDROBE_DIALOGUES, isPlayable});
  let privateVisits = 0;
  let lastPrivateReply = -Infinity;
  let lastPrivateAside = -Infinity;
  let baseStatus = { label: '', text: '' };
  let phase = 'held'; // held | loading | playing | paused | transition | editing | error
  let systemPaused = false;
  let documentPaused = document.hidden;
  let operation = 0;
  let controller = null;
  let loadedLook = -1;
  let frameHandle = null;
  let frameKind = null;
  let spinId = 0;
  let spinning = false;
  let bag = [];
  let idleTimer, toastTimer, loadingTimer, replyTimer, welcomeTimer;
  let lastChange = Date.now();
  let lastActivity = 0;
  let panel = null;
  let panelReturnFocus = null;
  let editorOriginal = null;
  let audioContext;
  let pendingEntry = null;
  let modeOpen = false;
  let transition = null;
  let prefetch = null;

  function persist() {
    prefs.current = current;
    prefs.wardrobeLooks[wardrobeFor(current).id] = current;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {}
  }
  function icon(button, name) { button.querySelector('use').setAttribute('href', '#i-' + name); }
  function line(index, event) {
    if (LOOKS[index].silent) return '';
    if (event === 'held') return dialogue.held(index);
    if (event === 'enter') return dialogue.enter(index);
    return dialogue.reply(index, event).text;
  }
  function fixedLine(key, fallback) {
    return WARDROBE_DIALOGUES[wardrobe.id]?.fixed?.[key] ?? fallback;
  }
  function confirmDialogueVisible(text) {
    requestAnimationFrame(() => {
      const inToast = $('toast').classList.contains('show') && $('toastText').textContent === text;
      const inStatus = !body.classList.contains('is-idle') && !body.classList.contains('is-immersed') && $('statusText').getClientRects().length && $('statusText').textContent === text;
      if (!document.hidden && (inToast || inStatus)) dialogue.shown(text);
      else dialogue.discardReply(text);
    });
  }
  function toast(text, speaker = '她说') {
    if (!text) return;
    $('toastSpeaker').textContent = speaker;
    $('toastText').textContent = text;
    $('toast').classList.add('show');
    confirmDialogueVisible(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
  }
  function writeStatus(label, text) {
    $('statusLabel').textContent = label;
    $('statusText').textContent = text;
    confirmDialogueVisible(text);
  }
  function setStatus(label, text) {
    if (LOOKS[current].silent && !text) { label = wardrobeFor(current).english; text = LOOKS[current].name; }
    clearTimeout(replyTimer);
    baseStatus = { label, text };
    writeStatus(label, text);
  }
  function respond(index, event, label = 'HERE, WITH YOU.', central = true) {
    if (LOOKS[index].silent) return '';
    const words = line(index, event);
    if (central) toast(words, !isPlayable(index) ? '她说 · 衣橱手记' : '她说 · ' + LOOKS[index].short);
    if (index === current || !isPlayable(index)) {
      clearTimeout(replyTimer);
      writeStatus(label, words);
      const token = operation;
      replyTimer = setTimeout(() => {
        if (token === operation) writeStatus(baseStatus.label, baseStatus.text);
      }, 6500);
    }
    return words;
  }
  function lockedTap(index) {
    if (!LOOKS[index]?.locked || isPlayable(index)) return;
    const now = performance.now();
    activity(true);
    if (now - lastPrivateReply < 1500) return;
    lastPrivateReply = now;
    if (LOOKS[index].silent) {
      toast('暂未开放', LOOKS[index].name);
    } else {
      privateVisits++;
      const aside = privateVisits >= 4 && now - lastPrivateAside >= 90000;
      if (aside) { privateVisits = 0; lastPrivateAside = now; }
      respond(index, aside ? 'aside' : 'locked', 'A LITTLE SECRET.');
    }
    const card = document.querySelector(`[data-look="${index}"]`);
    if (card) {
      card.classList.remove('locked-peek');
      void card.offsetWidth;
      card.classList.add('locked-peek');
    }
  }

  function activeOrder() { return orderFor(wardrobe); }
  function activeAvailable() { return activeOrder().filter(isPlayable); }
  function activeFavorites() { return activeAvailable().filter(i => prefs.favorites.includes(i)); }
  function randomFavoritesOnly() { return prefs.wardrobeRandomScopes[wardrobe.id] === 'favorites' && activeFavorites().length > 0; }
  function randomPool() { return randomFavoritesOnly() ? activeFavorites() : activeAvailable(); }
  function closeWelcome() { clearTimeout(welcomeTimer); $('firstUseHint').hidden = true; }
  function showWelcome(title = '从这里开始') {
    closeWelcome();
    $('firstUseHint').querySelector('strong').textContent = title;
    $('firstUseHint').hidden = false;
    const deadline = performance.now() + 10000;
    const tick = () => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { closeWelcome(); return; }
      $('closeFirstUse').textContent = `知道了（${Math.ceil(remaining / 1000)}s）`;
      welcomeTimer = setTimeout(tick, Math.min(1000, remaining));
    };
    tick();
    if (!prefs.welcomeSeen) { prefs.welcomeSeen = true; persist(); }
  }
  function effectiveWardrobeMode(group) {
    const mode = prefs.wardrobeModes[group.id];
    return mode === 'favorites' && !prefs.favorites.some(i => wardrobeFor(i) === group) ? 'freeze' : mode;
  }
  function adoptWardrobe(index) {
    const next = wardrobeFor(index);
    if (next !== wardrobe) {
      wardrobe = next; CHAPTERS = next.chapters; page = pageFor(index); bag = [];
      prefs.playbackMode = effectiveWardrobeMode(next);
    }
    document.querySelector('.wardrobe').dataset.collection = wardrobe.id;
    body.dataset.wardrobe = wardrobe.id;
    $('curtain').style.backgroundImage = `url("images/${wardrobe.empty}")`;
    document.querySelectorAll('#wardrobeTabs [data-wardrobe]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wardrobe === wardrobe.id)));
    window.dispatchEvent(new Event('purple:typography-change'));
  }
  function selectWardrobe(id) {
    const next = WARDROBES.find(group => group.id === id);
    if (!next || next === wardrobe || phase === 'editing') return;
    persist();
    let index = prefs.wardrobeLooks[id] ?? next.defaultLook;
    if (effectiveWardrobeMode(next) === 'favorites' && !prefs.favorites.includes(index)) {
      index = orderFor(next).find(i => prefs.favorites.includes(i));
    }
    selectLook(index, {restore: true, quiet: true});
  }
  function renderCards(animate = false) {
    $('looks').innerHTML = CHAPTERS[page].looks.map(i => {
      const look = LOOKS[i];
      const locked = !isPlayable(i);
      const thumb = `thumb-${look.id}`;
      return `<div class="look-card${locked ? ' is-locked' + (look.blurLocked ? ' blur-cover' : '') : ''}" data-look="${i}"><button class="look-select" data-select="${i}" aria-label="${locked ? look.name + '，私藏，未开放' : '选择' + look.name + '，播放入场'}" ${locked ? 'aria-disabled="true"' : 'aria-pressed="false"'}><div class="look-image"><img src="images/${thumb}.jpg" alt="${look.name}${locked ? '模糊封面' : '穿搭封面'}" draggable="false"><span class="look-index">${displayNumber(i)}</span>${locked ? '<span class="lock-veil"><svg><use href="#i-lock"/></svg><span>' + '未开放' + '</span></span>' : '<span class="look-check"><svg><use href="#i-check"/></svg></span>'}</div></button><div class="look-bottom"><span class="look-short">${look.short}</span>${locked ? '' : '<button class="favorite-button" data-favorite="' + i + '" aria-label="偏爱' + look.name + '" aria-pressed="false"><svg><use href="#i-heart"/></svg></button>'}</div></div>`;
    }).join('');
    $('chapterName').textContent = CHAPTERS[page].name;
    $('pageTabs').innerHTML = CHAPTERS.map((chapter, i) => `<button data-page="${i}" aria-label="第 ${i + 1} 页，${chapter.name}">${String(i + 1).padStart(2, '0')}</button>`).join('');
    document.querySelectorAll('[data-page]').forEach(button => {
      if (Number(button.dataset.page) === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (animate) {
      $('looks').classList.remove('page-enter'); void $('looks').offsetWidth;
      $('looks').classList.add('page-enter');
    }
    updateCards();
  }
  function setPage(next, manual = true) {
    if (manual) cancelSpin();
    page = (next + CHAPTERS.length) % CHAPTERS.length;
    renderCards(true); activity(true);
  }
  function freezeTime() { return prefs.freezes[current]; }
  function suspended() { return systemPaused || documentPaused; }
  function readyControls(disabled) {
    $('playButton').disabled = disabled;
    $('momentButton').disabled = disabled || phase === 'transition';
    $('modeButton').disabled = phase === 'editing';
    renderTransport();
  }
  function updateProgress(t) {
    $('timeLabel').textContent = t.toFixed(2);
    $('timelineFill').style.width = clamp(t / LOOKS[current].duration * 100, 0, 100) + '%';
  }
  function updateCards() {
    document.querySelectorAll('.look-card').forEach(card => {
      const i = Number(card.dataset.look);
      if (!isPlayable(i)) return;
      card.classList.toggle('active', i === current);
      card.querySelector('.look-select').setAttribute('aria-pressed', String(i === current));
      card.querySelector('.favorite-button').setAttribute('aria-pressed', String(prefs.favorites.includes(i)));
      card.querySelector('.favorite-button').setAttribute('aria-label', `${prefs.favorites.includes(i) ? '取消偏爱' : '偏爱'}${LOOKS[i].name}`);
    });
    $('lookName').textContent = LOOKS[current].name;
    $('lookEnglish').textContent = ['sit', 'recline'].includes(LOOKS[current].group) ? wardrobe.english : LOOKS[current].english;
    $('lookNumber').textContent = displayNumber(current);
    const away = page !== pageFor(current);
    $('showCurrent').hidden = !away;
    $('selectionState').textContent = phase === 'held' ? '当前定格' : '当前穿搭';
    updateRandomLabel();
    renderPlaybackMode();
  }
  function updateRandomLabel() {
    const count = activeFavorites().length;
    const favoritesOnly = randomFavoritesOnly();
    if (!spinning) $('randomText').textContent = favoritesOnly ? '从偏爱中选' : '交给心动';
    $('randomHint').textContent = favoritesOnly && count === 1 ? '仅 1 套' : '随机一套';
    $('randomButton').setAttribute('aria-label', favoritesOnly ? count === 1 ? '本组仅有一套偏爱：' + LOOKS[activeFavorites()[0]].name : `从本组 ${count} 套偏爱中随机选择` : '从当前衣橱全部开放穿搭中随机选择一套');
    $('randomScope').textContent = favoritesOnly ? count === 1 ? '本组仅 1 套偏爱 · 点亮爱心可加入更多' : `仅本组 ${count} 套偏爱 · 不连续重复` : `${wardrobe.name} · ${activeAvailable().length} 套穿搭 · 不连续重复`;
    $('randomFavoriteCount').textContent = count;
    document.querySelectorAll('[data-random-scope]').forEach(button => {
      const favorites = button.dataset.randomScope === 'favorites';
      button.setAttribute('aria-pressed', String(favorites === favoritesOnly));
      button.disabled = favorites && !count;
      button.title = favorites && !count ? '先点亮本组穿搭旁的爱心' : '';
    });
  }
  function applyPrefs() {
    root.style.setProperty('--brightness', prefs.brightness / 100);
    root.style.setProperty('--fit', prefs.fit);
    $('brightness').value = prefs.brightness;
    $('brightnessValue').textContent = prefs.brightness + '%';
    $('volume').value = prefs.volume;
    $('volumeValue').textContent = prefs.volume + '%';
    $('idleToggle').checked = prefs.autoHide;
    document.querySelectorAll('[data-fit]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fit === prefs.fit)));
    document.querySelectorAll('[data-interval]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.interval) === prefs.interval)));
    video.muted = !prefs.sound;
    video.volume = prefs.volume / 100;
    spare.muted = true;
    renderPlaybackMode();
    icon($('soundButton'), prefs.sound ? 'volume' : 'mute');
    $('soundButton').setAttribute('aria-label', prefs.sound ? '关闭声音' : '开启声音');
    $('soundButton').title = prefs.sound ? '关闭声音' : '开启声音';
    $('soundButton').setAttribute('aria-pressed', String(prefs.sound));
    $('soundToggle').checked = prefs.sound;
    $('soundState').textContent = !prefs.sound ? '已静音 · 开启声音后按下方音量播放' : prefs.volume === 0 ? '声音已开启 · 当前音量为 0' : '声音已开启';
    activity(true);
  }
  function activity(force = false) {
    if (!force && performance.now() - lastActivity < 120) return;
    lastActivity = performance.now();
    body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (prefs.autoHide && !panel && !modeOpen && !spinning && phase !== 'loading' && !suspended()) {
      idleTimer = setTimeout(() => {
        if (!panel && !modeOpen && !spinning && phase !== 'loading') {
          body.classList.add('is-idle');
          if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.interface')) document.activeElement.blur();
        }
      }, 15000);
    }
  }
  function unlockAudio() {
    if (!prefs.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) {}
  }
  function chime(pitch = 660, length = .11) {
    if (!prefs.sound || !audioContext || audioContext.state !== 'running' || suspended()) return;
    try {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = pitch;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, prefs.volume / 100 * .035), audioContext.currentTime + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + length + .02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch (_) {}
  }

  function stopWatcher() {
    if (frameHandle !== null) {
      if (frameKind === 'video') video.cancelVideoFrameCallback(frameHandle);
      else cancelAnimationFrame(frameHandle);
    }
    frameHandle = null;
  }
  function watchFrames() {
    stopWatcher();
    if (phase !== 'playing' || suspended()) return;
    const callback = (_, metadata) => {
      frameHandle = null;
      if (phase !== 'playing' || suspended()) return;
      const t = metadata ? metadata.mediaTime : video.currentTime;
      updateProgress(t);
      if (maybeBeginDeparture(t)) return;
      if (!cycling() && t >= freezeTime() - .006) settle();
      else schedule();
    };
    const schedule = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        frameKind = 'video'; frameHandle = video.requestVideoFrameCallback(callback);
      } else { frameKind = 'animation'; frameHandle = requestAnimationFrame(callback); }
    };
    schedule();
  }
  function settle() {
    stopWatcher();
    phase = 'held';
    video.pause();
    if (Number.isFinite(video.duration) && Math.abs(video.currentTime - freezeTime()) > .009) video.currentTime = Math.min(freezeTime(), video.duration - .04);
    body.classList.remove('is-playing');
    $('loading').hidden = true;
    clearTimeout(loadingTimer);
    updateProgress(freezeTime());
    $('timelineState').textContent = '定格';
    $('selectionState').textContent = '当前定格';
    icon($('playButton'), 'repeat');
    $('playButton').setAttribute('aria-label', '再看一次入场');
    $('playButton').title = '再看一次入场';
    setStatus('MOMENT, KEPT.', line(current, 'held'));
    readyControls(false);
    activity(true);
  }
  function cancelSpin() {
    ++spinId;
    spinning = false;
    body.classList.remove('is-spinning');
    document.querySelectorAll('.rolling').forEach(card => card.classList.remove('rolling'));
    $('randomButton').disabled = false;
    updateRandomLabel();
    syncTransition();
  }
  function startOperation({ keepPlaying = false } = {}) {
    cancelTransition();
    pendingEntry = null;
    controller?.abort();
    controller = new AbortController();
    ++operation;
    stopWatcher();
    if (!keepPlaying) video.pause();
    clearTimeout(loadingTimer);
    return { id: operation, signal: controller.signal };
  }
  // Every load/seek can be cancelled. Stale async work must never alter the new look.
  // Two media decks: departures dissolve while the outgoing deck is still moving.
  // Close-up/reclining endings retain their full-person, post-ended dissolve.
  const LOOP_SEAMS = {"sit-01": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-01.jpg"}, "sit-02": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-02.jpg"}, "sit-04": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-04.jpg"}, "sit-05": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-05.jpg"}, "sit-06": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-06.jpg"}, "sit-07": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-07.jpg"}, "sit-12": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-12.jpg"}, "sit-13": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-13.jpg"}, "sit-14": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-14.jpg"}, "sit-16": {"lead": 0.5, "fade": 0.4, "opening": "images/opening-sit-16.jpg"}};
  // Keep the next opening in its actual display surface, rather than a detached
  // decoded Image that Chrome may discard before the departure deadline.
  const openingSurface = document.createElement('canvas');
  openingSurface.id = 'loopPlate'; openingSurface.className = 'scene';
  openingSurface.setAttribute('aria-hidden', 'true');
  openingSurface.width = openingSurface.height = 1;
  $('curtain').before(openingSurface);
  let openingPlate = null;
  function releaseOpening() {
    openingPlate = null;
    openingSurface.classList.remove('is-primed');
    delete openingSurface.dataset.opening;
    openingSurface.width = openingSurface.height = 1;
  }
  function prepareOpening(index) {
    const src = LOOP_SEAMS[LOOKS[index].id]?.opening || `images/${wardrobe.empty}`;
    if (openingPlate?.src === src) return openingPlate.promise;
    const item = {src, promise: null};
    openingPlate = item;
    openingSurface.classList.remove('is-primed');
    item.promise = (async () => {
      const image = new Image(); image.src = src;
      await image.decode();
      if (openingPlate !== item) throw new DOMException('Cancelled', 'AbortError');
      openingSurface.width = image.naturalWidth; openingSurface.height = image.naturalHeight;
      openingSurface.getContext('2d', {alpha: false}).drawImage(image, 0, 0);
      openingSurface.dataset.opening = src;
      openingSurface.classList.add('is-primed');
      // Give the displayed surface a paint opportunity before media starts.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (openingPlate !== item) throw new DOMException('Cancelled', 'AbortError');
      return openingSurface;
    })();
    item.promise.catch(() => { if (openingPlate === item) releaseOpening(); });
    return item.promise;
  }
  function maybeBeginDeparture(time) {
    const seam = LOOP_SEAMS[LOOKS[current].id];
    if (!seam || !cycling() || phase !== 'playing' || suspended() || video.seeking || !Number.isFinite(video.duration)) return false;
    if (time < video.duration - seam.lead) return false;
    advanceLoop();
    return true;
  }
  function deckMayPlay(deck) {
    if (deck !== video || suspended()) return false;
    if (phase === 'playing') return true;
    const tx = transition;
    return phase === 'transition' && tx?.departing && tx.outgoing === deck && !tx.cancelled && !transitionBlocked(tx);
  }
  function cycling() { return prefs.playbackMode !== 'freeze'; }
  function favoriteOrder() { return activeFavorites(); }
  function nextLoopIndex() {
    if (prefs.playbackMode === 'single') return current;
    const order = prefs.playbackMode === 'all' ? activeAvailable() : favoriteOrder();
    if (!order.length) return null;
    const position = activeOrder().indexOf(current);
    return order.find(i => activeOrder().indexOf(i) > position) ?? order[0];
  }
  function renderPlaybackMode() {
    const labels = {freeze: '定格模式', single: '单套循环', all: '本组轮播', favorites: '本组收藏'};
    body.dataset.playbackMode = prefs.playbackMode;
    $('modeButton').setAttribute('aria-label', '播放方式：' + labels[prefs.playbackMode]);
    $('modeButton').title = labels[prefs.playbackMode] + ' · 切换播放方式';
    $('modeLabel').textContent = labels[prefs.playbackMode];
    $('modeButton').disabled = phase === 'editing';
    $('favoriteCount').textContent = favoriteOrder().length;
    $('favoriteModeHint').textContent = favoriteOrder().length ? `${wardrobe.name} · 仅播放本组收藏` : '先点亮本组喜欢的穿搭';
    document.querySelectorAll('[data-playback]').forEach(option => {
      option.setAttribute('aria-checked', String(option.dataset.playback === prefs.playbackMode));
      option.setAttribute('aria-disabled', String(option.dataset.playback === 'favorites' && !favoriteOrder().length));
    });
    $('autoOptions').classList.toggle('is-dormant', cycling());
    $('autoOptions').querySelectorAll('button').forEach(button => { button.disabled = cycling(); });
    $('autoLoopNote').hidden = !cycling();
    renderTransport();
  }
  // Every transport state has one icon, one action label and one timeline label.
  function renderTransport() {
    let action = '再看一次入场', symbol = 'repeat', state = '定格';
    if (phase === 'error') {
      action = '重试播放'; state = '播放失败';
    } else if (phase === 'loading') {
      action = '正在准备播放'; state = '准备';
    } else if (phase === 'editing') {
      action = '正在挑选定格'; state = '选帧';
    } else if (phase === 'transition') {
      const paused = transition?.userPaused;
      action = paused ? '继续循环播放' : '暂停循环播放'; symbol = paused ? 'play' : 'pause';
      state = paused ? '暂停' : nextLoopIndex() === current ? '再看一遍' : '轻轻换一套';
    } else if (phase === 'playing' || phase === 'paused') {
      const paused = phase === 'paused';
      action = cycling() ? paused ? '继续循环播放' : '暂停循环播放' : paused ? '继续播放入场' : '暂停入场';
      symbol = paused ? 'play' : 'pause';
      state = paused ? '暂停' : cycling() ? {single:'单套循环',all:'本组轮播',favorites:'本组收藏'}[prefs.playbackMode] : '入场';
    }
    icon($('playButton'), symbol);
    $('playButton').setAttribute('aria-label', action); $('playButton').title = action;
    $('retryLabel').hidden = phase !== 'error';
    $('playButton').classList.toggle('has-retry', phase === 'error');
    $('timelineState').textContent = state;
  }
  function openModeMenu() {
    if (phase === 'editing' || panel) return;
    closeWelcome();
    clearTimeout(toastTimer); $('toast').classList.remove('show');
    modeOpen = true; $('modeMenu').hidden = false;
    $('modeButton').setAttribute('aria-expanded', 'true');
    activity(true); clearTimeout(idleTimer); renderPlaybackMode(); syncTransition();
    $('modeMenu').querySelector('[aria-checked="true"]').focus({preventScroll: true});
  }
  function closeModeMenu(restoreFocus = true) {
    if (!modeOpen) return;
    modeOpen = false; $('modeMenu').hidden = true;
    $('modeButton').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('modeButton').focus({preventScroll: true});
    syncTransition(); activity(true);
  }
  function setPlaybackMode(mode, speak = true) {
    if (!['freeze', 'single', 'all', 'favorites'].includes(mode) || phase === 'editing') return;
    if (mode === 'favorites' && !favoriteOrder().length) return;
    closeModeMenu();
    if (mode === prefs.playbackMode) {
      prefs.wardrobeModes[wardrobe.id] = mode; persist();
      return;
    }
    const interrupted = phase === 'transition';
    if (interrupted) { startOperation(); phase = 'held'; }
    prefs.playbackMode = mode;
    prefs.wardrobeModes[wardrobe.id] = mode;
    releaseSpare(); persist(); renderPlaybackMode();
    lastChange = Date.now();
    if (mode === 'freeze') selectLook(current, {restore: true, quiet: true});
    else {
      const selected = mode === 'favorites' && !prefs.favorites.includes(current) ? favoriteOrder()[0] : current;
      if (selected !== current || !['playing', 'paused'].includes(phase)) selectLook(selected, {quiet: true});
      else primeLoop();
    }
    if (speak && !LOOKS[current].silent) {
      const words = {freeze: '好，就把喜欢的这一刻留下。', single: '这么喜欢这一套呀……那就再陪你看一会儿。', all: '那就慢慢看，我一套一套换给你。', favorites: '你点过心的，我都记得。慢慢穿给你看。'};
      const wordsForMode = fixedLine(mode, words[mode]);
      toast(wordsForMode);
      if (mode !== 'freeze') setStatus('STAY A LITTLE.', wordsForMode);
      unlockAudio(); chime(660, .12);
    }
  }
  function releaseSpare() {
    prefetch?.controller.abort(); prefetch = null;
    releaseOpening();
    spare.pause(); spare.muted = true;
    spare.style.opacity = '0'; spare.style.zIndex = '1';
    spare.removeAttribute('src'); spare.removeAttribute('data-look'); spare.load();
  }
  function prepareNext(index) {
    if (!isPlayable(index)) return Promise.reject(new Error('unavailable'));
    if (prefetch?.index === index && prefetch.element === spare) return prefetch.promise;
    prefetch?.controller.abort();
    const item = {index, element: spare, controller: new AbortController(), promise: null};
    prefetch = item;
    const deck = item.element, signal = item.controller.signal;
    deck.pause(); deck.muted = true; deck.style.opacity = '0'; deck.style.zIndex = '1';
    item.promise = (async () => {
      if (deck.dataset.look !== LOOKS[index].id || deck.readyState < 2) {
        await mediaEvent('loadeddata', signal, () => {
          deck.preload = 'auto'; deck.src = `media/look-${LOOKS[index].id}.webm`; deck.load();
        }, deck);
      }
      if (deck.currentTime > .002 || deck.seeking) await mediaEvent('seeked', signal, () => { deck.currentTime = 0; }, deck);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      deck.dataset.look = LOOKS[index].id;
      return deck;
    })();
    // Speculative loading is silent; an actual failed handoff uses loadFailure.
    item.promise.catch(() => {});
    return item.promise;
  }
  function primeLoop() {
    if (!cycling() || !['playing', 'paused'].includes(phase)) return;
    const next = nextLoopIndex();
    if (next !== null) {
      prepareNext(next);
      if (LOOP_SEAMS[LOOKS[current].id]) prepareOpening(next).catch(() => {});
    }
  }
  // Browsing settings or playback choices must not hold an automatic round.
  function transitionBlocked(tx) { return suspended() || tx.userPaused || panel === 'moment' || spinning; }
  function syncTransition() {
    const tx = transition;
    if (!tx) return;
    if (transitionBlocked(tx)) {
      // A finished clean plate must stay opaque; pausing and replaying a finished
      // animation would rewind it and briefly expose the outgoing tail again.
      if (tx.animation?.playState === 'running') tx.animation.pause();
      if (tx.departing) tx.outgoing.pause();
    }
    else {
      if (tx.departing && !tx.outgoing.ended && tx.outgoing.paused && !tx.resuming) {
        tx.resuming = true;
        tx.outgoing.play().then(() => {
          if (transition === tx && transitionBlocked(tx)) tx.outgoing.pause();
        }).catch(error => {
          if (transition === tx && !tx.cancelled) loadFailure(current, error, tx.id);
        }).finally(() => { tx.resuming = false; });
      }
      if (tx.animation?.playState === 'paused') tx.animation.play();
      [...tx.waiters].forEach(wake => wake());
    }
  }
  async function waitForTransition(tx) {
    if (tx.cancelled || tx.signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    if (!transitionBlocked(tx)) return Promise.resolve();
    await new Promise((resolve, reject) => {
      const clean = () => { tx.waiters.delete(wake); tx.signal.removeEventListener('abort', abort); };
      const wake = () => {
        if (tx.cancelled || tx.signal.aborted) { abort(); return; }
        if (!transitionBlocked(tx)) { clean(); resolve(); }
      };
      const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
      tx.waiters.add(wake); tx.signal.addEventListener('abort', abort, {once: true});
    });
    // Pause state can change again in the same input event; recheck after waking.
    return waitForTransition(tx);
  }
  function cancelTransition() {
    const tx = transition;
    if (!tx) return;
    tx.cancelled = true; tx.animation?.cancel();
    [...tx.waiters].forEach(wake => wake());
    transition = null;
    spare.style.opacity = '0'; spare.style.zIndex = '1';
    video.style.zIndex = '1';
    body.classList.remove('is-loop-transition');
  }
  function waitForOutgoingEnd(tx) {
    if (tx.outgoing.ended) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const clean = () => { tx.outgoing.removeEventListener('ended', done); tx.signal.removeEventListener('abort', abort); };
      const done = () => { clean(); resolve(); };
      const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
      if (tx.signal.aborted) { abort(); return; }
      tx.outgoing.addEventListener('ended', done, {once: true});
      tx.signal.addEventListener('abort', abort, {once: true});
    });
  }
  async function advanceLoop(userPaused = false) {
    if (!cycling() || phase !== 'playing' || transition || suspended()) return;
    const next = nextLoopIndex();
    if (next === null) { setPlaybackMode('freeze', false); return; }
    const seam = LOOP_SEAMS[LOOKS[current].id];
    const task = startOperation({keepPlaying: Boolean(seam)});
    phase = 'transition';
    const tx = transition = {...task, userPaused, waiters: new Set(), cancelled: false, animation: null,
      departing: Boolean(seam), outgoing: video, resuming: false};
    body.classList.remove('is-playing'); body.classList.add('is-loop-transition');
    readyControls(false); renderPlaybackMode();
    $('loading').hidden = true;
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const prepared = prepareNext(next);
      let incoming;
      if (seam) {
        // A decoded still is independent of next-video loading. A slow decoder
        // waits behind a clean scene, never behind a frozen piece of clothing.
        syncTransition();
        const cover = await prepareOpening(next);
        await waitForTransition(tx);
        if (task.id !== operation) return;
        tx.animation = cover.animate([{opacity: .001}, {opacity: 1}], {
          duration: reduced ? 100 : seam.fade * 1000,
          easing: 'cubic-bezier(.4,0,.25,1)', fill: 'forwards'
        });
        syncTransition();
        // The original clip still reaches its real end underneath the clean plate.
        const results = await Promise.all([prepared, tx.animation.finished, waitForOutgoingEnd(tx)]);
        incoming = results[0];
      } else {
        incoming = await prepared;
        await waitForTransition(tx);
        await delay(140);
        await waitForTransition(tx);
        if (task.id !== operation) return;
        incoming.style.zIndex = '2';
        tx.animation = incoming.animate([{opacity: 0}, {opacity: 1}], {
          duration: reduced ? 100 : 460, easing: 'cubic-bezier(.4,0,.25,1)', fill: 'forwards'
        });
        syncTransition();
        await tx.animation.finished;
      }
      await waitForTransition(tx);
      if (task.id !== operation) return;
      // The outgoing frame stays opaque below the incoming frame: no black dip.
      const outgoing = video, previous = current;
      stopWatcher();
      outgoing.pause();
      prefetch = null;
      video = incoming; spare = outgoing;
      spare.id = 'filmNext'; video.id = 'film';
      video.style.opacity = '1'; video.style.zIndex = '1'; video.classList.add('visible');
      spare.classList.remove('visible'); spare.style.opacity = '0'; spare.style.zIndex = '1'; spare.muted = true;
      tx.animation.cancel();
      video.style.opacity = ''; transition = null;
      current = next; loadedLook = next; phase = 'playing';
      video.muted = !prefs.sound; video.volume = prefs.volume / 100;
      $('still').src = `images/look-${LOOKS[next].id}.jpg`;
      $('still').alt = LOOKS[next].name + '穿搭推荐定格';
      document.querySelector('.ambient').style.backgroundImage = `url("images/look-${LOOKS[next].id}.jpg")`;
      // Playback updates the selection, never the page a person is browsing.
      updateCards();
      body.classList.remove('is-loop-transition'); body.classList.add('is-playing');
      icon($('playButton'), 'pause'); readyControls(false); renderPlaybackMode(); updateProgress(0); persist();
      // Automatic rounds never call toast/activity or wake an immersed interface.
      if (previous !== next) setStatus('HERE, WITH YOU.', LOOKS[next].silent ? '' : dialogue.enter(next, {allowAffection: false}));
      await playSafely(task.id);
    } catch (error) {
      if (task.id === operation && !tx.cancelled) loadFailure(current, error, task.id);
    }
  }


  function mediaEvent(event, signal, action, element = video) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener('error', fail); signal.removeEventListener('abort', abort); };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('media')); };
      const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      if (signal.aborted) return abort();
      element.addEventListener(event, done, { once: true });
      element.addEventListener('error', fail, { once: true });
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 22000);
      try { action(); } catch (error) { cleanup(); reject(error); }
    });
  }
  async function ensureLoaded(index, signal) {
    if (!isPlayable(index)) throw new Error('unavailable');
    if (loadedLook === index && video.readyState >= 2) return;
    loadedLook = -1;
    await mediaEvent('loadeddata', signal, () => {
      video.src = `media/look-${LOOKS[index].id}.webm`;
      video.load();
    });
    loadedLook = index;
    video.dataset.look = LOOKS[index].id;
  }
  async function seek(time, signal) {
    const target = clamp(time, 0, Math.max(0, video.duration - .045));
    if (Math.abs(video.currentTime - target) < .002 && !video.seeking) return;
    await mediaEvent('seeked', signal, () => { video.currentTime = target; });
  }
  async function playSafely(id) {
    if (suspended() || phase !== 'playing') return;
    try {
      if (cycling() && LOOP_SEAMS[LOOKS[current].id]) {
        const next = nextLoopIndex();
        if (next !== null) await prepareOpening(next);
        if (id !== operation || suspended() || phase !== 'playing') return;
      }
      await video.play();
      if (id !== operation) return;
      if (suspended() || phase !== 'playing') { video.pause(); return; }
      if (pendingEntry?.id === id) {
        const entry = pendingEntry;
        pendingEntry = null;
        const words = entry.event === 'quiet'
          ? null
          : entry.event === 'enter'
          ? dialogue.enter(entry.index, {allowAffection: entry.allowAffection})
          : line(entry.index, entry.event);
        if (words) setStatus('HERE, WITH YOU.', words);
      }
      renderPlaybackMode();
      watchFrames();
      primeLoop();
    } catch (error) {
      if (id !== operation || phase !== 'playing' || suspended()) return;
      // A mode/favorite change may replace only the pending opening while this
      // same playback is preparing. Await its replacement instead of stalling.
      if (error.name === 'AbortError') return playSafely(id);
      phase = 'paused';
      body.classList.remove('is-playing');
      renderTransport();
      setStatus('READY WHEN YOU ARE.', fixedLine('ready', '点一下播放，等你。'));
      if (error.name !== 'NotAllowedError') toast('播放暂时中断，点播放继续。', '播放提示');
    }
  }
  function loadFailure(index, error, id) {
    if (error.name === 'AbortError' || id !== operation) return;
    cancelTransition();
    releaseSpare();
    pendingEntry = null;
    dialogue.cancelPending();
    phase = 'error';
    video.pause(); video.classList.remove('visible');
    $('still').src = `images/look-${LOOKS[index].id}.jpg`;
    $('still').alt = LOOKS[index].name + '穿搭推荐定格';
    $('curtain').classList.remove('closed');
    $('loading').hidden = true;
    clearTimeout(loadingTimer);
    body.classList.remove('is-playing');
    setStatus('A LITTLE PAUSE.', '视频暂时无法播放，点击下方「重试」。');
    readyControls(false);
    toast('视频暂时无法播放，可以点「重试」或换一套。', '播放提示');
    activity(true);
  }
  async function selectLook(index, { restore = false, entry = 'enter', allowAffection = true, preserveRandom = false, quiet = false } = {}) {
    if (!isPlayable(index)) { lockedTap(index); return; }
    closeWelcome();
    closeModeMenu(false);
    if (!preserveRandom && (index !== current || (!restore && entry === 'enter'))) dialogue.cancelPending();
    cancelSpin();
    if (panel) closePanel(false);
    const task = startOperation();
    releaseSpare();
    current = index;
    const changedWardrobe = wardrobeFor(index) !== wardrobe;
    adoptWardrobe(index);
    if (cycling()) restore = false;
    if (changedWardrobe) renderCards(true);
    if (LOOKS[index].silent || changedWardrobe) {
      clearTimeout(toastTimer); $('toast').classList.remove('show');
      setStatus(wardrobe.english, LOOKS[index].silent ? '' : line(index, 'held'));
    }
    if (changedWardrobe && prefs.wardrobeModes[wardrobe.id] === 'favorites' && !activeFavorites().length) {
      toast('这个衣橱还没有偏爱，暂用定格模式。其他衣橱的播放方式已保留。', '播放方式');
    }
    if (page !== pageFor(index)) setPage(pageFor(index), false);
    phase = 'loading';
    readyControls(true);
    body.classList.remove('is-playing');
    updateCards(); persist();
    if (!quiet) activity(true);
    // Keep the current line during the short transition; speak once entry starts.
    clearTimeout(replyTimer);
    $('timelineState').textContent = '准备';
    $('curtain').classList.add('closed');
    loadingTimer = setTimeout(() => { if (task.id === operation) $('loading').hidden = false; }, 900);
    try {
      await delay(420);
      if (task.id !== operation) return;
      await ensureLoaded(index, task.signal);
      await seek(restore ? freezeTime() : 0, task.signal);
      if (task.id !== operation) return;
      video.classList.add('visible');
      $('still').src = `images/look-${LOOKS[index].id}.jpg`;
      $('still').alt = LOOKS[index].name + '穿搭推荐定格';
      document.querySelector('.ambient').style.backgroundImage = `url("images/look-${LOOKS[index].id}.jpg")`;
      await delay(40);
      if (task.id !== operation) return;
      $('curtain').classList.remove('closed');
      $('loading').hidden = true; clearTimeout(loadingTimer);
      readyControls(false);
      lastChange = Date.now();
      if (restore) { settle(); return; }
      phase = 'playing';
      body.classList.add('is-playing');
      renderTransport();
      pendingEntry = {id: task.id, index, event: quiet ? 'quiet' : entry, allowAffection};
      updateProgress(0);
      await playSafely(task.id);
    } catch (error) { loadFailure(index, error, task.id); }
  }
  function togglePlayback() {
    if (phase === 'transition' && transition) {
      transition.userPaused = !transition.userPaused;
      syncTransition(); renderPlaybackMode(); activity(true);
      return;
    }
    if (phase === 'loading' || phase === 'editing') return;
    unlockAudio();
    if (phase === 'playing') {
      phase = 'paused'; video.pause(); stopWatcher(); body.classList.remove('is-playing');
      icon($('playButton'), 'play'); $('playButton').setAttribute('aria-label', '继续播放入场');
      $('timelineState').textContent = '暂停'; setStatus('TAKE YOUR TIME.', line(current, 'pause'));
    } else if (phase === 'paused') {
      phase = 'playing'; body.classList.add('is-playing');
      icon($('playButton'), 'pause'); $('playButton').setAttribute('aria-label', '暂停入场');
      $('timelineState').textContent = '入场'; setStatus('HERE, WITH YOU.', line(current, 'resume'));
      if (cycling() && video.ended) advanceLoop(); else playSafely(operation);
    } else selectLook(current, { entry: 'replay' });
    renderTransport();
    activity(true);
  }
  function randomIndex() {
    const pool = randomPool();
    bag = bag.filter(i => pool.includes(i));
    if (!bag.length) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    if (bag[bag.length - 1] === current && pool.length > 1) {
      if (bag.length > 1) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      else { bag = []; return randomIndex(); }
    }
    return bag.pop();
  }
  async function randomLook() {
    if (spinning || panel) return;
    closeWelcome();
    unlockAudio();
    const pool = randomPool();
    if (pool.length === 1) {
      const selected = pool[0];
      const alreadySelected = selected === current;
      if (!alreadySelected) selectLook(selected, {quiet: true});
      lastChange = Date.now();
      toast(alreadySelected ? '本组只有这一套偏爱，已经在这里了。点亮其他穿搭的心，就能一起随机。' : '本组只有这一套偏爱，已为你选中。', '随机范围');
      activity(true);
      return;
    }
    spinning = true;
    const token = ++spinId;
    const selected = randomIndex();
    if (page !== pageFor(selected)) setPage(pageFor(selected), false);
    $('randomButton').disabled = true;
    $('randomText').textContent = '心动挑选中';
    body.classList.add('is-spinning'); activity(true); syncTransition();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rounds = reduced ? 1 : 12;
    for (let step = 0; step < rounds; step++) {
      if (token !== spinId) return;
      const visiblePool = CHAPTERS[page].looks.filter(i => pool.includes(i));
      const highlight = step === rounds - 1 ? selected : visiblePool[step % visiblePool.length];
      document.querySelectorAll('.look-card').forEach(card => card.classList.toggle('rolling', Number(card.dataset.look) === highlight));
      chime(420 + step * 30, .045);
      await delay(reduced ? 30 : 45 + step * 10);
    }
    if (token !== spinId) return;
    chime(880, .3);
    dialogue.cancelPending();
    const response = LOOKS[selected].silent ? {text: '', rare: false} : dialogue.reply(selected, 'random');
    toast(response.text, '她说 · ' + LOOKS[selected].short);
    selectLook(selected, {allowAffection: !response.rare, preserveRandom: true});
  }

  function closePanel(restoreFocus = true) {
    closeReset(false);
    setHelpView(false);
    $('settingsPanel').hidden = true; $('momentPanel').hidden = true;
    $('settingsButton').setAttribute('aria-expanded', 'false');
    body.classList.remove('has-panel'); panel = null;
    if (restoreFocus) panelReturnFocus?.focus({ preventScroll: true });
    panelReturnFocus = null;
    syncTransition();
    activity(true);
  }
  function showPanel(name, trigger) {
    closeWelcome();
    closeModeMenu(false);
    body.classList.remove('is-idle', 'is-immersed');
    closePanel(false);
    panel = name; panelReturnFocus = trigger;
    body.classList.add('has-panel');
    $(name + 'Panel').hidden = false;
    clearTimeout(idleTimer);
    syncTransition();
  }
  let settingsScrollBeforeHelp = 0;
  function setHelpView(open) {
    const wasOpen = !$('helpBody').hidden;
    if (open && !wasOpen) settingsScrollBeforeHelp = $('settingsBody').scrollTop;
    $('settingsBody').hidden = open;
    $('helpBody').hidden = !open;
    $('settingsEyebrow').hidden = open;
    $('openHelp').hidden = open;
    $('backToSettings').hidden = !open;
    $('openHelp').setAttribute('aria-expanded', String(open));
    $('settingsPanel').classList.toggle('is-help-view', open);
    $('settingsPanel').setAttribute('aria-label', open ? '使用方法' : '氛围设置');
    $('closeSettings').setAttribute('aria-label', open ? '关闭使用方法' : '关闭设置');
    if (!open && wasOpen) $('settingsBody').scrollTop = settingsScrollBeforeHelp;
  }
  function openHelp() {
    if (phase === 'editing') return;
    if (panel !== 'settings') {
      cancelSpin();
      // The first-use link disappears on entry; return focus to a stable control.
      showPanel('settings', $('settingsButton'));
      $('settingsButton').setAttribute('aria-expanded', 'true');
    }
    closeWelcome();
    closeReset(false);
    window.dispatchEvent(new Event('purple:help-open'));
    setHelpView(true);
    $('helpBody').scrollTop = 0;
    $('helpTitle').focus({preventScroll: true});
    activity(true);
  }
  $('openHelp').addEventListener('click', openHelp);
  $('firstUseHelp').addEventListener('click', openHelp);
  $('backToSettings').addEventListener('click', () => {
    setHelpView(false);
    $('openHelp').focus({preventScroll: true});
  });

  async function openMoment() {
    if (phase === 'loading' || phase === 'editing') return;
    cancelSpin();
    editorOriginal = { time: loadedLook === current && video.classList.contains('visible') ? video.currentTime : freezeTime(), phase, status: {...baseStatus} };
    const task = startOperation();
    phase = 'editing'; body.classList.remove('is-playing');
    showPanel('moment', $('momentButton'));
    readyControls(true); $('momentRange').disabled = true; $('saveMoment').disabled = true;
    $('momentLook').textContent = LOOKS[current].name;
    const words = line(current, 'edit');
    setStatus('FIND YOUR MOMENT.', words);
    $('momentHint').textContent = words || '拖动时间轴挑选画面；取消会回到之前的播放状态。';
    try {
      await ensureLoaded(current, task.signal);
      await seek(editorOriginal.time, task.signal);
      if (task.id !== operation || panel !== 'moment') return;
      video.classList.add('visible');
      $('momentRange').max = video.duration - .05;
      $('momentDuration').textContent = ' / ' + video.duration.toFixed(2) + ' s';
      $('momentRange').value = video.currentTime;
      $('momentTime').textContent = video.currentTime.toFixed(2);
      $('momentRange').disabled = false; $('saveMoment').disabled = false;
      $('momentRange').focus({ preventScroll: true });
    } catch (error) { if (task.id === operation && error.name !== 'AbortError') { closePanel(); loadFailure(current, error, task.id); } }
  }
  function previewTime(value) {
    if (phase !== 'editing' || loadedLook !== current || $('momentRange').disabled) return;
    const t = clamp(Number(value), .1, Number($('momentRange').max));
    video.currentTime = t;
    $('momentRange').value = t;
    $('momentTime').textContent = t.toFixed(2);
    updateProgress(t);
  }
  async function cancelMoment() {
    if (panel !== 'moment') return;
    const original = editorOriginal;
    const task = startOperation();
    closePanel();
    try {
      await ensureLoaded(current, task.signal);
      await seek(original?.time ?? freezeTime(), task.signal);
      if (task.id !== operation) return;
      video.classList.add('visible');
      if (original?.phase === 'held' || original?.phase === 'error') settle();
      else if (original?.phase === 'playing') {
        phase = 'playing'; body.classList.add('is-playing');
        setStatus(original.status.label, original.status.text);
        icon($('playButton'), 'pause');
        $('playButton').setAttribute('aria-label', '暂停入场');
        $('timelineState').textContent = '入场';
        readyControls(false); updateProgress(video.currentTime); renderPlaybackMode();
        await playSafely(task.id);
        if (task.id !== operation) return;
      } else {
        phase = 'paused'; icon($('playButton'), 'play');
        $('playButton').setAttribute('aria-label', '继续播放入场');
        $('timelineState').textContent = '暂停'; setStatus('TAKE YOUR TIME.', line(current, 'pause'));
        readyControls(false); updateProgress(video.currentTime); renderPlaybackMode();
      }
      respond(current, 'cancel', 'TAKE YOUR TIME.', false);
    } catch (error) { loadFailure(current, error, task.id); }
  }
  function saveMoment() {
    if (phase !== 'editing' || $('saveMoment').disabled) return;
    prefs.freezes[current] = Number($('momentRange').value);
    prefs.playbackMode = 'freeze'; releaseSpare(); renderPlaybackMode();
    prefs.wardrobeModes[wardrobe.id] = 'freeze';
    persist(); closePanel(); settle(); lastChange = Date.now();
    respond(current, 'saved', 'YOUR MOMENT, KEPT.');
    chime(784, .22);
  }
  function onSuspend() {
    body.classList.toggle('is-system-paused', suspended());
    if (suspended()) { decks.forEach(deck => deck.pause()); stopWatcher(); clearTimeout(idleTimer); audioContext?.suspend().catch(() => {}); }
    else { lastChange = Date.now(); if (phase === 'playing') { if (cycling() && video.ended) advanceLoop(); else playSafely(operation); } activity(true); }
    syncTransition();
  }

  window.wallpaperPropertyListener = {
    setPaused(isPaused) { systemPaused = Boolean(isPaused); onSuspend(); },
    applyUserProperties(properties) {
      const changed = key => {
        if (!properties[key]) return false;
        const value = properties[key].value;
        const known = Object.prototype.hasOwnProperty.call(prefs.nativeValues, key);
        if (known && prefs.nativeValues[key] === value) return false;
        prefs.nativeValues[key] = value;
        // A reset before the host's first callback also needs a baseline. Later
        // intentional edits of known properties continue to work normally.
        return known || !prefs.nativeValues.__resetBaseline;
      };
      if (changed('sound')) prefs.sound = Boolean(properties.sound.value);
      if (changed('volume')) prefs.volume = number(properties.volume.value, prefs.volume, 0, 100);
      if (changed('brightness')) prefs.brightness = number(properties.brightness.value, prefs.brightness, 65, 115);
      if (changed('autohide')) prefs.autoHide = Boolean(properties.autohide.value);
      if (changed('fit')) prefs.fit = properties.fit.value === 'cover' ? 'cover' : 'contain';
      if (changed('autoswitch')) prefs.interval = [0,5,15,30].includes(Number(properties.autoswitch.value)) ? Number(properties.autoswitch.value) : 0;
      const lookChanged = changed('look');
      if (['sound', 'volume', 'brightness', 'autohide', 'fit', 'autoswitch', 'look'].every(key => Object.prototype.hasOwnProperty.call(prefs.nativeValues, key))) {
        delete prefs.nativeValues.__resetBaseline;
      }
      applyPrefs(); persist();
      if (lookChanged) {
        const index = LOOKS.findIndex((look, index) => Number(look.hostValue ?? index + 1) === Number(properties.look.value));
        if (isPlayable(index)) selectLook(index, {restore: true});
      }
    }
  };
  function closeReset(restoreFocus = true) {
    if ($('resetConfirm').hidden) return;
    $('resetConfirm').hidden = true;
    $('resetSettingsButton').setAttribute('aria-expanded', 'false');
    $('resetFeedback').hidden = true;
    if (restoreFocus) $('resetSettingsButton').focus({preventScroll: true});
  }
  $('resetSettingsButton').addEventListener('click', () => {
    if (!$('resetConfirm').hidden) { closeReset(); return; }
    // Finish an unsaved position preview before showing a separate confirmation.
    window.dispatchEvent(new Event('purple:reset-prompt'));
    $('resetFeedback').hidden = true;
    $('resetConfirm').hidden = false;
    $('resetSettingsButton').setAttribute('aria-expanded', 'true');
    $('cancelReset').focus({preventScroll: true});
    $('resetConfirm').scrollIntoView({block: 'nearest'});
  });
  $('cancelReset').addEventListener('click', () => closeReset());
  $('confirmReset').addEventListener('click', () => {
    if (panel !== 'settings' || $('resetConfirm').hidden) return;
    const next = {...defaults, favorites: [], freezes: [...defaults.freezes], wardrobeLooks: {...defaults.wardrobeLooks}, wardrobeModes: {...defaults.wardrobeModes}, wardrobeRandomScopes: {...defaults.wardrobeRandomScopes},
      // Host synchronization metadata is not a user preference. Retain the last
      // observed values so a repeated host callback cannot undo the reset.
      nativeValues: {...prefs.nativeValues, __resetBaseline: true}};
    const updates = [[KEY, next], [KEY + '.reading-v1', {size: 'standard'}], [KEY + '.layout-v1', {offsetRatio: 0}]];
    const originals = [], written = [];
    try {
      for (const [key] of updates) originals.push([key, localStorage.getItem(key)]);
      for (const [key, value] of updates) {
        localStorage.setItem(key, JSON.stringify(value)); written.push(key);
      }
    } catch (_) {
      for (const [key, value] of originals) {
        if (!written.includes(key)) continue;
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {}
      }
      $('resetFeedback').textContent = '暂时无法保存重置结果，请稍后重试。';
      $('resetFeedback').hidden = false;
      return;
    }
    // Cancel every pending playback/spin task before it can persist old choices.
    startOperation(); phase = 'held'; cancelSpin(); releaseSpare();
    video.classList.remove('visible'); video.style.opacity = '';
    video.removeAttribute('src'); video.removeAttribute('data-look'); video.load();
    audioContext?.suspend().catch(() => {});
    loadedLook = -1;
    clearTimeout(replyTimer); clearTimeout(toastTimer); clearTimeout(idleTimer);
    $('toast').classList.remove('show'); $('loading').hidden = true;
    $('curtain').classList.remove('closed');
    body.classList.remove('is-playing', 'is-immersed', 'is-idle');
    Object.assign(prefs, next); current = defaults.current; page = pageFor(current);
    bag = []; editorOriginal = null; privateVisits = 0; lastPrivateReply = lastPrivateAside = -Infinity;
    dialogue = window.createPurpleDialogue({looks: LOOKS, replies: REPLIES, affection: window.PURPLE_AFFECTION, wardrobes: WARDROBE_DIALOGUES, isPlayable});
    lastChange = Date.now();
    closeModeMenu(false); closePanel();
    // These modules update their in-memory state without writing additional keys.
    window.dispatchEvent(new Event('purple:reset-settings'));
    showRememberedStill();
    $('timelineState').textContent = '定格'; icon($('playButton'), 'repeat');
    $('playButton').title = '再看一次入场'; $('playButton').setAttribute('aria-label', '再看一次入场');
    readyControls(false);
    showWelcome('已恢复初始状态');
  });


  $('looks').addEventListener('click', event => {
    const select = event.target.closest('[data-select]');
    if (select) { unlockAudio(); chime(523, .08); selectLook(Number(select.dataset.select)); return; }
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const i = Number(favorite.dataset.favorite);
      if (!isPlayable(i)) return;
      const exists = prefs.favorites.includes(i);
      prefs.favorites = exists ? prefs.favorites.filter(x => x !== i) : [...prefs.favorites, i];
      if (!activeFavorites().length) prefs.wardrobeRandomScopes[wardrobe.id] = 'all';
      bag = []; cancelSpin(); updateCards(); persist(); activity(true);
      const emptied = prefs.playbackMode === 'favorites' && !activeFavorites().length;
      if (emptied) setPlaybackMode('freeze', false);
      else if (phase === 'transition' && prefs.playbackMode === 'favorites') {
        const paused = transition?.userPaused;
        startOperation(); phase = 'playing'; advanceLoop(paused);
      } else primeLoop();
      respond(i, exists ? 'unfavorite' : 'favorite', 'A LITTLE PREFERENCE.');
      if (emptied) toast('本组已没有偏爱，已回到定格模式。', '播放方式');
    }
  });
  $('wardrobeTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-wardrobe]');
    if (button) { unlockAudio(); chime(587, .1); selectWardrobe(button.dataset.wardrobe); }
  });
  $('prevPage').addEventListener('click', () => setPage(page - 1));
  $('nextPage').addEventListener('click', () => setPage(page + 1));
  $('showCurrent').addEventListener('click', () => setPage(pageFor(current)));
  $('pageTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) setPage(Number(button.dataset.page));
  });
  $('randomButton').addEventListener('click', randomLook);
  $('randomOptions').addEventListener('click', event => {
    const button = event.target.closest('[data-random-scope]');
    if (!button || button.disabled) return;
    const scope = button.dataset.randomScope;
    if (prefs.wardrobeRandomScopes[wardrobe.id] === scope) return;
    prefs.wardrobeRandomScopes[wardrobe.id] = scope;
    bag = []; cancelSpin(); persist(); activity(true);
  });
  $('closeFirstUse').addEventListener('click', () => { closeWelcome(); $('modeButton').focus({preventScroll: true}); });
  $('playButton').addEventListener('click', togglePlayback);
  $('modeButton').addEventListener('click', () => modeOpen ? closeModeMenu() : openModeMenu());
  $('modeMenu').addEventListener('click', event => {
    const option = event.target.closest('[data-playback]');
    if (!option || option.getAttribute('aria-disabled') === 'true') return;
    setPlaybackMode(option.dataset.playback);
  });
  document.addEventListener('pointerdown', event => {
    if (modeOpen && !event.target.closest('.playback-mode')) closeModeMenu(false);
  });
  document.addEventListener('focusin', event => {
    if (modeOpen && !event.target.closest('.playback-mode')) closeModeMenu(false);
  });
  $('modeMenu').addEventListener('keydown', event => {
    const options = [...$('modeMenu').querySelectorAll('[data-playback]')].filter(option => option.getAttribute('aria-disabled') !== 'true');
    const index = options.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus({preventScroll: true});
    }
  });
  $('momentButton').addEventListener('click', openMoment);
  $('cancelMoment').addEventListener('click', cancelMoment);
  $('saveMoment').addEventListener('click', saveMoment);
  $('momentRange').addEventListener('input', event => previewTime(event.target.value));
  $('prevFrame').addEventListener('click', () => previewTime(Number($('momentRange').value) - 1 / LOOKS[current].fps));
  $('nextFrame').addEventListener('click', () => previewTime(Number($('momentRange').value) + 1 / LOOKS[current].fps));
  $('resetMoment').addEventListener('click', () => { previewTime(LOOKS[current].freeze); respond(current, 'reset', 'FIND YOUR MOMENT.'); });
  $('settingsButton').addEventListener('click', () => {
    if (panel === 'settings') { closePanel(); return; }
    if (phase === 'editing') return;
    cancelSpin(); showPanel('settings', $('settingsButton'));
    $('settingsButton').setAttribute('aria-expanded', 'true'); $('closeSettings').focus({ preventScroll: true });
  });
  $('closeSettings').addEventListener('click', () => closePanel());
  $('brightness').addEventListener('input', event => { prefs.brightness = Number(event.target.value); applyPrefs(); persist(); });
  $('volume').addEventListener('input', event => { prefs.volume = Number(event.target.value); applyPrefs(); persist(); });
  $('idleToggle').addEventListener('change', event => { prefs.autoHide = event.target.checked; applyPrefs(); persist(); });
  // HTML buttons keep settings inside the web renderer across wallpaper hosts.
  $('fitOptions').addEventListener('click', event => {
    const button = event.target.closest('[data-fit]');
    if (!button) return;
    prefs.fit = button.dataset.fit; applyPrefs(); persist();
  });
  $('autoOptions').addEventListener('click', event => {
    if (cycling()) return;
    const button = event.target.closest('[data-interval]');
    if (!button) return;
    prefs.interval = Number(button.dataset.interval); lastChange = Date.now(); applyPrefs(); persist();
  });
  function setSound(enabled) {
    prefs.sound = enabled; applyPrefs(); persist(); unlockAudio(); chime(660, .17);
    toast(prefs.sound ? (prefs.volume ? '声音已开启。' : '声音已开启，当前音量为 0。') : '声音已关闭。', '声音设置');
  }
  $('soundButton').addEventListener('click', () => setSound(!prefs.sound));
  $('soundToggle').addEventListener('change', event => setSound(event.target.checked));
  $('immerseButton').addEventListener('click', async () => { closeWelcome(); cancelSpin(); if (panel === 'moment') await cancelMoment(); else if (panel) closePanel(false); body.classList.add('is-immersed'); document.activeElement.blur(); });
  const wake = () => {
    const hidden = body.classList.contains('is-immersed') || body.classList.contains('is-idle');
    body.classList.remove('is-immersed', 'is-idle'); activity(true);
    if (hidden && phase === 'held') respond(current, 'wake', 'HERE, WITH YOU.', false);
  };
  $('wakeButton').addEventListener('click', wake);
  $('brand').addEventListener('click', event => { event.preventDefault(); wake(); });
  document.addEventListener('pointermove', () => activity());
  document.addEventListener('pointerdown', () => { unlockAudio(); activity(true); });
  document.addEventListener('focusin', () => activity(true));
  document.addEventListener('visibilitychange', () => { documentPaused = document.hidden; onSuspend(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!$('resetConfirm').hidden) closeReset(); else if (modeOpen) closeModeMenu(); else if (panel === 'moment') cancelMoment(); else if (panel) closePanel(); else if (!$('firstUseHint').hidden) closeWelcome(); else wake(); return; }
    // Mouse controls cover every function. These are only browser-preview conveniences.
    if (event.target.matches('input,select,textarea,button,a') || panel || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[1-9]$/.test(event.key) && activeOrder()[Number(event.key) - 1] !== undefined) selectLook(activeOrder()[Number(event.key) - 1]);
    else if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    else if (event.key.toLowerCase() === 'r') randomLook();
    else if (event.key.toLowerCase() === 'h') body.classList.toggle('is-immersed');
    activity(true);
  });
  for (const deck of decks) {
    // Host media-resume calls must never start the prepared, invisible deck.
    const nativePlay = deck.play.bind(deck);
    deck.play = function () {
      if (!deckMayPlay(deck)) return Promise.resolve();
      return nativePlay();
    };
    deck.addEventListener('play', () => { if (!deckMayPlay(deck)) deck.pause(); });
    deck.addEventListener('ended', () => {
      if (deck !== video) return;
      // The departure owns its full animation; ended only releases its media
      // wait. Forcing finish here would turn a delayed start into a hard cut.
      if (phase === 'playing') cycling() ? advanceLoop() : settle();
    });
    deck.addEventListener('timeupdate', () => {
      if (deck !== video || phase !== 'playing') return;
      if (!maybeBeginDeparture(video.currentTime) && !cycling() && video.currentTime >= freezeTime()) settle();
    });
    deck.addEventListener('waiting', () => { if (deck === video && phase === 'playing' && !suspended()) { clearTimeout(loadingTimer); loadingTimer = setTimeout(() => { if (phase === 'playing' && video.readyState < 3) $('loading').hidden = false; }, 900); } });
    deck.addEventListener('playing', () => { if (deck === video) { clearTimeout(loadingTimer); $('loading').hidden = true; } });
    deck.addEventListener('error', () => { if (deck === video && ['playing', 'paused', 'transition'].includes(phase)) loadFailure(current, new Error('decode'), operation); });
  }

  function updateClock() {
    const date = new Date();
    $('clock').textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  updateClock();
  setInterval(() => {
    if (suspended()) return;
    updateClock();
    if (!cycling() && prefs.interval && !panel && !modeOpen && !spinning && phase === 'held' && Date.now() - lastChange >= prefs.interval * 60000) randomLook();
  }, 15000);
  function showRememberedStill() {
    adoptWardrobe(current);
    $('still').src = `images/look-${LOOKS[current].id}.jpg`;
    $('still').alt = LOOKS[current].name + '穿搭推荐定格';
    document.querySelector('.ambient').style.backgroundImage = `url("images/look-${LOOKS[current].id}.jpg")`;
    renderCards(); updateProgress(freezeTime()); applyPrefs();
    setStatus('MOMENT, KEPT.', line(current, 'held'));
  }
  // Commit normalized/migrated records even when the initial still needs no video load.
  persist();
  showRememberedStill();
  if (!prefs.welcomeSeen) showWelcome();
  if (cycling()) {
    const index = prefs.playbackMode === 'favorites' && !prefs.favorites.includes(current) ? favoriteOrder()[0] : current;
    selectLook(index, {quiet: true});
  } else if (Math.abs(freezeTime() - LOOKS[current].freeze) > .008) selectLook(current, { restore: true });
})();

/* Self-contained optional layout feature; no writes to wardrobe/playback preferences. */
(() => {
  'use strict';
  const KEY = 'frac-hinata.safe.we.wardrobe-v1.layout-v1';
  const $ = id => document.getElementById(id);
  const root = document.documentElement, body = document.body;
  const wardrobe = document.querySelector('.wardrobe');
  const status = document.querySelector('.now-playing');
  const range = $('layoutRange'), settings = $('settingsPanel');
  const guide = document.createElement('div');
  guide.className = 'layout-guide'; guide.hidden = true;
  guide.setAttribute('aria-hidden', 'true');
  guide.innerHTML = '<span>左侧界面对齐线</span>';
  body.append(guide);
  let savedRatio = 0, draftRatio = 0, offset = 0, editing = false, resizeFrame = 0;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}').offsetRatio;
    if (Number.isFinite(value)) savedRatio = Math.max(-.25, Math.min(.25, value));
  } catch (_) {}
  const label = pixels => Math.abs(pixels) < 1 ? '默认位置' : `${pixels > 0 ? '右移' : '左移'} ${Math.abs(pixels)} px`;
  function bounds() {
    const width = root.clientWidth;
    const card = wardrobe.getBoundingClientRect();
    const brand = $('brand').getBoundingClientRect();
    const topRight = document.querySelector('.top-right').getBoundingClientRect();
    const playback = document.querySelector('.playback').getBoundingClientRect();
    const bottom = status.getBoundingClientRect();
    const baseLeft = card.left - offset, baseRight = card.right - offset;
    // A modest horizontal allowance keeps the column in the existing left composition.
    let max = Math.min(width * .12, Math.max(0, width * .52 - baseRight), topRight.left - (brand.right - offset) - 24);
    if (bottom.width) {
      const textWidth = Math.min(bottom.width, 15 + parseFloat(getComputedStyle(status.querySelector('p')).maxWidth));
      max = Math.min(max, playback.left - (bottom.left - offset + textWidth) - 24);
    }
    return {min:Math.min(0, Math.ceil(16 - baseLeft)), max:Math.max(0, Math.floor(max))};
  }
  function render() {
    const {min, max} = bounds();
    const requested = Math.round((editing ? draftRatio : savedRatio) * root.clientWidth);
    offset = Math.max(min, Math.min(max, requested));
    root.style.setProperty('--left-offset', offset + 'px');
    range.min = min; range.max = max; range.value = offset;
    range.disabled = min === max;
    range.setAttribute('aria-valuetext', label(offset));
    $('layoutValue').textContent = label(offset);
    $('layoutSummary').textContent = label(offset) + ' · 左侧整列一起移动';
    $('layoutLeft').disabled = offset <= min;
    $('layoutRight').disabled = offset >= max;
    $('layoutNote').textContent = max - min < 40
      ? '当前屏幕的留白较窄，可移动范围已收拢。'
      : '为桌面图标留一点空位，人物和播放控件留在原处。';
  }
  function finish(save, focus = true) {
    if (!editing) return;
    if (save) {
      savedRatio = offset / root.clientWidth;
      try { localStorage.setItem(KEY, JSON.stringify({offsetRatio:savedRatio})); } catch (_) {}
    }
    editing = false;
    $('layoutControls').hidden = true;
    $('layoutButton').setAttribute('aria-expanded', 'false');
    guide.hidden = true; body.classList.remove('is-layout-adjusting');
    render();
    if (focus && !settings.hidden) $('layoutButton').focus({preventScroll:true});
  }
  function preview(pixels) {
    if (!editing) return;
    draftRatio = pixels / root.clientWidth;
    render();
  }
  $('layoutButton').addEventListener('click', () => {
    if (editing) { finish(false); return; }
    editing = true; draftRatio = savedRatio;
    $('layoutControls').hidden = false;
    $('layoutButton').setAttribute('aria-expanded', 'true');
    guide.hidden = false; body.classList.add('is-layout-adjusting');
    render();
    range.focus({preventScroll:true});
    $('layoutControls').scrollIntoView({block:'nearest', behavior:'instant'});
  });
  range.addEventListener('input', () => preview(Number(range.value)));
  $('layoutLeft').addEventListener('click', () => preview(offset - 8));
  $('layoutRight').addEventListener('click', () => preview(offset + 8));
  $('layoutReset').addEventListener('click', () => preview(0));
  $('layoutCancel').addEventListener('click', () => finish(false));
  $('layoutDone').addEventListener('click', () => finish(true));
  settings.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); finish(false);
    }
  });
  new MutationObserver(() => { if (settings.hidden) finish(false, false); }).observe(settings, {attributes:true, attributeFilter:['hidden']});
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  });
  window.addEventListener('purple:typography-change', render);
  window.addEventListener('purple:reset-prompt', () => finish(false, false));
  window.addEventListener('purple:help-open', () => finish(false, false));
  window.addEventListener('purple:reset-settings', () => {
    savedRatio = draftRatio = 0;
    finish(false, false); render();
  });
  render();
})();

/* Typography preferences are independent of media, favorites and layout position. */
(() => {
  'use strict';
  const KEY = 'frac-hinata.safe.we.wardrobe-v1.reading-v1';
  const body = document.body, wardrobe = document.querySelector('.wardrobe');
  const footer = document.querySelector('.bottom-bar');
  const status = document.querySelector('.now-playing'), credit = document.querySelector('.credit');
  const statusContent = status.querySelector('div'), statusText = status.querySelector('p');
  const immersion = document.querySelector('#immerseButton span');
  const wake = document.getElementById('wakeButton'), wakeText = wake.querySelector('span:not(.wake-line)');
  const root = document.documentElement;
  const choices = ['standard', 'comfortable', 'larger', 'large'];
  let size = 'standard', frame = 0;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}').size;
    if (choices.includes(value)) size = value;
  } catch (_) {}
  function setLength(name, value) {
    const previous = parseFloat(root.style.getPropertyValue(name));
    if (!Number.isFinite(previous) || Math.abs(previous - value) > .05) root.style.setProperty(name, value + 'px');
  }
  function alignFooter() {
    if (getComputedStyle(status).display !== 'none') {
      // Keep the footer's original single-line geometry. Longer dialogue can grow
      // upward inside its own slot without lifting the playback/immersion controls.
      const lineHeight = parseFloat(getComputedStyle(statusText).lineHeight);
      setLength('--companion-height', statusContent.getBoundingClientRect().height - statusText.getBoundingClientRect().height + lineHeight);
    }
    const textRect = element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const textBottom = element => textRect(element).bottom;
    // Match the real immersion control across font sizes and wrapped footers.
    // Its parent may be mid-hide; remove that animation's translation first.
    const footerShift = footer.getBoundingClientRect().bottom - (innerHeight - parseFloat(getComputedStyle(footer).bottom));
    const button = immersion.closest('button'), box = button.getBoundingClientRect(), style = getComputedStyle(button);
    setLength('--wake-right', innerWidth - box.right);
    setLength('--wake-bottom', innerHeight - box.bottom + footerShift);
    setLength('--wake-font-size', parseFloat(style.fontSize));
    setLength('--wake-letter-spacing', parseFloat(style.letterSpacing) || 0);
    wake.classList.remove('is-edge-tight');
    if (getComputedStyle(immersion).display !== 'none') {
      // Align the final two characters with the immersion label.
      // Keep the optional trailing arrow inside the viewport at large text sizes.
      const textRight = immersion.getBoundingClientRect().right;
      const trailingWidth = () => wake.getBoundingClientRect().right - wakeText.getBoundingClientRect().right;
      if (textRight + trailingWidth() > innerWidth - 8) wake.classList.add('is-edge-tight');
      setLength('--wake-right', innerWidth - textRight - trailingWidth());
      setLength('--wake-bottom', innerHeight - textBottom(immersion) + footerShift + textBottom(wakeText) - wake.getBoundingClientRect().bottom);
    }
    // Anchor the credit under the right-hand label, independently of the left column.
    // Narrow layouts hide that label; use the remaining button as the anchor there.
    const anchor = getComputedStyle(immersion).display === 'none' ? box : textRect(immersion);
    const target = anchor.bottom - footerShift;
    const creditBox = credit.getBoundingClientRect(), creditText = textRect(credit);
    const gap = Math.max(12, parseFloat(getComputedStyle(credit).fontSize) * 4 / 3);
    const creditBottom = parseFloat(getComputedStyle(credit).bottom);
    setLength('--creator-right', innerWidth - anchor.right - (creditBox.right - creditText.right));
    setLength('--creator-bottom', creditBottom + creditText.top - target - gap);
    if (getComputedStyle(status).display === 'none') {
      root.style.removeProperty('--companion-top');
      return;
    }
    // Align the last dialogue line with immersion without moving the footer controls.
    const currentTop = parseFloat(getComputedStyle(status).top) || 0;
    const naturalBottom = textBottom(statusText) - footerShift - currentTop;
    setLength('--companion-top', target - naturalBottom);
  }
  function fitWardrobe() {
    alignFooter();
    wardrobe.style.removeProperty('top'); wardrobe.style.removeProperty('bottom');
    wardrobe.style.removeProperty('max-height'); wardrobe.classList.remove('is-reading-constrained', 'is-wardrobe-compact');
    let box = wardrobe.getBoundingClientRect();
    const top = document.querySelector('.topbar').getBoundingClientRect().bottom + 24;
    const footerShift = footer.getBoundingClientRect().bottom - (innerHeight - parseFloat(getComputedStyle(footer).bottom));
    // Reserve two dialogue lines even for a short sentence, so changing wardrobes
    // or replies cannot toggle the wardrobe's position/compact layout. Longer
    // content still receives enough space instead of being clipped.
    const spareLine = Math.max(0, 2 * parseFloat(getComputedStyle(statusText).lineHeight) - statusText.getBoundingClientRect().height);
    const footerTop = (getComputedStyle(status).display === 'none' ? footer.getBoundingClientRect().top : statusContent.getBoundingClientRect().top - spareLine) - footerShift;
    const bottom = footerTop - 28;
    if (box.height > bottom - top) {
      wardrobe.classList.add('is-wardrobe-compact');
      box = wardrobe.getBoundingClientRect();
    }
    if (box.top < top || box.bottom > bottom) {
      const y = Math.max(top, Math.min(box.top, bottom - box.height));
      wardrobe.style.top = (y - parseFloat(getComputedStyle(wardrobe).marginTop)) + 'px'; wardrobe.style.bottom = 'auto';
      if (box.height > bottom - y) {
        wardrobe.style.maxHeight = Math.max(100, bottom - y) + 'px';
        wardrobe.classList.add('is-reading-constrained');
      }
    }
    if (!wardrobe.classList.contains('is-reading-constrained')) wardrobe.scrollTop = 0;
  }
  function scheduleFit() { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitWardrobe); }
  function apply() {
    body.dataset.textSize = size;
    const screenRatio = Math.min(innerWidth / 2560, innerHeight / 1440);
    const landscape = innerWidth / innerHeight >= 4 / 3;
    const compact = landscape && innerHeight > 850 ? Math.max(0, Math.min(1, (1 - screenRatio) / .25)) : 0;
    const highResolution = landscape ? Math.max(0, Math.min(1, (screenRatio - 1) / .5)) : 0;
    wardrobe.style.setProperty('--wardrobe-composition-scale', 1 - .05 * compact + .08 * highResolution);
    wardrobe.style.setProperty('--wardrobe-lift', (18 * compact) + 'px');
    // QHD cover/name proportion, plus the final approved 10% increase at 4K.
    wardrobe.style.setProperty('--wardrobe-name-factor', 1 - (1 - 1.15 * 1.1 / 1.8) * highResolution);
    const beyondQHD = Math.min(innerWidth / 2560, innerHeight / 1440) > 1;
    body.classList.toggle('is-reading-gentle', size === 'comfortable' || (size === 'standard' && beyondQHD));
    body.classList.toggle('is-reading-enlarged', size === 'larger' || size === 'large');
    document.querySelectorAll('[data-text-size]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.textSize === size));
    });
    scheduleFit();
    window.dispatchEvent(new Event('purple:typography-change'));
  }
  document.getElementById('textSizeOptions').addEventListener('click', event => {
    const button = event.target.closest('[data-text-size]');
    if (!button || !choices.includes(button.dataset.textSize)) return;
    size = button.dataset.textSize;
    try { localStorage.setItem(KEY, JSON.stringify({size})); } catch (_) {}
    apply();
    button.scrollIntoView({block:'nearest', behavior:'instant'});
  });
  window.addEventListener('resize', apply);
  window.addEventListener('purple:reset-settings', () => { size = 'standard'; apply(); });
  const observer = new ResizeObserver(scheduleFit);
  [wardrobe, status, statusContent, credit, footer, document.querySelector('.topbar')].forEach(element => observer.observe(element));
  document.fonts.ready.then(scheduleFit);
  apply();
})();
