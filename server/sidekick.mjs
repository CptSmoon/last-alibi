// Castelli, the inspector's sidekick: POST /api/sidekick { history, input, now, file } -> { text, actions }.
// During the investigation the chef de train is the inspector's assistant. You can think out loud with him, ask
// for his help, and send him on errands (the game runs them: engine/sidekick.js):
//   fetch_person(person)          go and bring someone to the inspector
//   search_room(room)             search a room and bring back what's there
//   interview(person, question)   ask someone a question on the inspector's behalf and report back
// He keeps his own character (buildSystemInstruction: what he saw, his own knowledge) and sees the CASE FILE: only
// what the inspector has already found or heard (sent by the client, evidence checked against the scenario).
// Anti-leak: nothing from the solution, other people's secrets or lies. He is told he is no detective.
import { buildSystemInstruction } from '../prompts/prompt-core.mjs';
import { logger } from './log.mjs';

const log = logger('sidekick');
export const ROOMS = { c1: 'compartment 1 (the inspector\'s)', c2: 'compartment 2', c3: 'compartment 3', c4: 'compartment 4', c5: 'compartment 5', c6: 'compartment 6', c7: 'compartment 7 (the victim\'s)',
  corridor: 'the sleeping-car corridor', dining: 'the dining car', kitchen: 'the kitchen', lounge: 'the lounge car', outside: 'outside, in the snow along the train' };
const clamp = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const SIDEKICK = (S, file, people) => `
# THIS MORNING YOU ARE THE INSPECTOR'S ASSISTANT
The inspector has asked you to help him until the carabinieri arrive at 10:00. You are proud to, and a little nervous. You are loyal, practical, and you know this train and its people. You are NOT a detective: you never claim to know who did it, and never accuse anyone. You help him think.
- He may ask your opinion, share his thoughts, or ask what to do next. Answer honestly from the CASE FILE and your own knowledge: point at gaps (people not questioned yet, rooms not searched), contradictions, and things worth asking. Short, spoken sentences.
- Errands: you can call ONE of these tools when he asks you to do it (or clearly agrees to your offer). Say in one sentence that you are going.
  * fetch_person(person): go and bring that person to him.
  * search_room(room): go and search a room, and bring back what you find.
  * interview(person, question): go and ask someone his question (phrase it clearly), then come back and tell him.
- People: ${people}. Rooms: ${Object.entries(ROOMS).map(([k, v]) => `${k} = ${v}`).join('; ')}.
- ${file.away ? 'You are just back from an errand.' : ''} Reports from your errands are in the CASE FILE: repeat them faithfully if asked, never embellish.

# CASE FILE (what the inspector knows so far; do not invent anything beyond it)
Evidence found: ${file.found.length ? file.found.map((e) => `${e.name} (${e.description})`).join(' | ') : 'nothing yet'}
Statements heard: ${file.statements.length ? file.statements.join(' | ') : 'none yet'}
Contradictions spotted: ${file.contradictions.length ? file.contradictions.join(' | ') : 'none yet'}
Your errand reports: ${file.reports.length ? file.reports.join(' | ') : 'none yet'}
Questioned so far: ${file.questioned.length ? file.questioned.join(', ') : 'nobody'}. Not questioned yet: ${file.notQuestioned.length ? file.notQuestioned.join(', ') : 'nobody'}.
Rooms with things still to find (count only): ${Object.keys(file.unsearched).length ? Object.entries(file.unsearched).map(([r, n]) => `${ROOMS[r] || r}: ${n}`).join(', ') : 'none that you know of'}.`;

// The opening: he has just run into the dining car to fetch the inspector.
const ALARM = `
# RIGHT NOW
You have just run into the dining car to fetch the inspector, out of breath. Théo, the conductor, could not wake the envoy Anton Lazăr in compartment 7; the door was bolted from inside, and you forced the bolt a few minutes ago. Lazăr is dead in his berth. Dr Ferrand, who was at breakfast, says it was his heart.
- The inspector may ask what happened, where, who found him, or anything else. Answer in one or two short, shaken sentences, from what you know.
- Urge him to come and see: it is in compartment 7, in the sleeping car next door. When he agrees, say you will lead the way.
- From now on you will be his assistant for the morning, until the carabinieri come at 10:00.`;

function tools(people) {
  const who = { type: 'STRING', enum: people, description: 'person id' };
  return [{ functionDeclarations: [
    { name: 'fetch_person', description: 'Go and bring this person to the inspector.', parameters: { type: 'OBJECT', properties: { person: who }, required: ['person'] } },
    { name: 'search_room', description: 'Go and search this room, and bring back what you find.', parameters: { type: 'OBJECT', properties: { room: { type: 'STRING', enum: Object.keys(ROOMS) } }, required: ['room'] } },
    { name: 'interview', description: 'Go and ask this person a question on the inspector\'s behalf, then report back.', parameters: { type: 'OBJECT', properties: { person: who, question: { type: 'STRING', description: 'the question, as you will ask it' } }, required: ['person', 'question'] } },
  ] }];
}

