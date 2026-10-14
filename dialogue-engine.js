/* Safe dialogue selection; wardrobe-specific replies do not change the normal edition. */
'use strict';
(() => {
  window.createPurpleDialogue = ({looks, replies, affection, wardrobes = {}, isPlayable, now = () => performance.now(), random = Math.random}) => {
    const bags = new Map(), arrivals = new Map(), scenes = new Map(), visits = new Map();
    let lastAffection = -Infinity, pending = null;

    function bagFor(key, values) {
      let state = bags.get(key);
      if (!state) { state = {remaining: [], last: -1}; bags.set(key, state); }
      if (!state.remaining.length) {
        state.remaining = values.map((_, index) => index);
        for (let index = state.remaining.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [state.remaining[index], state.remaining[other]] = [state.remaining[other], state.remaining[index]];
        }
        const tail = state.remaining.length - 1;
        if (tail > 0 && state.remaining[tail] === state.last) {
          [state.remaining[0], state.remaining[tail]] = [state.remaining[tail], state.remaining[0]];
        }
      }
      return state;
    }
    function draw(key, values) {
      const state = bagFor(key, values);
      state.last = state.remaining.pop();
      return values[state.last];
    }
    function reserve(key, values, kind = 'reply') {
      if (!values?.length) return null;
      const count = (visits.get(key) || 0) + 1;
      visits.set(key, count);
      if (count < 4 || pending || now() - lastAffection < 90000) return null;
      const state = bagFor('affection:' + key, values);
      const value = values[state.remaining[state.remaining.length - 1]];
      pending = {key, values, value, kind, texts: typeof value === 'string' ? [value] : [value.enter, value.held], cancel: null};
      return pending;
    }
    function cancelPending() {
      if (!pending) return;
      const cancelled = pending;
      pending = null;
      cancelled.cancel?.();
    }
    function shown(text) {
      if (!pending?.texts.includes(text)) return;
      // Spend a rare line only after it survives to a visible frame.
      draw('affection:' + pending.key, pending.values);
      visits.set(pending.key, 0);
      lastAffection = now();
      pending = null;
    }
    function discardReply(text) {
      if (pending?.kind === 'reply' && pending.texts.includes(text)) cancelPending();
    }
    function enter(index, {allowAffection = true} = {}) {
      if (!isPlayable(index)) return '';
      cancelPending();
      const look = looks[index], data = look.dialogue;
      const count = arrivals.get(look.id) || 0;
      const variant = count % data.enter.length;
      const normal = Object.freeze({enter: data.enter[variant], held: data.held[variant]});
      const special = affection.looks[look.id];
      const ticket = allowAffection && special
        ? reserve('look:' + look.id + ':scene', special.scenes || special.held, 'scene')
        : null;
      const selected = ticket
        ? Object.freeze(typeof ticket.value === 'string' ? {...normal, held: ticket.value} : {...ticket.value})
        : normal;
      // A complete rare pair does not skip an unseen normal pair.
      if (!ticket || typeof ticket.value === 'string') arrivals.set(look.id, count + 1);
      scenes.set(look.id, selected);
      if (ticket) ticket.cancel = () => {
        if (scenes.get(look.id) === selected) scenes.set(look.id, normal);
      };
      return selected.enter;
    }
    function held(index) {
      if (!isPlayable(index)) return '';
      const look = looks[index];
      return scenes.get(look.id)?.held || look.dialogue.restored?.[0] || look.dialogue.held?.[0] || '';
    }
    function reply(index, event, {allowAffection = true} = {}) {
      if (!isPlayable(index) && !['locked', 'aside'].includes(event)) return {text: '', rare: false};
      const look = looks[index];
      const scoped = wardrobes[look.group]?.replies?.[event];
      const values = scoped || replies[event] || look.dialogue[event];
      if (!values?.length) return {text: '', rare: false};
      const shared = !scoped && Boolean(replies[event]);
      const key = scoped ? 'wardrobe:' + look.group + ':' + event : shared ? 'shared:' + event : 'look:' + look.id + ':' + event;
      // A scoped regular pool must not inherit another wardrobe's rare replies.
      const special = scoped ? affection.wardrobes?.[look.group]?.[event] : shared ? affection.shared[event] : affection.looks[look.id]?.[event];
      const ticket = allowAffection && isPlayable(index) ? reserve(key, special) : null;
      return {text: ticket ? ticket.value : draw(key, values), rare: Boolean(ticket)};
    }
    return Object.freeze({enter, held, reply, shown, discardReply, cancelPending});
  };
})();
