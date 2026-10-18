const DB_BINDING = "DB";
const R2_BINDING = "R2_BUCKET";
const TABLE_NAME = "eventi_volantini";
const ADMIN_SECRET = "admin-mio-segreto-sicuro"; // Cambia questo valore con una stringa segreta a tua scelta

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function safeString(value, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;
  const pathSegments = params.path || [];

  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // 0. PAGINA HTML DI UPLOAD PROTETTA DA TOKEN NEL NOME: /api/banner/admin-[ADMIN_SECRET]
  if (pathSegments[0] === ADMIN_SECRET) {
    const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Gestione Volantino</title>
    <style>
        body { font-family: sans-serif; background: #f4f4f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h2 { margin-top: 0; color: #333; }
        label { display: block; margin-top: 15px; font-weight: bold; color: #555; }
        input[type="text"], input[type="date"], input[type="file"] { width: 100%; padding: 10px; margin-top: 5px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
        button { background: #d9534f; color: white; border: none; padding: 12px; width: 100%; margin-top: 20px; border-radius: 4px; font-size: 16px; cursor: pointer; }
        button:hover { background: #c9302c; }
        #msg { margin-top: 15px; text-align: center; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Carica Nuovo Volantino</h2>
        <form id="uploadForm">
            <label for="titolo">Titolo Avviso:</label>
            <input type="text" id="titolo" name="titolo" required placeholder="Es. Pranzo di Natale">

            <label for="scadenza">Data di Scadenza:</label>
            <input type="date" id="scadenza" name="scadenza">

            <label for="pdf">File PDF:</label>
            <input type="file" id="pdf" name="pdf" accept="application/pdf" required>

            <button type="submit">Carica e Attiva</button>
        </form>
        <div id="msg"></div>
    </div>

    <script>
        document.getElementById('uploadForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const msg = document.getElementById('msg');
            msg.style.color = '#333';
            msg.textContent = 'Caricamento in corso...';

            const formData = new FormData(this);

            try {
                const res = await fetch('/api/banner', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (data.success) {
                    msg.style.color = 'green';
                    msg.textContent = 'Caricato con successo!';
                    this.reset();
                } else {
                    msg.style.color = 'red';
                    msg.textContent = 'Errore: ' + (data.error || 'Sconosciuto');
                }
            } catch (err) {
                msg.style.color = 'red';
                msg.textContent = 'Errore di connessione.';
            }
        });
    </script>
</body>
</html>`;
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // LOADER JS: /api/banner/loader.js
  if (pathSegments[0] === "loader.js") {
    const scriptContent = `
      (async function() {
        try {
          const res = await fetch('/api/banner');
          const data = await res.json();
          
          if (!data || !data.active) return;

          const titolo = data.titolo || data.title || "Nuovo Avviso";
          const fileKey = data.file_key || data.fileKey;
          const pdfUrl = data.url || (fileKey ? '/api/banner/file/' + fileKey : '#');
          const uuid = data.uuid || 'generico';

          const storageKey = 'dismissed_volantino_' + uuid;
          if (sessionStorage.getItem(storageKey)) return;

          const bar = document.createElement('div');
          bar.id = 'announcement-bar';
          bar.className = 'announcement-bar';
          bar.innerHTML = \`
            <div class="announcement-content">
              <span>🎉 <strong>\${titolo}</strong></span>
              <a href="\${pdfUrl}" target="_blank" class="announcement-btn">Visualizza Menu (PDF)</a>
            </div>
            <button id="announcement-close" class="announcement-close" aria-label="Chiudi">&times;</button>
          \`;

          const style = document.createElement('style');
          style.innerHTML = \`
            .announcement-bar {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              background-color: #d9534f;
              color: #ffffff;
              padding: 12px 15px;
              text-align: center;
              font-family: sans-serif;
              font-size: 15px;
              z-index: 999999;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              box-sizing: border-box;
            }
            .announcement-content {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 15px;
              flex-wrap: wrap;
            }
            .announcement-btn {
              background-color: #ffffff;
              color: #d9534f;
              padding: 5px 14px;
              border-radius: 4px;
              text-decoration: none;
              font-weight: bold;
            }
            .announcement-btn:hover {
              background-color: #f8f9fa;
            }
            .announcement-close {
              position: absolute;
              right: 20px;
              background: transparent;
              border: none;
              color: #ffffff;
              font-size: 22px;
              cursor: pointer;
              line-height: 1;
            }
            body {
              padding-top: 48px !important;
            }
          \`;

          document.head.appendChild(style);
          document.body.prepend(bar);

          document.getElementById('announcement-close').addEventListener('click', function() {
            bar.style.display = 'none';
            document.body.style.paddingTop = '0';
            sessionStorage.setItem(storageKey, 'true');
          });
        } catch (e) {
          console.error("Errore caricamento banner", e);
        }
      })();
    `;
    return new Response(scriptContent, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (pathSegments[0] === "file" && pathSegments[1]) {
    const r2 = env[R2_BINDING];
    const fileKey = pathSegments[1];

    if (!r2) {
      return new Response("R2 storage non configurato", { status: 500 });
    }

    try {
      const object = await r2.get(fileKey);
      if (!object) {
        return new Response("File non trovato", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", `inline; filename="${fileKey}"`);
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(object.body, { headers });
    } catch (err) {
      return new Response("Errore nel recupero del file", { status: 500 });
    }
  }

  const db = env[DB_BINDING];
  if (!db || typeof db.prepare !== "function") {
    return json({ ok: false, error: "Database non configurato" }, 500);
  }

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS "${TABLE_NAME}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      titolo TEXT,
      file_key TEXT,
      scadenza TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
  } catch (e) {}

  if (method === "GET") {
    try {
      const data = await db.prepare(
        `SELECT uuid, titolo, file_key, scadenza FROM "${TABLE_NAME}" WHERE (scadenza IS NULL OR scadenza = '' OR scadenza >= DATE('now')) ORDER BY id DESC LIMIT 1`
      ).all();

      const rows = data.results || data;
      if (!rows || rows.length === 0) {
        return json({ ok: true, active: false });
      }

      const item = rows[0];

      return json({
        ok: true,
        active: true,
        uuid: item.uuid,
        titolo: item.titolo,
        file_key: item.file_key,
        scadenza: item.scadenza,
        url: `/api/banner/file/${item.file_key}`
      });
    } catch (error) {
      return json({ ok: false, error: "Errore lettura database" }, 500);
    }
  }

  if (method === "POST") {
    const r2 = env[R2_BINDING];
    if (!r2) {
      return json({ ok: false, error: "R2 storage mancante" }, 500);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return json({ ok: false, error: "Form-data non valido" }, 400);
    }

    const file = formData.get("pdf");
    const titolo = safeString(formData.get("titolo"), 300);
    const scadenza = safeString(formData.get("scadenza"), 50);

    if (!file || typeof file === "string") {
      return json({ ok: false, error: "File PDF obbligatorio" }, 400);
    }

    const newUuid = crypto.randomUUID();
    const safeFileName = `volantino-${newUuid}.pdf`;

    try {
      await r2.put(safeFileName, file.stream(), {
        httpMetadata: { contentType: "application/pdf" },
      });

      await db.prepare(
        `INSERT INTO "${TABLE_NAME}" (uuid, titolo, file_key, scadenza) VALUES (?, ?, ?, ?)`
      ).bind(newUuid, titolo || "Nuovo Volantino", safeFileName, scadenza || null).run();

      return json({
        ok: true,
        success: true,
        uuid: newUuid,
        message: "Caricato con successo!"
      });
    } catch (error) {
      return json({ ok: false, error: "Errore salvataggio file o dati" }, 500);
    }
  }

  return new Response("Metodo non consentito", { status: 405 });
}