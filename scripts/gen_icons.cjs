// Regenerate src/icons.js from the game-icons Iconify set (CC BY 3.0).
// npm i -D @iconify-json/game-icons && node scripts/gen_icons.cjs
const fs = require('fs');
const j = require('@iconify-json/game-icons/icons.json');
const info = require('@iconify-json/game-icons/info.json');
const ver = require('@iconify-json/game-icons/package.json').version;
const pick = { lake: 'wave-crest', carbonate: 'crystal-cluster', olivine: 'emerald', igneous: 'volcano', organics: 'microscope',
  regolith: 'sandstorm', depot: 'locked-chest', landing: 'parachute', sediment: 'stone-stack', habitat: 'lunar-module' };
const out = {};
for (const [k, v] of Object.entries(pick)) out[k] = { name: v, body: j.icons[v].body };
fs.writeFileSync(__dirname + '/../src/icons.js', `// Generated from @iconify-json/game-icons ${ver}.
// Icons: game-icons.net by ${info.author.name} (${info.author.url}), license ${info.license.title} (${info.license.url}).
// Bodies are 512x512 SVG path data. Regenerate with: node scripts/gen_icons.cjs
export const ICON_ATTRIBUTION = ${JSON.stringify(`Icons: game-icons.net (${info.author.name}), ${info.license.title}`)};
export const ICONS = ${JSON.stringify(out, null, 1)};
`);
console.log('wrote src/icons.js');
