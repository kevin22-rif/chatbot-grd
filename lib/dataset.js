const fs = require('fs');
const path = require('path');

class DatasetManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.datasets = new Map();
    this.ensureDataDir();
    this.loadAllDatasets();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  parseCsvLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (insideQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }
      if (character === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += character;
    }

    values.push(current.trim());
    return values;
  }

  csvEscape(value) {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
  }

  loadCsvDataset(filePath, datasetName) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return { name: datasetName, file: filePath, rows: [], documents: [], loadedAt: new Date().toISOString() };

    const headers = this.parseCsvLine(lines[0]).map(header => header.trim());
    const rows = [];
    const documents = [];

    for (let index = 1; index < lines.length; index += 1) {
      const values = this.parseCsvLine(lines[index]);
      const row = {};
      headers.forEach((header, columnIndex) => { row[header] = values[columnIndex] || ''; });
      if (!row.name && !row['whitespace-normal']) continue;

      const product = {
        category: row.category || this.titleCase(datasetName.replace(/-/g, ' ')),
        name: row.name || row['whitespace-normal'] || '',
        discount: row.discount || row['h-4'] || '',
        badge: row.badge || row.truncate || '',
        sold: row.sold || row['truncate 2'] || '',
        url: row.url || row['contents href'] || '',
        image: row.image || row['_image_yazkc_11 src'] || ''
      };

      rows.push(product);
      documents.push({
        source: `${product.category}/${product.name}`,
        text: [
          `Kategori: ${product.category}`,
          `Nama produk: ${product.name}`,
          product.discount ? `Diskon: ${product.discount}` : '',
          product.badge ? `Label/promo: ${product.badge}` : '',
          product.sold ? `Terjual: ${product.sold}` : '',
          product.url ? `Link produk: ${product.url}` : ''
        ].filter(Boolean).join('\n')
      });
    }

    return { name: datasetName, file: filePath, rows, documents, loadedAt: new Date().toISOString() };
  }

  titleCase(value) {
    return String(value).replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  loadAllDatasets() {
    this.datasets.clear();
    const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.csv'));
    for (const file of files) {
      const filePath = path.join(this.dataDir, file);
      const datasetName = file.replace(/\.csv$/i, '');
      try {
        this.datasets.set(datasetName, this.loadCsvDataset(filePath, datasetName));
        console.log(`Loaded dataset: ${datasetName}`);
      } catch (error) {
        console.error(`Error loading dataset ${file}:`, error.message);
      }
    }
  }

  getAllDocuments() {
    return Array.from(this.datasets.values()).flatMap(dataset => dataset.documents || []);
  }

  getProductsByCategory(slug) {
    const dataset = this.datasets.get(slug);
    return dataset ? dataset.rows : [];
  }

  listDatasets() {
    return Array.from(this.datasets.values()).map(dataset => ({
      slug: dataset.name,
      loadedAt: dataset.loadedAt,
      productCount: dataset.rows.length,
      documentCount: dataset.documents.length
    }));
  }
}

module.exports = DatasetManager;
