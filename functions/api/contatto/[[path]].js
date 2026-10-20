/** 
 * 
 * Cloudflare Pages Function: /api/contatto/[[path]].js
 * Gestisce sia il loader JS dinamico per il frontend WordPress sia la ricezione POST con Turnstile e D1.
 * 
*/
const DB_BINDING = "DB_CONTATTI";
const TURNSTILE_SECRET_BINDING = "TURNSTILE_SECRET";
const TURNSTILE_SITE_KEY_BINDING = "TURNSTILE_SITE_KEY"; // <-- NUOVO BINDING PUBBLICO
const SERVER_SECRET_BINDING = "SNA_SHARED_SECRET";
const TABLE_NAME = "contact_requests";
const MAX_BODY_BYTES = 64 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-SNA-Secret",
    },
  });
}

function safeString(value, max = 2000) {
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
        "Access-Control-Allow-Headers": "Content-Type, X-SNA-Secret",
      },
    });
  }

  // LOADER JS DINAMICO: /api/contatto/loader.js
  if (pathSegments[0] === "loader.js") {
    // CORREZIONE CRITICA: Usa TURNSTILE_SITE_KEY (pubblica), MAI la SECRET!
    const siteKey = env[TURNSTILE_SITE_KEY_BINDING] || "1x00000000000000000000AA"; 

    const scriptContent = `
      (function () {
        "use strict";

        if (window.__snaContactLoaderLoaded) return;
        window.__snaContactLoaderLoaded = true;

        var SITE_KEY = "${siteKey}";
        var API_URL = "/api/contatto";

        window.onTurnstileLoad = function() {
          var forms = document.querySelectorAll(".wpcf7-form, form.wpcf7");
          forms.forEach(function (form) {
            initForm(form);
          });
        };

        function loadTurnstileScript() {
          if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile/"]')) return;
          var script = document.createElement("script");
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }

        function getFieldValues(form) {
          var fields = {};
          var data = new FormData(form);

          data.forEach(function (value, key) {
            if (
              key.indexOf("_wpcf7") === 0 ||
              key === "cf-turnstile-response" ||
              key === "g-recaptcha-response" ||
              key === "_wpnonce"
            ) {
              return;
            }

            if (value instanceof File) {
              if (value.name) {
                fields[key] = {
                  filename: value.name,
                  type: value.type,
                  size: value.size
                };
              }
              return;
            }

            if (Object.prototype.hasOwnProperty.call(fields, key)) {
              if (!Array.isArray(fields[key])) {
                fields[key] = [fields[key]];
              }
              fields[key].push(value);
            } else {
              fields[key] = value;
            }
          });

          return fields;
        }

        function initForm(form) {
          if (form.__snaContactInitialized) return;
          form.__snaContactInitialized = true;

          var token = "";
          var widgetId = null;
          var sending = false;

          var container = form.querySelector(".sna-turnstile-container");

          if (!container) {
            container = document.createElement("div");
            container.className = "sna-turnstile-container";
            container.style.margin = "16px 0";

            var submit = form.querySelector(
              'input[type="submit"], button[type="submit"], button:not([type])'
            );

            if (submit && submit.parentNode) {
              submit.parentNode.insertBefore(container, submit);
            } else {
              form.appendChild(container);
            }
          }

          try {
            widgetId = turnstile.render(container, {
              sitekey: SITE_KEY,
              callback: function (newToken) {
                token = newToken || "";
              },
              "expired-callback": function () {
                token = "";
              },
              "error-callback": function () {
                token = "";
                console.error("SNA: errore nella verifica Turnstile.");
              }
            });
          } catch (e) {
            console.error("SNA Turnstile render error:", e);
          }

          form.addEventListener("submit", function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (sending) return;

            if (!token && widgetId !== null && window.turnstile) {
              token = turnstile.getResponse(widgetId) || "";
            }

            if (!token) {
              alert("Completa la verifica di sicurezza Turnstile prima di inviare.");
              return;
            }

            var fields = getFieldValues(form);
            var fieldsJson;

            try {
              fieldsJson = JSON.stringify(fields);
            } catch (error) {
              alert("Non è stato possibile leggere i dati del modulo.");
              return;
            }

            if (!fieldsJson || fieldsJson.length > 45000) {
              alert("Il contenuto del modulo è troppo grande.");
              return;
            }

            var wpcf7Id = form.querySelector('input[name="_wpcf7"]');
            var formId = wpcf7Id ? wpcf7Id.value : "";

            var submissionId =
              "sub-" + Date.now() + "-" +
              Math.random().toString(36).slice(2, 14);

            var payload = {
              submission_id: submissionId,
              form_id: formId,
              form_title: document.title,
              page_url: window.location.href,
              fields: fields,
              turnstile_token: token
            };

            sending = true;

            var submitButton = form.querySelector(
              'input[type="submit"], button[type="submit"]'
            );

            if (submitButton) submitButton.disabled = true;

            fetch(API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(payload)
            })
              .then(function (response) {
                return response.json().then(function (body) {
                  if (!response.ok || !body.ok) {
                    throw new Error(body.error || "Invio non riuscito.");
                  }
                  return body;
                });
              })
              .then(function () {
                alert("Messaggio inviato correttamente.");
                form.reset();

                token = "";
                if (widgetId !== null && window.turnstile) {
                  turnstile.reset(widgetId);
                }
              })
              .catch(function (error) {
                console.error("SNA Contact:", error);
                alert(
                  error.message ||
                  "Si è verificato un errore durante l'invio. Riprova."
                );

                token = "";
                if (widgetId !== null && window.turnstile) {
                  turnstile.reset(widgetId);
                }
              })
              .finally(function () {
                sending = false;
                if (submitButton) submitButton.disabled = false;
              });
          }, true);
        }

        function start() {
          var forms = document.querySelectorAll(".wpcf7-form, form.wpcf7");
          if (!forms.length) return;

          if (window.turnstile && typeof window.turnstile.render === "function") {
            forms.forEach(function (form) { initForm(form); });
          } else {
            loadTurnstileScript();
          }
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", start);
        } else {
          start();
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

  if (method !== "POST") {
    return json({ ok: false, error: "Use POST" }, 405);
  }

  const db = env[DB_BINDING];
  const turnstileSecret = env[TURNSTILE_SECRET_BINDING];
  const serverSecret = env[SERVER_SECRET_BINDING];

  if (!db || typeof db.prepare !== "function") {
    return json({ ok: false, error: "Server configuration incomplete" }, 500);
  }

  const providedServerSecret = request.headers.get("X-SNA-Secret") || "";
  const trustedServerRequest = !!serverSecret && providedServerSecret.length === serverSecret.length && providedServerSecret === serverSecret;
  const origin = request.headers.get("Origin") || "";
  let endpointUrl;
  try { endpointUrl = new URL(request.url); }
  catch { return json({ ok: false, error: "Invalid request URL" }, 400); }
  const endpointOrigin = endpointUrl.origin;
  
  if (!trustedServerRequest && (!origin || origin !== endpointOrigin)) {
    return json({ ok: false, error: "Origin not allowed" }, 403);
  }
  if (!trustedServerRequest && !turnstileSecret) {
    return json({ ok: false, error: "Turnstile is not configured" }, 500);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "Content-Type must be application/json" }, 415);
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "Payload too large" }, 413);

  let raw;
  try { raw = await request.text(); }
  catch { return json({ ok: false, error: "Unable to read request body" }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: "Payload too large" }, 413);

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ ok: false, error: "Invalid payload" }, 400);

  if (!trustedServerRequest) {
    const token = safeString(payload.turnstile_token, 2048);
    if (!token) return json({ ok: false, error: "Turnstile verification required" }, 400);
    let verification;
    try {
      const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: turnstileSecret, // QUI SI USA LA SECRET PRIVATA (SOLO BACKEND)
          response: token,
          ...(request.headers.get("CF-Connecting-IP") ? { remoteip: request.headers.get("CF-Connecting-IP") } : {}),
        }),
      });
      const responseText = await verifyResponse.text();
      try {
        verification = JSON.parse(responseText);
      } catch {
        verification = {};
      }

      if (!verifyResponse.ok) {
        return json({
          ok: false,
          error: "Turnstile verification service error",
          http_status: verifyResponse.status,
          error_codes: verification["error-codes"] || []
        }, 502);
      }
    } catch (error) {
      return json({ ok: false, error: "Turnstile verification unavailable" }, 502);
    }

    if (!verification || !verification.success) {
      const errorCodes = Array.isArray(verification && verification["error-codes"])
        ? verification["error-codes"].slice(0, 10)
        : [];
      return json({ ok: false, error: "Turnstile verification failed", error_codes: errorCodes }, 403);
    }
    const isLocalHost = endpointUrl.hostname === "127.0.0.1" || endpointUrl.hostname === "localhost";
    if (verification.hostname && verification.hostname !== endpointUrl.hostname && !isLocalHost && verification.hostname !== "example.com") {
      return json({ ok: false, error: "Turnstile hostname mismatch", token_hostname: verification.hostname, request_hostname: endpointUrl.hostname }, 403);
    }
  }

  const submissionId = safeString(payload.submission_id, 80);
  if (!submissionId || !/^[A-Za-z0-9-]{16,80}$/.test(submissionId)) return json({ ok: false, error: "Invalid submission_id" }, 400);
  const fields = payload.fields && typeof payload.fields === "object" && !Array.isArray(payload.fields) ? payload.fields : null;
  if (!fields || Object.keys(fields).length === 0) return json({ ok: false, error: "No form fields supplied" }, 400);
  if (JSON.stringify(fields).length > 45000) return json({ ok: false, error: "Form data too large" }, 413);

  const pageUrl = safeString(payload.page_url, 2000);
  const receivedAt = new Date().toISOString();
  const formId = safeString(payload.form_id, 100);
  const formTitle = safeString(payload.form_title, 300);
  const notificationEmail = safeString(env.NOTIFICATION_EMAIL || "", 255);

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS "${TABLE_NAME}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL UNIQUE,
      received_at TEXT NOT NULL,
      site_label TEXT,
      site_url TEXT,
      notification_email TEXT,
      form_plugin TEXT,
      form_id TEXT,
      form_title TEXT,
      page_url TEXT,
      fields_json TEXT NOT NULL,
      uploaded_files_json TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    
    await db.prepare(`CREATE INDEX IF NOT EXISTS "idx_${TABLE_NAME}_status_received" ON "${TABLE_NAME}" (status, received_at)`).run();
    
    const result = await db.prepare(`INSERT INTO "${TABLE_NAME}"
      (submission_id, received_at, site_label, site_url, notification_email, form_plugin, form_id, form_title, page_url, fields_json, uploaded_files_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new') ON CONFLICT(submission_id) DO NOTHING`)
      .bind(submissionId, receivedAt, "default", endpointOrigin, notificationEmail, "contact-form-7-static", formId, formTitle, pageUrl, JSON.stringify(fields), JSON.stringify({}))
      .run();
      
    const changes = result && result.meta ? Number(result.meta.changes || 0) : 0;
    return json({ ok: true, saved: changes > 0, duplicate: changes === 0 });
  } catch (error) {
    return json({ ok: false, error: "Database write failed" }, 500);
  }
}