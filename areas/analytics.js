// Shared by the games: PostHog, cookieless (issue #13). resources/2026-10-20-posthog-spec.md holds the events.
// Load it before the game script. It sets one global: Analytics. It stores nothing in the browser.
// Each event carries `game`: the first folder of the page path (chess, tetris or mitropoly).
'use strict';
var Analytics = (() => {
  const game = location.pathname.split('/').filter(Boolean)[0] || 'none';

  // The PostHog web snippet: a stub that queues the calls until array.js loads.
  // eslint-disable-next-line
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture register unregister opt_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init('phc_khRa5UDQ3qqZXhD6KZe7BVL7kyhNDBfyVrAto25M3Jmm', {
    api_host: 'https://eu.i.posthog.com',
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: true,
    before_send: event => {
      if (event) event.properties = { ...event.properties, game };
      return event;
    },
  });

  return {
    // Sends one event of the spec. `props` holds the extra properties of that event.
    track(event, props = {}) {
      posthog.capture(event, props);
    },
  };
})();
