require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const RAGEngine = require('./lib/rag');
const DatasetManager = require('./lib/dataset');

const app = express();
const PORT = process.env.PORT || 3001;
const knowledgeFile = path.join(__dirname, 'knowledge.json');
const behaviorFile = path.join(__dirname, 'config', 'behavior.json');
const shopFile = path.join(__dirname, 'config', 'shop.json');

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'missing-key' });
const ragEngine = new RAGEngine();
const datasetManager = new DatasetManager();

let client = null;
let qrCodeData = null;
let isReady = false;
let isCleaning = false;
let isInitializing = false;
const handledMessageIds = new Set();

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadKnowledge() {
  return readJson(knowledgeFile, { keywords: {}, responses: {} });
}

function saveKnowledge(data) {
  try {
    writeJson(knowledgeFile, data);
    return true;
  } catch (error) {
    console.error('Error saving knowledge:', error.message);
    return false;
  }
}

function loadBehavior() {
  return readJson(behaviorFile, {
    system_instructions: 'Jawab hanya berdasarkan konteks yang diberikan.',
    fallback_response: 'Mohon maaf kak, informasi itu belum tersedia pada dataset toko kami.',
    max_sentences: 2,
    language: 'id'
  });
}

function loadShopConfig() {
  const config = readJson(shopFile, { shopName: 'Guardian Style Store', whatsappNumber: '', categories: [] });
  return {
    ...config,
    shopName: process.env.SHOP_NAME || config.shopName,
    whatsappNumber: process.env.SHOP_WHATSAPP_NUMBER || config.whatsappNumber
  };
}

async function getAIResponse(message, contextItems = [], behavior = loadBehavior()) {
  try {
    const contextBlock = ragEngine.buildContextBlock(contextItems);
    if (!contextBlock || contextItems.length === 0) {
      return behavior.fallback_response;
    }

    const systemMessage = [
      behavior.system_instructions,
      `Jawab hanya menggunakan konteks berikut. Jika konteks tidak memadai, jawab: ${behavior.fallback_response}`,
      `Jawab maksimal ${behavior.max_sentences || 2} kalimat. Bahasa: ${behavior.language || 'id'}. Gaya: ${behavior.reply_style || 'ramah'}.`
    ].filter(Boolean).join(' ');

    const userMessage = `Konteks:\n${contextBlock}\n\nPertanyaan pelanggan: ${message}`;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 220),
      temperature: 0.1
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error getting AI response:', error.message);
    return behavior.fallback_response || 'Maaf kak, sistem sedang mengalami kendala.';
  }
}

function initializeClient() {
  if (client) return client;

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'guardian-whatsapp-rag' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-resources',
        '--disable-sync',
        '--disable-translate',
        '--disable-extensions',
        '--disable-default-apps'
      ],
      timeout: 120000
    }
  });

  client.on('qr', qr => {
    qrCodeData = qr;
    console.log('QR Code generated. Scan melalui WhatsApp > Perangkat tertaut.');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    isReady = true;
    isCleaning = false;
    console.log('Bot WhatsApp siap digunakan.');
  });

  client.on('authenticated', () => console.log('WhatsApp authenticated.'));

  client.on('disconnected', reason => {
    console.log('Client disconnected:', reason);
    isReady = false;
    client = null;
    qrCodeData = null;
  });

  const handleIncomingMessage = async msg => {
    try {
      const messageId = msg?.id?._serialized || null;
      if (messageId) {
        if (handledMessageIds.has(messageId)) return;
        handledMessageIds.add(messageId);
        setTimeout(() => handledMessageIds.delete(messageId), 5 * 60 * 1000);
      }

      if (msg.fromMe) return;
      const isPersonalChat = msg.from.endsWith('@c.us') || msg.from.endsWith('@lid');
      const isNotStatus = !msg.from.endsWith('@status');
      if (!isPersonalChat || !isNotStatus) return;

      try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
      } catch (_) {}

      const text = String(msg.body || '').toLowerCase().trim();
      const knowledge = loadKnowledge();

      if (knowledge.responses[text]) {
        await msg.reply(knowledge.responses[text]);
        return;
      }

      const docs = datasetManager.getAllDocuments();
      const contextItems = ragEngine.retrieveContext(msg.body, docs, Number(process.env.RAG_TOP_K || 4));
      const response = await Promise.race([
        getAIResponse(msg.body, contextItems),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI response timeout')), 15000))
      ]).catch(error => {
        console.error('AI timeout/error:', error.message);
        return loadBehavior().fallback_response;
      });

      await msg.reply(response);
    } catch (error) {
      console.error('Message handler error:', error.message);
    }
  };

  client.on('message', handleIncomingMessage);
  client.on('message_create', handleIncomingMessage);
  return client;
}

