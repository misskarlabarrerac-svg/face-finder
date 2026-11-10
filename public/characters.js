// Shared character deck (browser + server). Portraits live in /img/<name>.webp
(function (root) {
  // g: m|f · age: young|adult|old · skin: light|medium|dark
  // hair: black|brown|blonde|red|gray|null(bald) · len: short|long · type: straight|curly|wavy|spiky|braids|bun
  const D = { age: 'adult', glasses: false, hat: null, beard: false, mustache: false, earrings: false, necklace: false, freckles: false, type: 'straight' };
  const raw = [
    ['Bob',    { g: 'm', age: 'young', skin: 'dark',   hair: 'brown',  len: 'short', eyes: 'brown', shirt: 'blue' }],
    ['Theo',   { g: 'm', age: 'young', skin: 'light',  hair: 'blonde', len: 'short', type: 'spiky', eyes: 'blue', shirt: 'blue' }],
    ['Lucy',   { g: 'f', skin: 'medium', hair: 'black', len: 'short', type: 'curly', eyes: 'brown', hat: 'brown', earrings: true, necklace: true, shirt: 'red' }],
    ['Bella',  { g: 'f', age: 'young', skin: 'light',  hair: 'red',    len: 'short', eyes: 'green', shirt: 'blue' }],
    ['Henry',  { g: 'm', skin: 'dark',   hair: 'brown',  len: 'short', eyes: 'brown', beard: true, shirt: 'white' }],
    ['Bill',   { g: 'm', age: 'young', skin: 'light',  hair: 'blonde', len: 'short', eyes: 'brown', shirt: 'green' }],
    ['Sara',   { g: 'f', age: 'young', skin: 'light',  hair: 'brown',  len: 'long',  eyes: 'blue', glasses: true, hat: 'purple', earrings: true, necklace: true, shirt: 'white' }],
    ['Rose',   { g: 'f', age: 'young', skin: 'light',  hair: 'black',  len: 'short', eyes: 'blue', hat: 'purple', shirt: 'black' }],
    ['Sophia', { g: 'f', age: 'young', skin: 'medium', hair: 'blonde', len: 'short', type: 'wavy', eyes: 'brown', earrings: true, necklace: true, shirt: 'yellow' }],
    ['Jeff',   { g: 'm', skin: 'light',  hair: 'blonde', len: 'long',  eyes: 'brown', glasses: true, beard: true, mustache: true, shirt: 'green' }],
    ['Nora',   { g: 'f', skin: 'dark',   hair: 'red',    len: 'short', type: 'curly', eyes: 'brown', glasses: true, hat: 'purple', shirt: 'green' }],
    ['Tom',    { g: 'm', skin: 'light',  hair: null, eyes: 'blue', glasses: true, mustache: true, shirt: 'blue' }],
    ['Aria',   { g: 'f', age: 'old', skin: 'light',  hair: 'gray',   len: 'short', eyes: 'brown', glasses: true, earrings: true, shirt: 'purple' }],
    ['Jose',   { g: 'm', skin: 'dark',   hair: null, eyes: 'green', beard: true, mustache: true, shirt: 'gray' }],
    ['Emma',   { g: 'f', age: 'old', skin: 'dark',   hair: 'gray',   len: 'long',  type: 'curly', eyes: 'brown', earrings: true, shirt: 'orange' }],
    ['Ryan',   { g: 'm', skin: 'light',  hair: 'brown',  len: 'short', eyes: 'blue', glasses: true, hat: 'gray', mustache: true, shirt: 'brown' }],
    ['Annie',  { g: 'f', age: 'young', skin: 'light',  hair: 'red',    len: 'long',  type: 'wavy', eyes: 'brown', freckles: true, earrings: true, necklace: true, shirt: 'blue' }],
    ['Paul',   { g: 'm', skin: 'medium', hair: 'red',    len: 'long',  eyes: 'green', beard: true, mustache: true, shirt: 'blue' }],
    ['Olivia', { g: 'f', age: 'young', skin: 'dark',   hair: 'blonde', len: 'long',  eyes: 'green', earrings: true, shirt: 'blue' }],
    ['Rob',    { g: 'm', age: 'young', skin: 'medium', hair: 'black',  len: 'short', eyes: 'brown', hat: 'red', beard: true, shirt: 'blue' }],
    ['Lia',    { g: 'f', age: 'old', skin: 'medium', hair: 'gray',   len: 'long', type: 'bun', eyes: 'brown', earrings: true, necklace: true, shirt: 'green' }],
    ['Chloe',  { g: 'f', age: 'young', skin: 'medium', hair: 'brown',  len: 'long',  eyes: 'green', earrings: true, necklace: true, shirt: 'blue' }],
    ['David',  { g: 'm', skin: 'dark',   hair: 'black',  len: 'long',  eyes: 'brown', mustache: true, shirt: 'yellow' }],
    ['Mila',   { g: 'f', age: 'young', skin: 'dark',   hair: 'blonde', len: 'long',  type: 'braids', eyes: 'brown', glasses: true, shirt: 'red' }],
    ['Naomi',  { g: 'f', age: 'young', skin: 'light',  hair: 'black',  len: 'long',  eyes: 'brown', earrings: true, necklace: true, shirt: 'pink' }],
    ['James',  { g: 'm', age: 'young', skin: 'light',  hair: 'red',    len: 'short', eyes: 'brown', glasses: true, hat: 'blue', shirt: 'green' }],
    ['John',   { g: 'm', age: 'old', skin: 'dark',   hair: 'gray',   len: 'short', eyes: 'blue', hat: 'yellow', beard: true, mustache: true, shirt: 'red' }],
    ['Ben',    { g: 'm', skin: 'dark',   hair: null, eyes: 'blue', glasses: true, shirt: 'blue' }],
    ['Julia',  { g: 'f', age: 'old', skin: 'dark',   hair: 'gray',   len: 'short', eyes: 'brown', earrings: true, necklace: true, shirt: 'yellow' }],
    ['Jack',   { g: 'm', age: 'old', skin: 'light',  hair: 'gray',   len: 'short', eyes: 'green', hat: 'purple', beard: true, mustache: true, shirt: 'purple' }],
  ];
  const CHARACTERS = raw.map(([name, o], id) => Object.assign({ id, name, img: `img/${name.toLowerCase()}.webp` }, D, o));

  function list(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a.at(-1) : a[0]; }

  function describe(c) {
    const p = c.g === 'm' ? 'He' : 'She';
    const noun = c.g === 'm' ? 'man' : 'woman';
    const who = c.age === 'young' ? `a young ${noun}` : c.age === 'old' ? `an old ${noun}` : `a ${noun}`;
    const out = [`${c.name} is ${who}.`];
    if (!c.hair) out.push(`${p} is bald.`);
    else {
      const t = { straight: '', curly: 'curly ', wavy: 'wavy ', spiky: 'spiky ' }[c.type] ?? '';
      const tail = c.type === 'braids' ? ' in braids' : c.type === 'bun' ? ' in a bun' : '';
      out.push(`${p} has ${c.len} ${t}${c.hair} hair${tail}.`);
    }
    out.push(`${p} has ${c.eyes} eyes.`);
    const has = [];
    if (c.glasses) has.push('glasses');
    if (c.beard) has.push('a beard');
    if (c.mustache) has.push('a mustache');
    if (c.freckles) has.push('freckles');
    if (has.length) out.push(`${p} has ${list(has)}.`);
    const wear = [];
    if (c.hat) wear.push(`a ${c.hat} hat`);
    if (c.earrings) wear.push('earrings');
    if (c.necklace) wear.push('a necklace');
    wear.push(`a ${c.shirt} top`);
    out.push(`${p} is wearing ${list(wear)}.`);
    return out.join(' ');
  }

  const api = { CHARACTERS, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GW = api;
})(typeof window !== 'undefined' ? window : globalThis);
