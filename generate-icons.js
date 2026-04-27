import sharp from 'sharp';
import fs from 'fs';

async function generateFavicon() {
  if (!fs.existsSync('./dist')) fs.mkdirSync('./dist');
  
  await sharp('./public/icon.svg')
    .resize(256, 256)
    .toFormat('png')
    .toFile('./dist/favicon.ico');
    
  console.log("Favicon generated successfully at dist/favicon.ico!");
}

generateFavicon();