export async function onRequestGet(context) {
  const { env } = context;

  // Puoi leggere la lista da una variabile d'ambiente Cloudflare (es. MODULES="banner,popup")
  // Oppure tenerla qui centralizzata:
  const activeModules = [
    "/api/banner/loader.js",
    "/api/contatto/loader.js"
  ];

  // Genera un blocco di script unito
  let scriptOutput = "";
  for (const moduleUrl of activeModules) {
    scriptOutput += `(function() {
      const s = document.createElement('script');
      s.src = "${moduleUrl}";
      s.defer = true;
      document.head.appendChild(s);
    })();\n`;
  }

  return new Response(scriptOutput, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}