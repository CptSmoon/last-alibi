// The train as a top-down tile world: sleeping car, dining car, lounge car, and the snow outside.
// 8 px tiles, 192 x 22. Rows 0-4 are outside (north), 5 and 16 the car walls, 6-15 inside,
// 17-21 outside (south). Everything here is static; game.js owns time, people and state.
(function () {
  const T = 8, COLS = 192, ROWS = 22;
  const K = { OUT: 0, WALL: 1, CORR: 2, COMP: 3, DINE: 4, LOUNGE: 5, VEST: 6, DOOR: 7, ODOOR: 8, FURN: 9, KITCHEN: 10, BLOCK: 11, GANG: 12 };
  const tiles = new Uint8Array(COLS * ROWS);
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? K.BLOCK : tiles[y * COLS + x]);
  const set = (x, y, k) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) tiles[y * COLS + x] = k; };
  const fill = (x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, k); };

  // ---- layout (tile x ranges) ----
  const SL = { x0: 36, x1: 93 }, DI = { x0: 95, x1: 140 }, LO = { x0: 142, x1: 185 };
  const COMP_W0 = 46; // west wall of compartment 1; each compartment is 6 tiles, walls shared
  const compWest = (k) => COMP_W0 + (k - 1) * 6;

  const rooms = [];   // { id, name, x0, y0, x1, y1, private }
  const doors = [];   // { room, tiles: [[x,y],...] }  compartment doors (lockable)
  const odoors = [];  // outside doors [[x,y],...]
  const room = (id, name, x0, y0, x1, y1, priv) => rooms.push({ id, name, x0, y0, x1, y1, private: priv });

  function car(c, floor) {
    fill(c.x0, 5, c.x1, 16, K.WALL);
    fill(c.x0 + 1, 6, c.x1 - 1, 15, floor);
  }
  function vestibule(x0, x1) {
    fill(x0, 6, x1, 15, K.VEST);
    const dx = x0 + 1;
    for (const y of [5, 16]) { set(dx, y, K.ODOOR); set(dx + 1, y, K.ODOOR); odoors.push([dx, y], [dx + 1, y]); }
  }
  function opening(x) { fill(x, 9, x, 12, K.GANG); }

  // avalanche + locomotive
  fill(0, 0, 9, ROWS - 1, K.BLOCK);
  fill(10, 5, 33, 16, K.BLOCK);

  // sleeping car
  car(SL, K.CORR);
  vestibule(37, 40); vestibule(89, 92);
  fill(41, 6, 88, 12, K.WALL);          // compartment block
  fill(41, 13, 88, 15, K.CORR);         // corridor
  room('sv_l', 'Sleeping car · vestibule', 37, 6, 40, 15, false);
  room('sv_r', 'Sleeping car · vestibule', 89, 6, 92, 15, false);
  room('sleeper_corridor', 'Sleeping car · corridor', 41, 13, 88, 15, false);
  room('pantry', "Conductor's pantry", 41, 6, 45, 11, true);
  fill(41, 6, 45, 11, K.COMP);
  for (let k = 1; k <= 7; k++) {
    const w = compWest(k);
    fill(w + 1, 6, w + 5, 11, K.COMP);
    fill(w + 1, 6, w + 5, 7, K.FURN);                          // berth under the window
    const d = [[w + 2, 12], [w + 3, 12]]; d.forEach(([x, y]) => set(x, y, K.DOOR));
    doors.push({ room: 'c' + k, tiles: d });
    room('c' + k, 'Compartment ' + k, w + 1, 6, w + 5, 11, true);
  }
  set(87, 9, K.FURN); set(87, 10, K.FURN);   // No. 7: fold-down table
  set(83, 10, K.FURN); set(83, 11, K.FURN);  // No. 7: attaché case on the floor
  opening(SL.x1); opening(SL.x1 + 1); opening(DI.x0);

  // dining car
  car(DI, K.DINE);
  vestibule(96, 99); vestibule(136, 139);
  fill(100, 6, 100, 11, K.WALL); fill(101, 6, 109, 11, K.KITCHEN); fill(110, 6, 110, 11, K.WALL); fill(100, 12, 109, 12, K.WALL);
  set(107, 12, K.DOOR); set(108, 12, K.DOOR); doors.push({ room: 'kitchen', tiles: [[107, 12], [108, 12]] });
  fill(101, 6, 104, 6, K.FURN); fill(106, 6, 109, 6, K.FURN); // stove + counter          // stove + counter
  room('dv_l', 'Dining car · vestibule', 96, 6, 99, 15, false);
  room('kitchen', 'Kitchen', 101, 6, 109, 11, true);
  room('dining_hall', 'Dining car', 100, 12, 135, 15, false);
  room('dining_hall2', 'Dining car', 111, 6, 135, 11, false);
  room('dv_r', 'Dining car · vestibule', 136, 6, 139, 15, false);
  const TABLES = { t1: [114, 'n'], t2: [120, 'n'], t3: [126, 'n'], t4: [132, 'n'], t5: [117, 's'], t6: [129, 's'] };
  for (const [, [cx, side]] of Object.entries(TABLES)) {
    const y0 = side === 'n' ? 6 : 14;
    fill(cx - 1, y0, cx, y0 + 1, K.FURN);
  }
  fill(134, 14, 135, 15, K.FURN);                                       // chef de train's desk
  opening(DI.x1); opening(DI.x1 + 1); opening(LO.x0);

  // lounge car
  car(LO, K.LOUNGE);
  vestibule(143, 146);
  fill(148, 6, 155, 7, K.FURN);                                         // bar counter
  fill(164, 10, 165, 11, K.FURN);                                       // card table
  fill(172, 6, 173, 7, K.FURN);                                         // stove
  fill(160, 15, 166, 15, K.FURN);                                       // sofa
  room('lv_l', 'Lounge car · vestibule', 143, 6, 146, 15, false);
  room('bar', 'Lounge car · bar', 147, 6, 156, 15, false);
  room('lounge_hall', 'Lounge car', 157, 6, 184, 15, false);

  // outside
  room('out_north', 'Outside · north side', 10, 0, COLS - 1, 4, false);
  room('out_south', 'Outside · south side', 10, 17, COLS - 1, ROWS - 1, false);

  // ---- waypoints: feet positions in pixels (+ facing) ----
  const wp = {};
  const W = (id, tx, ty, dir = 'down') => { wp[id] = { x: Math.round(tx * T), y: Math.round(ty * T + 6), dir }; };
  for (let k = 1; k <= 7; k++) { const w = compWest(k); W('c' + k, w + 3.5, 9, 'down'); W('c' + k + '_door', w + 3, 14, 'up'); }
  W('c7_door2', compWest(7) + 5, 14.5, 'left');
  W('cond_seat', 42.5, 14, 'right'); W('sv_l', 38.5, 10); W('sv_r', 90.5, 10);
  for (const [t, [cx, side]] of Object.entries(TABLES)) {
    const y = side === 'n' ? 7 : 14.5;
    W('d_' + t + 'a', cx - 1.5, y, 'right'); W('d_' + t + 'b', cx + 1.5, y, 'left');
  }
  W('d_t5', 115.5, 14.5, 'right');
  W('d_aisle', 124, 11); W('d_kitchen', 105, 9, 'up'); W('dv_l', 97.5, 10); W('dv_r', 137.5, 10, 'left');
  W('l_bar', 150.5, 9, 'up'); W('l_bar2', 153.5, 9, 'up');
  W('l_card_a', 163.5, 10.5, 'right'); W('l_card_b', 166.5, 10.5, 'left'); W('l_card_b2', 165, 8.5, 'down');
  W('l_stove', 173, 8.5, 'up'); W('l_arm1', 159, 13.5, 'right'); W('l_arm2', 169, 13.5, 'left'); W('l_arm3', 176, 13.5, 'left');
  W('l_obs', 181, 10, 'right');
  W('d_breakfast', 118, 12.2, 'up'); W('c7_scene', 84.5, 14.3, 'up'); W('d_entry', 97.5, 11, 'right');

  // ---- hotspots (spot id -> pixel position) ----
  const hs = {};
  const H = (id, tx, ty) => { hs[id] = { x: Math.round(tx * T), y: Math.round(ty * T + 4) }; };
  const c7 = compWest(7);
  H('h_pillow', c7 + 1.5, 8); H('h_body', c7 + 3.2, 8); H('h_window', c7 + 5, 8);
  H('h_table', c7 + 4.5, 10); H('h_medcase', c7 + 3, 10.8);
  H('h_attache', c7 + 2, 10.5); H('h_attache2', c7 + 2, 10.5);
  H('h_door7', c7 + 3.8, 13.3); H('h_hanky', c7 + 1.5, 14.6);
  H('h_callboard', 41.5, 13.3);
  H('h_footprints', 112, 3.2); H('h_ampoule', c7 + 3.2, 3.8);
  H('h_trainlog', 134.5, 13.3); H('h_grappa', 103, 8); H('h_scorecard', 164.5, 9.1);
  H('h_shoes', compWest(3) + 2, 8.2); H('h_medbag', compWest(3) + 4.5, 10.5);
  H('h_tumbler', compWest(6) + 5, 8.2); H('h_passports', compWest(4) + 2.5, 10.5); H('h_cards', compWest(2) + 3, 10.5);
  H('f_bed1', compWest(1) + 3, 8.2); H('f_menu', 117, 13.2); H('f_obs', 183, 10); H('f_avalanche', 11, 2.5);
  H('f_piano', 158, 7.5); H('f_samovar', 44, 13.3);

  // ---- queries ----
  const tileOf = (px, py) => [Math.floor(px / T), Math.floor(py / T)];
  function roomAt(tx, ty) { for (const r of rooms) if (tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1) return r; return null; }
  function doorRoom(tx, ty) { for (const d of doors) if (d.tiles.some(([x, y]) => x === tx && y === ty)) return d.room; return null; }
  function carAt(tx, ty) {
    if (ty <= 4 || ty >= 17) return 'outside';
    if (tx >= SL.x0 && tx <= SL.x1 + 1) return 'sleeper';
    if (tx >= DI.x0 && tx <= DI.x1 + 1) return 'dining';
    if (tx >= LO.x0 && tx <= LO.x1) return 'lounge';
    return 'outside';
  }
  // st: { locked: Set(roomId), outside: bool }
  function solidForPlayer(tx, ty, st) {
    const k = at(tx, ty);
    if (k === K.WALL || k === K.FURN || k === K.BLOCK) return true;
    if (k === K.DOOR) return st.locked.has(doorRoom(tx, ty));
    if (k === K.ODOOR) return !st.outside;
    if (k === K.OUT) return !st.outside || ty <= 1 || ty >= ROWS - 1;
    return false;
  }
  const npcWalk = (tx, ty) => { const k = at(tx, ty); return k === K.CORR || k === K.COMP || k === K.DINE || k === K.LOUNGE || k === K.VEST || k === K.DOOR || k === K.KITCHEN || k === K.GANG; };

  // BFS over the NPC grid (doors always passable for NPCs). Returns [[tx,ty],...] excluding start.
  function path(from, to) {
    const [sx, sy] = from, [ex, ey] = to;
    if (sx === ex && sy === ey) return [];
    const prev = new Int32Array(COLS * ROWS).fill(-1), q = [sy * COLS + sx]; prev[q[0]] = q[0];
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % COLS, y = (i / COLS) | 0;
      if (x === ex && y === ey) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * COLS + nx;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev[j] !== -1) continue;
        if (!npcWalk(nx, ny) && !(nx === ex && ny === ey)) continue;
        prev[j] = i; q.push(j);
      }
    }
    const end = ey * COLS + ex; if (prev[end] === -1) return null;
    const out = []; for (let i = end; i !== prev[i]; i = prev[i]) out.push([i % COLS, (i / COLS) | 0]);
    return out.reverse();
  }
  // Nearest NPC-walkable tile to a pixel point (waypoints on chairs sit on walkable tiles already).
  function walkTile(px, py) {
    const [tx, ty] = tileOf(px, py); if (npcWalk(tx, ty)) return [tx, ty];
    for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (npcWalk(tx + dx, ty + dy)) return [tx + dx, ty + dy];
    return [tx, ty];
  }

  // ---- static art: everything except outside, people, roofs and lighting ----
  function renderBase(ctx) {
    const { rect, px, dither, vgrad, line, text } = PX;
    ctx.clearRect(0, 0, COLS * T, ROWS * T);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = at(x, y), X = x * T, Y = y * T;
      if (k === K.CORR) { rect(ctx, X, Y, T, T, '#5e1627'); if ((x + y) % 2 === 0) px(ctx, X + 3, Y + 4, '#7a2236'); if (y === 13) rect(ctx, X, Y, T, 1, '#3e0e1a'); }
      else if (k === K.COMP) { rect(ctx, X, Y, T, T, '#3a2418'); dither(ctx, X, Y, T, T, '#3a2418', '#4a2e1e', 0.25); }
      else if (k === K.DINE) { rect(ctx, X, Y, T, T, (x + y) % 2 ? '#2f5d4c' : '#27503f'); }
      else if (k === K.LOUNGE) { rect(ctx, X, Y, T, T, '#232845'); if ((x * 3 + y) % 5 === 0) px(ctx, X + 4, Y + 4, '#34406e'); }
      else if (k === K.VEST || k === K.GANG) { rect(ctx, X, Y, T, T, '#3b3a48'); for (let i = 0; i < T; i += 2) px(ctx, X + i, Y + ((x + i) % 3), '#4b4a5a'); }
      else if (k === K.KITCHEN) { rect(ctx, X, Y, T, T, (x + y) % 2 ? '#a7a5b3' : '#d8d6e0'); }
      else if (k === K.DOOR) { rect(ctx, X, Y, T, T, '#5e1627'); }
    }
    // car shells: walls, windows (left transparent so the outside shows through), brass trim
    for (const c of [SL, DI, LO]) {
      const x0 = c.x0 * T, x1 = (c.x1 + 1) * T;
      for (const y of [5, 16]) {
        rect(ctx, x0, y * T, x1 - x0, T, '#1a1d33'); rect(ctx, x0, y * T + (y === 5 ? 7 : 0), x1 - x0, 1, '#c67a2f');
        for (let X = x0 + 12; X < x1 - 16; X += 24) ctx.clearRect(X, y * T + 2, 14, 4), rect(ctx, X - 1, y * T + 1, 16, 1, '#c67a2f');
      }
      rect(ctx, x0, 5 * T, T, 12 * T, '#1a1d33'); rect(ctx, x1 - T, 5 * T, T, 12 * T, '#1a1d33');
    }
    for (const [x, y] of odoors) { rect(ctx, x * T, y * T, T, T, '#35190f'); rect(ctx, x * T + 2, y * T + 2, 4, 3, '#9cc0e4'); }
    // gangways
    for (const x of [SL.x1, SL.x1 + 1, DI.x0, DI.x1, DI.x1 + 1, LO.x0]) { rect(ctx, x * T, 9 * T, T, 4 * T, '#3b3a48'); rect(ctx, x * T, 9 * T - 1, T, 1, '#0b0a14'); rect(ctx, x * T, 13 * T, T, 1, '#0b0a14'); }
    // compartment partitions and doors
    rect(ctx, 41 * T, 12 * T, 48 * T, T, '#35190f'); rect(ctx, 41 * T, 12 * T + 6, 48 * T, 2, '#c67a2f');
    for (let k = 0; k <= 7; k++) { const X = compWest(k + 1) * T; rect(ctx, X, 6 * T, T, 6 * T, '#35190f'); rect(ctx, X + 3, 6 * T, 2, 6 * T, '#5a2d1c'); }
    rect(ctx, 41 * T, 6 * T, T / 2, 6 * T, '#35190f');
    for (let k = 1; k <= 7; k++) {
      const w = compWest(k), X = (w + 1) * T;
      rect(ctx, X, 6 * T, 5 * T, 2 * T, '#7a2236'); rect(ctx, X, 6 * T, 5 * T, 3, '#f3ead2'); rect(ctx, X + 1, 7 * T + 4, 5 * T - 2, 1, '#5e1627');  // berth
      rect(ctx, X + 1, 6 * T + 1, 7, 5, '#fffdf5');                                                                                       // pillow
      rect(ctx, (w + 2) * T, 12 * T + 7, 2 * T, 1, '#ffd36b');
      text(ctx, String(k), (w + 3) * T - 2, 13 * T + 1, '#f0b54a');
    }
    // No. 7 furniture
    rect(ctx, 87 * T + 1, 9 * T, 6, 2 * T, '#8a6a3f'); rect(ctx, 87 * T + 1, 9 * T, 6, 2, '#b08a55');
    rect(ctx, 83 * T + 1, 10 * T + 2, 7, 12, '#35190f'); rect(ctx, 83 * T + 2, 10 * T + 7, 5, 1, '#ffd36b');
    // conductor's corner
    rect(ctx, 41 * T, 6 * T, 5 * T, 6 * T, '#2a1409'); text(ctx, 'W-L', 42 * T, 8 * T, '#c67a2f');
    rect(ctx, 42 * T, 14 * T + 4, 10, 6, '#8a4221'); rect(ctx, 41 * T + 2, 13 * T, 12, 5, '#161729');   // seat + call board
    for (let i = 0; i < 7; i++) px(ctx, 41 * T + 3 + i * 1.5, 13 * T + 2, i === 6 ? '#c93a48' : '#ffd36b');
    // kitchen
    rect(ctx, 101 * T, 6 * T, 4 * T, T, '#3b3a48'); for (let i = 0; i < 4; i++) rect(ctx, 101 * T + 2 + i * 8, 6 * T + 2, 4, 4, '#0b0a14');
    rect(ctx, 106 * T, 6 * T, 4 * T, T, '#b08a55'); rect(ctx, 110 * T, 6 * T, T, 6 * T, '#1a1d33'); rect(ctx, 100 * T, 6 * T, T, 6 * T, '#1a1d33');
    rect(ctx, 100 * T, 12 * T, 10 * T, T, '#1a1d33'); rect(ctx, 107 * T, 12 * T, 2 * T, T, '#6b6a7a');
    // dining tables with white cloths, lamps and chairs
    for (const [, [cx, side]] of Object.entries(TABLES)) {
      const y0 = (side === 'n' ? 6 : 14) * T, X = (cx - 1) * T;
      rect(ctx, X, y0, 2 * T, 2 * T, '#fffdf5'); rect(ctx, X, y0 + 2 * T - 2, 2 * T, 2, '#d8c9a3');
      rect(ctx, X + 7, y0 + 4, 2, 4, '#c67a2f'); rect(ctx, X + 5, y0 + 2, 6, 3, '#f0b54a');
      for (const cxx of [cx - 2, cx + 1]) { rect(ctx, cxx * T + 1, y0 + 2, 6, 12, '#5a2d1c'); rect(ctx, cxx * T + 2, y0 + 3, 4, 10, '#8a4221'); }
    }
    rect(ctx, 134 * T, 14 * T, 2 * T, 2 * T, '#5a2d1c'); rect(ctx, 134 * T + 3, 14 * T + 3, 8, 6, '#d8c9a3');
    // lounge: bar, stools, card table, stove, sofa, armchairs, piano
    rect(ctx, 148 * T, 6 * T, 8 * T, 2 * T, '#5a2d1c'); rect(ctx, 148 * T, 7 * T + 4, 8 * T, 4, '#c67a2f');
    for (let i = 0; i < 8; i++) rect(ctx, 148 * T + 2 + i * 8, 6 * T + 2, 2, 5, ['#79ad7c', '#f0b54a', '#9cc0e4', '#c93a48'][i % 4]);
    for (let i = 0; i < 4; i++) { rect(ctx, 149 * T + i * 16, 8 * T + 4, 5, 4, '#7a2236'); }
    rect(ctx, 164 * T, 10 * T, 2 * T, 2 * T, '#2f5d4c'); rect(ctx, 164 * T, 10 * T, 2 * T, 1, '#c67a2f');
    rect(ctx, 164 * T + 3, 10 * T + 4, 4, 5, '#fffdf5'); rect(ctx, 165 * T + 1, 10 * T + 6, 4, 5, '#fffdf5');
    for (const x of [163, 166]) rect(ctx, x * T + 1, 10 * T, 6, 2 * T, '#7a2236');
    rect(ctx, 172 * T, 6 * T, 2 * T, 2 * T, '#0b0a14'); rect(ctx, 172 * T + 4, 7 * T, 8, 5, '#c93a48'); rect(ctx, 172 * T + 6, 7 * T + 1, 4, 3, '#f0b54a');
    rect(ctx, 160 * T, 15 * T, 7 * T, T, '#5e1627'); rect(ctx, 160 * T, 15 * T, 7 * T, 2, '#7a2236');
    for (const [x, y] of [[158, 13], [168, 13], [175, 13]]) { rect(ctx, x * T, y * T + 2, 2 * T - 2, 12, '#7a2236'); rect(ctx, x * T + 2, y * T + 4, 10, 8, '#5e1627'); }
    rect(ctx, 157 * T + 2, 6 * T, 2 * T, T + 4, '#0b0a14'); for (let i = 0; i < 6; i++) rect(ctx, 157 * T + 3 + i * 2, 7 * T + 1, 1, 3, '#fffdf5');
    // observation end: big windows
    for (const y of [5, 16]) ctx.clearRect(177 * T, y * T + 1, 7 * T, 6);
    ctx.clearRect(185 * T + 1, 7 * T, 6, 8 * T);
    // locomotive and tender (top view)
    rect(ctx, 10 * T, 5 * T, 24 * T, 12 * T, '#1a1420');
    rect(ctx, 11 * T, 6 * T, 13 * T, 10 * T, '#232845'); for (let x = 12; x < 24; x += 2) rect(ctx, x * T, 6 * T + 2, 2, 10 * T - 4, '#161729');
    ellipse(ctx, 13 * T, 11 * T, 10, 10, '#0b0a14'); ellipse(ctx, 13 * T, 11 * T, 6, 6, '#3b3a48');
    rect(ctx, 25 * T, 6 * T, 8 * T, 10 * T, '#2a2420'); dither(ctx, 25 * T + 2, 6 * T + 2, 8 * T - 4, 10 * T - 4, '#0b0a14', '#3b3a48', 0.3);
    rect(ctx, 10 * T, 5 * T, 24 * T, 2, '#c93a48'); rect(ctx, 10 * T, 17 * T - 2, 24 * T, 2, '#c93a48');
    text(ctx, 'CIWL', 26 * T, 10 * T, '#ffd36b');
    // car names under the roofs line
    text(ctx, 'VOITURE-LITS 3', 60 * T, 16 * T + 1, '#f0b54a');
    text(ctx, 'VOITURE-RESTAURANT', 110 * T, 16 * T + 1, '#f0b54a');
    text(ctx, 'VOITURE-SALON', 158 * T, 16 * T + 1, '#f0b54a');
  }
  const ellipse = (ctx, cx, cy, rx, ry, c) => PX.ellipse(ctx, cx, cy, rx, ry, c);

  window.WORLD = { T, COLS, ROWS, K, at, rooms, doors, odoors, waypoints: wp, hotspots: hs, SL, DI, LO, compWest,
    tileOf, roomAt, doorRoom, carAt, solidForPlayer, npcWalk, path, walkTile, renderBase, W: COLS * T, H: ROWS * T };
})();
