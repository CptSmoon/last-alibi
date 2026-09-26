// Cloudflare Worker: the only place the scenario's truth lives.
//  POST /api/interview   { run, character }         -> { token, model }  ephemeral Gemini Live token, config LOCKED
//  POST /api/present     { run, character, evidence } -> { say }           text the client forwards with session.say()
//  POST /api/reveal      { run, character, secret }  -> { clue? }          validated reveal_secret tool call
//  POST /api/accuse      { run, suspect, motive, evidence[] } -> { verdict, found, missed }
//
// Playthrough state (inventory, what was shown to whom, secrets out) lives in a Durable Object
// per run; it is sketched here as a KV-like `env.RUNS` for brevity.
// Secrets: GEMINI_API_KEY via `wrangler secret put` (or extrasafe:<credential> in Extra).
// Status: design sketch written 2026-09-26 against ai.google.dev/gemini-api/docs/ephemeral-tokens; not yet deployed.

import { GoogleGenAI } from '@google/genai';
import scenario from '../scenario/mirabeau.json';
import { buildLiveConfig, evidenceMessage, directorNote } from '../prompts/build-prompt.mjs';

const json = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { 'content-type': 'application/json' } });

async function loadRun(env, id) {
  return (await env.RUNS.get(id, 'json')) || { inventory: [], shown: {}, revealed: [], notes: {} };
}
const saveRun = (env, id, run) => env.RUNS.put(id, JSON.stringify(run));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const body = await req.json();
    const run = await loadRun(env, body.run);

    if (url.pathname === '/api/interview') {
      const live = buildLiveConfig(scenario, body.character);
      // Carry memory across interviews: a short recap of what this character already said.
      const recap = run.notes[body.character];
      if (recap) live.config.systemInstruction += `\n\n# EARLIER TONIGHT\nYou were already questioned once. You said: ${recap}. Stay consistent.`;
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const now = Date.now();
      const token = await ai.authTokens.create({
        config: {
          uses: 1,                                                         // one session per token (resumption does not count)
          expireTime: new Date(now + 30 * 60e3).toISOString(),             // long enough for ~3 reconnects (goAway every ~10 min)
          newSessionExpireTime: new Date(now + 60e3).toISOString(),        // must be used within a minute
          liveConnectConstraints: { model: live.model, config: live.config }, // prompt, voice and tools locked server-side
          lockAdditionalFields: [],
          httpOptions: { apiVersion: 'v1beta' },
        },
      });
      return json({ token: token.name, model: live.model });
    }

    if (url.pathname === '/api/present') {
      const { character, evidence } = body;
      if (!run.inventory.includes(evidence)) return json({ error: 'not in inventory' }, 400); // no bluffing via the API
      (run.shown[character] ||= []).includes(evidence) || run.shown[character].push(evidence);
      let say = evidenceMessage(scenario, evidence);
      // The confession gate: only the engine can open it, and the text only exists here.
      if (character === scenario.solution.killer && !run.revealed.includes('s_armand_confession')) {
        const need = [...scenario.solution.accusationRequires.evidenceAnyThreeOf, 'e_bandage', 'e_unwritten_letters'];
        if (need.filter((e) => run.shown[character].includes(e)).length >= 3) say += '\n' + directorNote(scenario, character, 's_armand_confession');
      }
      await saveRun(env, body.run, run);
      return json({ say });
    }

    if (url.pathname === '/api/reveal') {
      // The model claims it revealed a secret: accept only real secrets of THIS character.
      const c = scenario.characters.find((x) => x.id === body.character);
      const sec = c && c.secrets.find((x) => x.id === body.secret);
      if (!sec) return json({ error: 'unknown secret' }, 400);
      if (!run.revealed.includes(sec.id)) run.revealed.push(sec.id);
      if (sec.unlocks && !run.inventory.includes(sec.unlocks)) run.inventory.push(sec.unlocks);
      await saveRun(env, body.run, run);
      return json({ clue: sec.unlocks || null });
    }

    if (url.pathname === '/api/accuse') {
      const req3 = scenario.solution.accusationRequires;
      const keys = (body.evidence || []).filter((e) => req3.evidenceAnyThreeOf.includes(e) && run.inventory.includes(e));
      const right = body.suspect === req3.suspect && body.motive === req3.motive && keys.length >= 3;
      return json({
        verdict: right ? 'solved' : body.suspect === req3.suspect ? 'right-suspect-weak-case' : 'wrong',
        found: run.inventory.filter((e) => scenario.evidence.find((x) => x.id === e)?.key),
        missed: scenario.evidence.filter((x) => x.key && !run.inventory.includes(x.id)).map((x) => x.name),
      });
    }
    return json({ error: 'not found' }, 404);
  },
};
