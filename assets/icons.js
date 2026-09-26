// 16x16 item icons for the inventory and notebook, drawn in code like everything else.
// ICONS.draw(ctx, evidenceId, x, y, scale=1)
(function () {
  // rows of 16 chars; key -> colour; '.' transparent
  const K = { k: '#0b0a14', n: '#161729', b: '#34406e', i: '#9cc0e4', w: '#fffdf5', c: '#f3ead2', p: '#d8c9a3', t: '#b08a55', h: '#8a6a3f',
    g: '#ffd36b', a: '#f0b54a', s: '#c67a2f', r: '#8a4221', d: '#5a2d1c', o: '#5e1627', e: '#c93a48', m: '#79ad7c', G: '#2f5d4c', l: '#a7a5b3', L: '#6b6a7a', v: '#9a7fb8', y: '#d8d6e0' };
  const I = {
    e_notebook: ['................', '...kkkkkkkkkk...', '...kddddddddkk..', '...kdkkkkkkdkk..', '...kd......dkk..', '...kd.gggg.dkk..', '...kd......dkk..', '...kd.gggg.dkk..', '...kd......dkk..', '...kd.gggg.dkk..', '...kd......dkk..', '...kdddddddddk..', '...kkkkkkkkkkk..', '................', '................', '................'],
    e_blotter: ['................', '................', '..kkkkkkkkkkkk..', '..kppppppppppk..', '..kpbbbpbbbbpk..', '..kppppppppppk..', '..kpbbbbbpbbpk..', '..kppppppppppk..', '..kkkkkkkkkkkk..', '..ktttttttttk...', '..kkkkkkkkkkk...', '................', '................', '................', '................', '................'],
    e_letters: ['................', '..kkkkkkkkkkk...', '..kccccccccck...', '..kckccccckck...', '..kcckcckccck...', '..kccckkccccck..', '..kkkkkkkkkkkk..', '...kccccccccck..', '...kcoooooocck..', '...kccccccccck..', '...kcoooooocck..', '...kkkkkkkkkkk..', '.......ee.......', '......e..e......', '................', '................'],
    e_contract: ['................', '...kkkkkkkkk....', '...kcccccccckk..', '...kcLLLLLcckk..', '...kcccccccccks.', '...kcLLLLLLcck..', '...kcccccccccks.', '...kcLLLLccccks.', '...kcccccccccks.', '...kcccccceecks.', '...kccccceeeek..', '...kkkkkkkkkkk..', '................', '................', '................', '................'],
    e_handkerchief: ['................', '................', '...kkkkkkkkkk...', '..kwywywywywyk..', '..kywwwwwwwwwk..', '..kwwwwwwwwwyk..', '..kywwwvvwwwwk..', '..kwwwwvvwwwyk..', '..kywwwwwwwwwk..', '..kwywywywywyk..', '...kkkkkkkkkk...', '................', '................', '................', '................', '................'],
    e_ampoule_tip: ['................', '................', '.......kk.......', '......kiik......', '......kiik......', '......kiik......', '.....kiiiik.....', '.....kiwiik.....', '....kkkkkkkk....', '....k.k.k..k....', '................', '................', '.....ggggg......', '................', '................', '................'],
    e_grappa: ['................', '................', '..kk........kk..', '..kiik....kiik..', '..kwik....kwik..', '..kiik....kiik..', '...kk......kk...', '...kk......kk...', '..kkkk....kkkk..', '................', '................', '................', '................', '................', '................', '................'],
    e_scorecard: ['................', '..kkkkkkkkkkk...', '..kcccccccccck..', '..kcLcLLcLLcck..', '..kcccccccccck..', '..kcLcLLcLLcck..', '..kcLcLLcLLcck..', '..kcccccccccck..', '..kceceecLLcck..', '..kcccccccccck..', '..kcLcLLcLLcck..', '..kkkkkkkkkkkk..', '................', '................', '................', '................'],
    e_medbag: ['................', '......kkkk......', '.....kk..kk.....', '..kkkkkkkkkkkk..', '.kddddddddddddk.', '.kddddwwwwddddk.', '.kddddweewddddk.', '.kddddeeeedddd k'.replace(' ', 'd'), '.kddddweewddddk.', '.kddddwwwwddddk.', '.kddddddddddddk.', '..kkkkkkkkkkkk..', '................', '................', '................', '................'],
    e_tumbler: ['................', '................', '....kkkkkkkk....', '....kiiiiiiik...', '....kiwiiiiik...', '....kiwiiiiik...', '.....kiiiiik....', '.....kiiiiik....', '.....kiiiiik....', '......kkkkk.....', '................', '................', '................', '................', '................', '................'],
    e_passports: ['................', '..kkkkkkkk......', '..kGGGGGGk......', '..kGggggGkkkkk..', '..kGgGGgGkbbbbk.', '..kGggggGkbiibk.', '..kGGGGGGkbiibk.', '..kGGggGGkbbbbk.', '..kGGGGGGkbiibk.', '..kkkkkkkkbbbbk.', '.........kkkkkk.', '................', '................', '................', '................', '................'],
    e_marked_cards: ['................', '...kkkkkk.......', '...kwwwwkkkkk...', '...kwewwkwwwwk..', '...kweewkwkkwk..', '...kwewwkwkkwk..', '...kwwwwkwwwwk..', '...kkkkkkwwwwk..', '.........kkkkk..', '................', '................', '................', '................', '................', '................', '................'],
    e_camphor: ['................', '................', '..kkkkkkkkkkkk..', '..kssssssssssk..', '..kskikikikiksk.', '..kskikikikiksk.', '..kskikikikiksk.', '..kssssssssssk..', '..kkkkkkkkkkkk..', '................', '................', '................', '................', '................', '................', '................'],
    e_bolt: ['................', '................', '................', '...kkkkkkkkkk...', '...kgggggggggk..', '...kkkkkgkkkk...', '.......kgk......', '.......kgk......', '.......kkk......', '................', '................', '................', '................', '................', '................', '................'],
    fact: ['................', '.....kkkkk......', '....kiiiiik.....', '...kiwiiiiik....', '...kiiiiiiik....', '...kiiiiiiik....', '....kiiiiik.....', '.....kkkkkss....', '..........sss...', '...........sss..', '............ss..', '................', '................', '................', '................', '................'],
    testimony: ['................', '..kkkkkkkkkkk...', '.kccccccccccck..', '.kcckkcckkccck..', '.kcckkcckkccck..', '.kccckccckccck..', '.kccccccccccck..', '..kkkkckkkkkk...', '.....kck........', '.....kk.........', '................', '................', '................', '................', '................', '................'],
    observation: ['................', '................', '....kkkkkkkk....', '..kkwwwwwwwwkk..', '.kwwwwbbbbwwwwk.', '.kwwwbbkkbbwwwk.', '.kwwwbbkkbbwwwk.', '..kkwwbbbbwwkk..', '....kkkkkkkk....', '................', '................', '................', '................', '................', '................', '................'],
  };
  function draw(ctx, id, x, y, s = 1) {
    const e = (window.CASE && CASE.evidence.find((v) => v.id === id)) || {};
    const rows = I[id] || I[e.kind] || I.fact;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const c = K[rows[j][i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * s, y + j * s, s, s); }
    }
  }
  window.ICONS = { draw };
})();
