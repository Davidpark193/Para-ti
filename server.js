const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const FRAME_STYLES = ['frame-polaroid', 'frame-vintage', 'frame-floral', 'frame-heart', 'frame-scallop'];

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable DATABASE_URL. Agrega un servicio de PostgreSQL en Railway y conéctalo a este servicio.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
});

async function setupTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS main_photo (
      id INT PRIMARY KEY DEFAULT 1,
      data_url TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      src TEXT NOT NULL,
      caption TEXT DEFAULT '',
      frame TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Estado completo (foto principal + recuerdos + notas)
app.get('/api/state', async (req, res) => {
  try {
    const photoRes = await pool.query('SELECT data_url FROM main_photo WHERE id = 1');
    const memoriesRes = await pool.query('SELECT id, src, caption, frame FROM memories ORDER BY created_at ASC');
    const notesRes = await pool.query('SELECT id, text FROM notes ORDER BY created_at ASC');
    res.json({
      mainPhoto: photoRes.rows[0] ? photoRes.rows[0].data_url : null,
      memories: memoriesRes.rows,
      notes: notesRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error leyendo la base de datos' });
  }
});

// Foto principal (la del círculo)
app.post('/api/main-photo', async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'falta dataUrl' });
  try {
    await pool.query(
      `INSERT INTO main_photo (id, data_url) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data_url = $1`,
      [dataUrl]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error guardando la foto' });
  }
});

// Recuerdos (foto + texto con marco)
app.post('/api/memories', async (req, res) => {
  const { src, caption } = req.body || {};
  if (!src) return res.status(400).json({ error: 'falta src' });
  try {
    const countRes = await pool.query('SELECT COUNT(*)::int AS n FROM memories');
    const frame = FRAME_STYLES[countRes.rows[0].n % FRAME_STYLES.length];
    const id = newId();
    const item = { id, src, caption: (caption || '').slice(0, 300), frame };
    await pool.query(
      'INSERT INTO memories (id, src, caption, frame) VALUES ($1, $2, $3, $4)',
      [item.id, item.src, item.caption, item.frame]
    );
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error guardando el recuerdo' });
  }
});

app.delete('/api/memories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM memories WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error borrando el recuerdo' });
  }
});

// Notitas
app.post('/api/notes', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'falta text' });
  try {
    const id = newId();
    const item = { id, text: text.slice(0, 500) };
    await pool.query('INSERT INTO notes (id, text) VALUES ($1, $2)', [item.id, item.text]);
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error guardando la notita' });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error borrando la notita' });
  }
});

// Cualquier otra ruta devuelve la página principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

setupTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Servidor corriendo en el puerto ' + PORT);
    });
  })
  .catch((err) => {
    console.error('No se pudieron crear las tablas:', err);
    process.exit(1);
  });
