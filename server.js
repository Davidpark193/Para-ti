const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta donde se guardan los datos. En Railway, monta un Volume
// y apunta DATA_DIR a esa ruta para que los datos no se borren
// con cada nuevo despliegue.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const FRAME_STYLES = ['frame-polaroid', 'frame-vintage', 'frame-floral', 'frame-heart', 'frame-scallop'];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ mainPhoto: null, memories: [], notes: [] }, null, 2));
  }
}
function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { mainPhoto: null, memories: [], notes: [] };
  }
}
function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Estado completo (foto principal + recuerdos + notas)
app.get('/api/state', (req, res) => {
  res.json(readData());
});

// Foto principal (la del círculo)
app.post('/api/main-photo', (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'falta dataUrl' });
  const data = readData();
  data.mainPhoto = dataUrl;
  writeData(data);
  res.json({ ok: true });
});

// Recuerdos (foto + texto con marco)
app.post('/api/memories', (req, res) => {
  const { src, caption } = req.body || {};
  if (!src) return res.status(400).json({ error: 'falta src' });
  const data = readData();
  const frame = FRAME_STYLES[data.memories.length % FRAME_STYLES.length];
  const item = { id: newId(), src, caption: (caption || '').slice(0, 300), frame };
  data.memories.push(item);
  writeData(data);
  res.json(item);
});

app.delete('/api/memories/:id', (req, res) => {
  const data = readData();
  data.memories = data.memories.filter((m) => m.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

// Notitas
app.post('/api/notes', (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'falta text' });
  const data = readData();
  const item = { id: newId(), text: text.slice(0, 500) };
  data.notes.push(item);
  writeData(data);
  res.json(item);
});

app.delete('/api/notes/:id', (req, res) => {
  const data = readData();
  data.notes = data.notes.filter((n) => n.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

// Cualquier otra ruta devuelve la página principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Servidor corriendo en el puerto ' + PORT);
});