async function startBot() {
  if (isReady || isInitializing) return { success: false, message: 'Bot sudah berjalan atau sedang dimulai' };
  if (isCleaning) return { success: false, message: 'Bot sedang dihentikan, harap tunggu' };

  isInitializing = true;
  try {
    const clientInstance = initializeClient();
    await clientInstance.initialize();
    isInitializing = false;
    return { success: true, message: 'Bot dimulai, silakan scan QR code' };
  } catch (error) {
    isInitializing = false;
    client = null;
    qrCodeData = null;
    throw error;
  }
}

app.get('/api/shop', (req, res) => res.json(loadShopConfig()));

app.get('/api/categories', (req, res) => {
  const shop = loadShopConfig();
  const datasets = datasetManager.listDatasets();
  const merged = shop.categories.map(category => {
    const dataset = datasets.find(item => item.slug === category.slug);
    return { ...category, productCount: dataset ? dataset.productCount : 0 };
  });
  res.json({ shopName: shop.shopName, whatsappNumber: shop.whatsappNumber, categories: merged });
});

app.get('/api/products', (req, res) => {
  const category = req.query.category || 'personal-care';
  const products = datasetManager.getProductsByCategory(category);
  res.json({ category, products });
});

app.get('/api/datasets', (req, res) => res.json({ datasets: datasetManager.listDatasets(), totalDocuments: datasetManager.getAllDocuments().length }));

app.post('/api/reload-datasets', (req, res) => {
  datasetManager.loadAllDatasets();
  res.json({ success: true, message: 'Dataset berhasil dimuat ulang', datasets: datasetManager.listDatasets() });
});

app.get('/api/bot/status', (req, res) => res.json({ isReady, isCleaning, isInitializing, hasQRCode: Boolean(qrCodeData) }));

app.post('/api/bot/start', async (req, res) => {
  try {
    const result = await startBot();
    res.json(result);
  } catch (error) {
    console.error('Error starting bot:', error.message);
    res.status(500).json({ success: false, message: 'Error memulai bot. Pastikan koneksi internet stabil dan coba lagi.' });
  }
});

app.post('/api/bot/stop', async (req, res) => {
  if (!client) return res.json({ success: false, message: 'Bot tidak sedang berjalan' });

  isCleaning = true;
  isReady = false;
  qrCodeData = null;
  const clientToDestroy = client;
  client = null;
  res.json({ success: true, message: 'Bot sudah dihentikan' });

  setImmediate(async () => {
    try {
      await clientToDestroy.destroy();
    } catch (error) {
      console.error('Error destroying client:', error.message);
    } finally {
      isCleaning = false;
    }
  });
});

app.get('/api/bot/qr', (req, res) => res.json({ qr: qrCodeData || null }));

app.get('/api/knowledge/keywords', (req, res) => res.json(loadKnowledge()));

app.post('/api/knowledge/keyword', (req, res) => {
  const { keyword, response } = req.body;
  if (!keyword || !response) return res.status(400).json({ success: false, message: 'Keyword dan response harus diisi' });

  const knowledge = loadKnowledge();
  knowledge.responses[String(keyword).toLowerCase().trim()] = String(response).trim();
  if (saveKnowledge(knowledge)) return res.json({ success: true, message: 'Keyword berhasil disimpan' });
  res.status(500).json({ success: false, message: 'Error menyimpan keyword' });
});

app.delete('/api/knowledge/keyword/:keyword', (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword).toLowerCase();
  const knowledge = loadKnowledge();
  if (!knowledge.responses[keyword]) return res.status(404).json({ success: false, message: 'Keyword tidak ditemukan' });

  delete knowledge.responses[keyword];
  if (saveKnowledge(knowledge)) return res.json({ success: true, message: 'Keyword berhasil dihapus' });
  res.status(500).json({ success: false, message: 'Error menghapus keyword' });
});

app.get('/api/behavior', (req, res) => res.json(loadBehavior()));

app.post('/api/behavior', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ success: false, message: 'Invalid behavior object' });
  try {
    writeJson(behaviorFile, req.body);
    res.json({ success: true, message: 'Behavior berhasil disimpan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  console.log(`Dashboard Guardian: http://localhost:${PORT}`);
  console.log(`Datasets loaded: ${datasetManager.listDatasets().length}`);

  if (process.env.AUTO_START_BOT !== 'false') {
    setTimeout(() => startBot().catch(error => console.error('Error auto-starting bot:', error.message)), 500);
  }
});
