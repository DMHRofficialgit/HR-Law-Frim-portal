const sharp = require('sharp');
const fs = require('fs');
const file = process.argv[2] || '01-use-cases.svg';
const out = file.replace(/\.svg$/i, '.png');
const svg = fs.readFileSync(file, 'utf8');
const m = svg.match(/viewBox="([^"]+)"/);
console.log('viewBox', m && m[1]);
sharp(file, { density: 180 })
  .png()
  .toFile(out)
  .then((info) => console.log(info))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
