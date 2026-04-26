import http from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = http.createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Railpack sample</title>
    <style>
      body {
        align-items: center;
        background: #f5f7f8;
        color: #172026;
        display: grid;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }
      main {
        max-width: 680px;
      }
      h1 {
        font-size: 48px;
        line-height: 1;
        margin: 0 0 16px;
      }
      p {
        color: #56656f;
        font-size: 18px;
        line-height: 1.6;
      }
      code {
        background: #e8edf0;
        border-radius: 6px;
        padding: 3px 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Railpack built this app.</h1>
      <p>This sample Node server is built without a Dockerfile, run as a Docker container, and routed through Caddy at <code>${request.url}</code>.</p>
    </main>
  </body>
</html>`);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Sample app listening on ${port}`);
});

