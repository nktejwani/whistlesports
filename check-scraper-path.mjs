import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'db.json');

console.log('Scraper dbPath:', dbPath);
console.log('Exists:', require('fs').existsSync(dbPath));
