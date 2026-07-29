/* ==========================================================================
   Paylaşılan sabitler — hem sunucu hem tarayıcı bu dosyayı kullanır.
   ========================================================================== */

export const TICK_HZ = 20;          // sunucu simülasyon adımı
export const NET_HZ = 10;           // durum yayını
export const DAY_SECONDS = 600;     // bir tam gün-gece döngüsü (saniye)
export const MAP_SIZE = 400;        // dünya kenar uzunluğu (metre)

/* ----------------------------- Eşyalar ----------------------------- */

export const ITEMS = {
    odun:   { name: 'Odun',             icon: '🪵' },
    tas:    { name: 'Taş',              icon: '🪨' },
    lif:    { name: 'Lif',              icon: '🌾' },
    metal:  { name: 'Hurda metal',      icon: '⚙️' },
    bez:    { name: 'Yelken bezi',      icon: '🧵' },
    meyve:  { name: 'Meyve',            icon: '🫐', food: 10, water: 5 },
    hindi:  { name: 'Hindistan cevizi', icon: '🥥', food: 16, water: 22 },
    balik:  { name: 'Çiğ balık',        icon: '🐟', food: 12, hp: -5, cook: 'balikP' },
    balikP: { name: 'Pişmiş balık',     icon: '🍤', food: 34, hp: 6 },
    et:     { name: 'Çiğ et',           icon: '🥩', food: 15, hp: -12, cook: 'etP' },
    etP:    { name: 'Pişmiş et',        icon: '🍖', food: 46, hp: 10 },
    su:     { name: 'Temiz su',         icon: '🥤', water: 50 },
    sargi:  { name: 'Sargı bezi',       icon: '🩹', hp: 35 },
};

/* ----------------------------- Kaynaklar ----------------------------- */
// tool: en verimli alet · yields: [eşya, min, max] · bonus: [eşya, olasılık]

export const NODES = {
    palm:  { hp: 4, tool: 'axe',  r: 1.1, respawn: [100, 170],
             yields: [['odun', 2, 3], ['lif', 0, 1]], bonus: ['hindi', 0.55] },
    tree:  { hp: 5, tool: 'axe',  r: 1.2, respawn: [100, 170],
             yields: [['odun', 2, 4], ['lif', 0, 1]] },
    rock:  { hp: 4, tool: 'pick', r: 1.3, respawn: [130, 200],
             yields: [['tas', 2, 3]], bonus: ['metal', 0.12] },
    bush:  { hp: 3, tool: null,   r: 0.9, respawn: [70, 120],
             yields: [['lif', 1, 2]], bonus: ['meyve', 0.75] },
    wreck: { hp: 6, tool: 'pick', r: 1.6, respawn: [260, 400],
             yields: [['metal', 1, 2], ['bez', 0, 1], ['odun', 1, 2]] },
};

export const NODE_COUNTS = { palm: 90, tree: 130, rock: 70, bush: 110, wreck: 10 };

/* ----------------------------- Aletler ----------------------------- */

export const TOOLS = {
    axeStone:  { kind: 'axe',  power: 1.0, dmg: 16, name: 'Taş balta' },
    axeMetal:  { kind: 'axe',  power: 1.9, dmg: 24, name: 'Metal balta' },
    pickStone: { kind: 'pick', power: 1.0, dmg: 12, name: 'Taş kazma' },
    pickMetal: { kind: 'pick', power: 1.9, dmg: 18, name: 'Metal kazma' },
    spear:     { kind: 'spear', power: 0.6, dmg: 34, name: 'Mızrak' },
    torch:     { kind: 'torch', power: 0.4, dmg: 8,  name: 'Meşale' },
};

export const GATHER_BASE = 0.55;    // elle toplama hızı (ilerleme/sn)
export const GATHER_RIGHT = 1.25;   // doğru aletle çarpan tabanı

/* ----------------------------- Tarifler ----------------------------- */
// bench: true → yakında bir çalışma tezgâhı gerekir

