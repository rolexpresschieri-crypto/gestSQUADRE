/**
 * Avvio produzione Next.js su HTTPS (certificati in certificates/).
 * Genera i cert con: npm run dev  (usa --experimental-https una volta).
 */
const { createServer } = require("https");
const { readFileSync, existsSync } = require("fs");
const { join } = require("path");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const app = next({ dev: false });
const handle = app.getRequestHandler();

const certDir = join(__dirname, "certificates");
const keyPath = join(certDir, "localhost-key.pem");
const certPath = join(certDir, "localhost.pem");

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("");
  console.error("Certificati HTTPS mancanti in backend_toc/certificates/");
  console.error("Esegui una volta:  npm run dev");
  console.error("(crea localhost.pem con --experimental-https)");
  console.error("");
  process.exit(1);
}

const httpsOptions = {
  key: readFileSync(keyPath),
  cert: readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`gestSQUADRE TOC — HTTPS attivo`);
    console.log(`  https://localhost:${port}`);
    if (hostname === "0.0.0.0") {
      console.log(`  Rete LAN: https://<IP-PC>:${port}`);
      console.log(`  (certificato self-signed: accettalo nel browser)`);
    }
  });
});
