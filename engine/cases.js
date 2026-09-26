// The case library shown on the Last Alibi menu. Each scenario is one case; only `ready` ones can be played.
// To add a scenario: append an entry here (art is a 16:9 image under game-assets/ or assets/art/).
window.CASES = [
  { id: 'simplon-orient', title: 'Last Stop, Simplon-Orient', year: '1931', place: 'A night train, snowbound in the Alps',
    blurb: 'An avalanche stops the express above Iselle. By breakfast, the envoy in No. 7 is dead behind a bolted door.',
    art: 'assets/art/title-keyart.jpg', ready: true },
  { id: 'mirabeau', title: 'Death at the Hôtel Mirabeau', year: '1962', place: 'A grand hotel on the Riviera',
    blurb: 'Dusk over the Côte d’Azur. A glass spilled by the pool, a straw hat drifting on the water, and nobody saw a thing.',
    art: 'game-assets/ui/case-mirabeau.webp', ready: false },
  { id: 'ker-avel', title: 'The Keeper of Ker-Avel', year: '1974', place: 'A lighthouse off the Breton coast',
    blurb: 'A storm cuts the rock off from the mainland. The beam still turns, the lantern lies smashed, and the keeper is gone.',
    art: 'game-assets/ui/case-ker-avel.webp', ready: false },
];