export async function sidekick(S, key, b, rid) {
  const t0 = Date.now();
  if (!key) return { status: 503, body: { error: 'GEMINI_API_KEY missing' } };
  const input = clamp(b?.input, 600); if (!input) return { status: 400, body: { error: 'input required' } };
  const byId = new Map(S.evidence.map((e) => [e.id, e]));
  const others = S.characters.filter((c) => c.id !== 'castelli' && !c.isVictim);
  const peopleIds = others.map((c) => c.id), name = (id) => (S.characters.find((c) => c.id === id) || {}).name || id;
  const f = b?.file || {};
  const questioned = [...new Set(Array.isArray(f.questioned) ? f.questioned : [])].filter((id) => peopleIds.includes(id));
  const alarm = f.phase === 'alarm';
  const file = {
    away: !!f.away,
    found: [...new Set(Array.isArray(f.found) ? f.found : [])].filter((id) => byId.has(id)).slice(0, 60).map((id) => byId.get(id)),
    statements: (Array.isArray(f.statements) ? f.statements : []).slice(-40).map((x) => clamp(x, 220)).filter(Boolean),
    contradictions: (Array.isArray(f.contradictions) ? f.contradictions : []).slice(-10).map((x) => clamp(x, 400)).filter(Boolean),
    reports: (Array.isArray(f.reports) ? f.reports : []).slice(-10).map((x) => clamp(x, 500)).filter(Boolean),
    questioned: questioned.map(name), notQuestioned: peopleIds.filter((id) => !questioned.includes(id)).map(name),
    unsearched: Object.fromEntries(Object.entries(f.unsearched || {}).filter(([r, n]) => ROOMS[r] && Number.isInteger(n) && n > 0).slice(0, 12)),
  };
  const now = Number.isInteger(b?.now) ? b.now : undefined;
  const system = buildSystemInstruction(S, 'castelli', 'ch3', now) + '\n' + (alarm ? ALARM : SIDEKICK(S, file, others.map((c) => `${c.id} = ${c.name}`).join(', ')));
  // Each line of the inspector's is framed as what it is: Gemini's safety filter blocks bare commands such as
  // "Bring me Mila Novak" (PROHIBITED_CONTENT, measured 26 Sept), but not the same words in their game context.
  const said = (t) => `[The inspector says to you, Castelli, his assistant in this murder investigation on the train:] ${t}`;
  const history = (Array.isArray(b?.history) ? b.history : []).slice(-16)
    .map((h) => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.role === 'model' ? clamp(h.text, 800) : said(clamp(h.text, 800)) }] })).filter((h) => h.parts[0].text);
  const contents = [...history, { role: 'user', parts: [{ text: said(input) }] }];
  const models = [S.brain.model, S.brain.fallbackModel].filter(Boolean);
  for (let i = 0; i < models.length; i++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${models[i]}:generateContent`;
      const payload = { systemInstruction: { parts: [{ text: system }] }, contents, ...(alarm ? {} : { tools: tools(peopleIds) }),
        generationConfig: { maxOutputTokens: 600, ...(models[i].startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: models[i].includes('lite') ? 'minimal' : 'low' } } : {}) } };
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      if (j.promptFeedback?.blockReason) log.warn('blocked by Gemini safety', { rid, model: models[i], reason: j.promptFeedback.blockReason });
      const parts = j.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => (p.thought ? '' : p.text || '')).join('').replace(/[*_]+/g, '').replace(/\s+/g, ' ').trim();
      const actions = [];
      for (const p of parts) {
        const c = p.functionCall; if (!c) continue;
        const a = c.args || {};
        if (c.name === 'fetch_person' && peopleIds.includes(a.person)) actions.push({ kind: 'fetch', person: a.person });
        else if (c.name === 'search_room' && ROOMS[a.room]) actions.push({ kind: 'search', room: a.room });
        else if (c.name === 'interview' && peopleIds.includes(a.person) && clamp(a.question, 300)) actions.push({ kind: 'interview', person: a.person, question: clamp(a.question, 300) });
        else log.warn('bad tool call dropped', { rid, name: c.name, args: a });
      }
      if (!text && !actions.length) throw new Error('empty answer (no text, no tool call)'); // a blip: try the other model
      log.info('sidekick', { rid, model: models[i], actions: actions.map((a) => a.kind + ':' + (a.person || a.room)), chars: text.length, ms: Date.now() - t0 });
      return { status: 200, body: { text, actions: actions.slice(0, 1) } };
    } catch (e) {
      if (i < models.length - 1) log.warn('model failed, trying the other', { rid, model: models[i], error: String(e.message).slice(0, 160) });
      else { log.error('sidekick failed', { rid, ms: Date.now() - t0, error: String(e.message).slice(0, 200) }); return { status: 502, body: { error: 'sidekick failed' } }; }
    }
  }
}