export const RECIPES = [
    { id: 'axeStone',  name: 'Taş balta',   icon: '🪓', kind: 'tool',
      desc: 'Ağaçları hızlı devirir.',              cost: { odun: 3, tas: 2, lif: 2 } },
    { id: 'pickStone', name: 'Taş kazma',   icon: '⛏️', kind: 'tool',
      desc: 'Kayaları kırar, metal şansı verir.',   cost: { odun: 3, tas: 3, lif: 2 } },
    { id: 'spear',     name: 'Mızrak',      icon: '🔱', kind: 'tool',
      desc: 'En güçlü silah, balık avında da işe yarar.', cost: { odun: 3, tas: 1, lif: 3 } },
    { id: 'torch',     name: 'Meşale',      icon: '🔦', kind: 'tool',
      desc: 'Geceyi aydınlatır, elinde taşırsın.',  cost: { odun: 2, lif: 2 } },
    { id: 'sargi',     name: 'Sargı bezi',  icon: '🩹', kind: 'item',
      desc: 'Anında 35 can yeniler.',               cost: { lif: 4, bez: 1 } },

    { id: 'fire',    name: 'Kamp ateşi',    icon: '🔥', kind: 'build',
      desc: 'Isıtır, aydınlatır, yemek pişirir. Odunla beslenir.', cost: { odun: 6, tas: 4 } },
    { id: 'bench',   name: 'Çalışma tezgâhı', icon: '🛠️', kind: 'build',
      desc: 'Metal aletler ve sal için gereklidir.', cost: { odun: 10, tas: 4, lif: 2 } },
    { id: 'still',   name: 'Su damıtıcı',   icon: '💧', kind: 'build',
      desc: 'Deniz suyundan temiz su üretir.',      cost: { odun: 3, tas: 4, lif: 3 } },
    { id: 'shelter', name: 'Barınak',       icon: '⛺', kind: 'build',
      desc: 'Doğuş noktan olur; herkes uyursa gece atlanır.', cost: { odun: 12, lif: 8 } },
    { id: 'chest',   name: 'Ortak sandık',  icon: '📦', kind: 'build',
      desc: 'Takımla eşya paylaşırsın.',            cost: { odun: 8, lif: 3 } },

    { id: 'axeMetal',  name: 'Metal balta', icon: '🪚', kind: 'tool', bench: true,
      desc: 'Odun toplamayı neredeyse ikiye katlar.', cost: { odun: 4, metal: 3, lif: 2 } },
    { id: 'pickMetal', name: 'Metal kazma', icon: '🔨', kind: 'tool', bench: true,
      desc: 'Kayaları çok daha hızlı kırar.',       cost: { odun: 4, metal: 3, lif: 2 } },

    { id: 'raft',    name: 'KAÇIŞ SALI',    icon: '🛶', kind: 'build', bench: true,
      desc: 'Oyunun amacı. Önce kumsala bir tezgâh kur, sonra salı su kenarına yerleştir; ' +
            'herkes yanına gelince kalkış geri sayımını başlat.',
      cost: { odun: 40, lif: 25, tas: 12, metal: 6, bez: 4 } },
];

/* ----------------------------- Dengeleme ----------------------------- */

export const TUNING = {
    foodDrain: 0.30,        // saniyede
    waterDrain: 0.38,
    sprintExtra: 0.35,
    staDrain: 14,
    staRegen: 12,
    starveDmg: 2.0,
    coldDmg: 0.9,           // ateşten uzakta, gece
    rainCold: 0.5,          // yağmurda ekstra
    regen: 0.9,             // tok ve suya doymuşken
    fireRadius: 12,
    fireFuelPerWood: 60,
    stillPeriod: 24,        // saniyede bir temiz su
    respawnPenalty: 0.5,    // ölünce kaybedilen eşya oranı
    boarDmg: [10, 16],      // gündüz / gece
    sharkDmg: 18,
    dayLen: DAY_SECONDS,
};

export const BUILD_INFO = {
    fire:    { r: 1.2, label: 'Kamp ateşi' },
    bench:   { r: 1.2, label: 'Çalışma tezgâhı' },
    still:   { r: 1.0, label: 'Su damıtıcı' },
    shelter: { r: 2.0, label: 'Barınak' },
    chest:   { r: 1.0, label: 'Ortak sandık' },
    raft:    { r: 3.0, label: 'Kaçış salı' },
};

export const PLAYER_COLORS = [
    '#e8663f', '#4aa3e0', '#68c25b', '#e0c04a', '#b96fd8', '#4fd0c0', '#e07aa8', '#8f9bd8',
];

export const WEATHER = ['clear', 'clear', 'clear', 'cloudy', 'rain', 'storm'];
