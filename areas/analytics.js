// Shared by the games: PostHog behind a consent banner (issue #13, Legea 506/2004 art. 4 alin. (5)-(5^6)).
// resources/2026-10-20-posthog-spec.md holds the events and the consent flow.
// Load it before the game script. It sets one global: Analytics.
//
// Consent flow:
// - Before the visitor answers, PostHog (cookieless_mode 'on_reject') sends no events and stores nothing.
//   It still loads its script and its remote config from PostHog.
// - Accept: opt_in_capturing() sets the PostHog cookie, localStorage and sessionStorage keys, and sends
//   `$opt_in` with the banner version, which records the consent and its moment.
// - Reject: opt_out_capturing() keeps only the choice in localStorage. It leaves the sessionStorage keys of
//   an earlier Accept, so the Reject branch deletes them. PostHog then sends events with no cookie and no
//   ID in the browser.
// - The "Cookie settings" button opens the banner again, so the visitor can change or withdraw the choice.
// Each event carries `game`: the first folder of the page path (chess, tetris or mitropoly).
'use strict';
var Analytics = (() => {
  const game = location.pathname.split('/').filter(Boolean)[0] || 'none';

  // Raise this when the banner text or what PostHog stores changes.
  const CONSENT_VERSION = '2026-11-24';
  // The PostHog project token. It is public by design: it can only send events.
  const TOKEN = 'phc_khRa5UDQ3qqZXhD6KZe7BVL7kyhNDBfyVrAto25M3Jmm';

  const TEXT = {
    en: {
      ask: 'We use PostHog to count visits and the games played. May we set an analytics cookie, so that PostHog knows you again on your next visit? If you reject, PostHog still counts your visit, with no cookie.',
      details: 'Details',
      more: [
        'With your consent, PostHog stores a random ID in a cookie named ph_<project key>_posthog (365 days from your last visit), the same data in local storage (no end date), and session keys in session storage, which your browser deletes when you close the tab. PostHog is a third party: it receives the events and keeps them for us.',
        'If you reject, PostHog stores only your choice in local storage and counts the visit with no cookie and no ID in your browser.',
        'Without asking, the games keep two values in local storage: the number of Jev calls left today, and the "fast animations" switch of Mitropoly when you click it.',
      ],
      accept: 'Accept',
      reject: 'Reject',
      settings: 'Cookie settings',
      granted: 'Your current choice: Accept.',
      denied: 'Your current choice: Reject.',
    },
    ro: {
      ask: 'Folosim PostHog ca să numărăm vizitele și jocurile jucate. Putem seta un cookie de analiză, ca PostHog să te recunoască la vizita următoare? Dacă refuzi, PostHog îți numără totuși vizita, fără cookie.',
      details: 'Detalii',
      more: [
        'Cu acordul tău, PostHog păstrează un ID aleator într-un cookie numit ph_<cheia proiectului>_posthog (365 de zile de la ultima vizită), aceleași date în local storage (fără dată de expirare) și chei de sesiune în session storage, pe care browserul le șterge când închizi fila. PostHog e un terț: primește evenimentele și le păstrează pentru noi.',
        'Dacă refuzi, PostHog păstrează în local storage doar alegerea ta și numără vizita fără cookie și fără ID în browser.',
        'Fără să întrebăm, jocurile păstrează în local storage două valori: numărul de apeluri Jev rămase azi și comutatorul „Animații rapide” din Mitropoly, când îl apeși.',
      ],
      accept: 'Accept',
      reject: 'Refuz',
      settings: 'Setări cookie',
      granted: 'Alegerea ta acum: Accept.',
      denied: 'Alegerea ta acum: Refuz.',
    },
  };
  const t = TEXT[document.documentElement.lang] || TEXT.en;

  // The PostHog web snippet: a stub that queues the calls until array.js loads.
  // eslint-disable-next-line
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture register unregister opt_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  // The real PostHog object, set when array.js has loaded. The stub has no consent getter.
  let ph = null;
  let banner = null;
  let opener = null;

  const css = `
    #cookie-consent { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; background: #1d1d1d;
      color: #eee; border-top: 1px solid #444; padding: 14px 18px; font: 14px/1.5 system-ui, sans-serif; }
    #cookie-consent .cc-row { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center;
      justify-content: space-between; max-width: 960px; margin: 0 auto; }
    #cookie-consent .cc-text { flex: 1 1 420px; }
    #cookie-consent details { margin-top: 6px; color: #bbb; }
    #cookie-consent summary { cursor: pointer; text-decoration: underline; }
    #cookie-consent .cc-status { color: #999; margin: 4px 0 0; }
    #cookie-consent .cc-choices { display: flex; gap: 12px; }
    /* Both buttons share one style: the law forbids a refusal that is less visible. */
    #cookie-consent .cc-choice { min-width: 7rem; padding: 8px 18px; border: 0; border-radius: 6px;
      background: #3a6ea5; color: #fff; font: 600 14px system-ui, sans-serif; cursor: pointer; }
    #cookie-consent .cc-choice:hover { background: #2f5b88; }
    #cookie-settings { position: fixed; left: 10px; bottom: 10px; z-index: 999; padding: 4px 10px;
      border: 1px solid #555; border-radius: 6px; background: #1d1d1d; color: #bbb;
      font: 12px system-ui, sans-serif; cursor: pointer; }
  `;

  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text) node.textContent = text;
    return node;
  };

  const build = () => {
    document.head.appendChild(el('style', {}, css));

    banner = el('div', {
      id: 'cookie-consent', role: 'dialog', tabindex: '-1', hidden: '',
      'aria-labelledby': 'cookie-consent-text', 'aria-describedby': 'cookie-consent-status',
    });
    const row = el('div', { class: 'cc-row' });
    const text = el('div', { class: 'cc-text' });
    text.appendChild(el('p', { id: 'cookie-consent-text', style: 'margin:0' }, t.ask));
    const details = el('details');
    details.appendChild(el('summary', {}, t.details));
    for (const line of t.more) details.appendChild(el('p', { style: 'margin:6px 0 0' }, line));
    text.appendChild(details);
    text.appendChild(el('p', { id: 'cookie-consent-status', class: 'cc-status' }));
    const choices = el('div', { class: 'cc-choices' });
    choices.appendChild(el('button', { type: 'button', class: 'cc-choice', 'data-cookie-choice': 'accept' }, t.accept));
    choices.appendChild(el('button', { type: 'button', class: 'cc-choice', 'data-cookie-choice': 'reject' }, t.reject));
    row.append(text, choices);
    banner.appendChild(row);

    // Keys pressed inside the banner (Space, Enter on a button) must not also move a piece or restart a game.
    banner.addEventListener('keydown', e => e.stopPropagation());
    banner.addEventListener('click', e => {
      const choice = e.target.closest('[data-cookie-choice]')?.dataset.cookieChoice;
      if (!choice || !ph) return;
      if (choice === 'accept') {
        ph.opt_in_capturing({ captureProperties: { source: 'cookie-banner', consent_version: CONSENT_VERSION } });
      } else {
        ph.opt_out_capturing();
        try {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(`ph_${TOKEN}_`)) sessionStorage.removeItem(key);
          }
        } catch (e) { /* storage blocked: there is nothing to delete */ }
      }
      hide();
    });

    // Hidden until PostHog loads: with PostHog blocked there is no choice to change.
    const settings = el('button', { type: 'button', id: 'cookie-settings', hidden: '' }, t.settings);
    // Space and Enter press the button; they must not also reach the game.
    settings.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'Enter') e.stopPropagation();
    });
    settings.addEventListener('click', () => show(settings));

    document.body.append(banner, settings);
  };

  // Shows the banner. `from` gets the focus back when the banner closes.
  // Before PostHog loads, there is no choice to read or change, so the banner waits for `loaded`.
  const show = (from = null) => {
    if (!banner || !ph) return;
    opener = from;
    const state = ph.get_explicit_consent_status();
    banner.querySelector('#cookie-consent-status').textContent = t[state] || '';
    banner.hidden = false;
    // Take the focus only when the visitor asked for the banner; on the first visit the game keeps it.
    if (from) banner.focus();
  };

  // Closes the banner and gives the keys back to the game. The focus does not return to
  // "Cookie settings": a focused button would turn the next Space into a click on it.
  const hide = () => {
    banner.hidden = true;
    if (banner.contains(document.activeElement) || document.activeElement === opener) {
      document.activeElement.blur();
    }
    opener = null;
  };

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);

  posthog.init(TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    cookieless_mode: 'on_reject',
    person_profiles: 'never',
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: true,
    before_send: event => {
      if (event) event.properties = { ...event.properties, game };
      return event;
    },
    loaded: instance => {
      ph = instance;
      document.getElementById('cookie-settings')?.removeAttribute('hidden');
      if (ph.get_explicit_consent_status() === 'pending') show();
    },
  });

  return {
    // Sends one event of the spec. `props` holds the extra properties of that event.
    track(event, props = {}) {
      posthog.capture(event, props);
    },
  };
})();
