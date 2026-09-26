// The case library shown on the Last Alibi menu. Each scenario is one case; only `ready` ones can be played.
// To add a scenario: append an entry here (art is a 16:9 image under game-assets/: only engine/ and game-assets/ are
// deployed, so an image elsewhere will 404 live; postmark is the town stamped on the back of its postcard).
window.CASES = [
  { id: 'simplon-orient', title: 'Last Stop, Simplon-Orient', year: '1931', place: 'A night train, snowbound in the Alps',
    blurb: 'An avalanche stops the express above Iselle. By breakfast, the envoy in No. 7 is dead behind a bolted door.',
    art: 'game-assets/ui/case-simplon-orient.webp', postmark: 'Iselle', ready: true },
  { id: 'mirabeau', title: 'Death at the Hôtel Mirabeau', year: '1962', place: 'A grand hotel on the Riviera',
    blurb: 'Dusk over the Côte d’Azur. A glass spilled by the pool, a straw hat drifting on the water, and nobody saw a thing.',
    art: 'game-assets/ui/case-mirabeau.webp', postmark: 'Antibes', ready: false },
  { id: 'ker-avel', title: 'The Keeper of Ker-Avel', year: '1974', place: 'A lighthouse off the Breton coast',
    blurb: 'A storm cuts the rock off from the mainland. The beam still turns, the lantern lies smashed, and the keeper is gone.',
    art: 'game-assets/ui/case-ker-avel.webp', postmark: 'Ker-Avel', ready: false },
];

// What the player has achieved in each case, kept in this browser: solved (and when), best verdict, attempts.
// A solved case stays playable; its postcard gets a SOLVED stamp.
window.PROGRESS = (function () {
  const KEY = 'lastalibi-progress', RANK = { wrong: 0, weak: 1, solved: 2 };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } };
  return {
    get: (id) => read()[id] || null,
    record(id, verdict) {
      const all = read(), p = all[id] || { plays: 0 };
      p.plays = (p.plays || 0) + 1; p.last = verdict; p.lastAt = new Date().toISOString();
      if (!p.best || RANK[verdict] > RANK[p.best]) p.best = verdict;
      if (verdict === 'solved' && !p.solvedAt) p.solvedAt = p.lastAt;
      all[id] = p; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) {}
      return p;
    },
  };
})();
