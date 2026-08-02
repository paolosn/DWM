#!/usr/bin/env node
// Servidor MCP mínimo de prueba: habla JSON-RPC 2.0 por stdio, una línea
// por mensaje. Usado exclusivamente por los tests de
// @dwm/connections-manager para probar el transporte stdio real (sin
// mocks de proceso).
process.stdin.setEncoding("utf-8");
let buffer = "";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg);
  }
});

const slowInit = process.argv.includes("--slow-init");

function handle(msg) {
  const { id, method } = msg;
  if (method === "initialize") {
    const respond = () =>
      send({
        jsonrpc: "2.0",
        id,
        result: {
          serverInfo: { name: "dwm-fixture-mcp-server", version: "9.9.9" },
          capabilities: { tools: {}, resources: {} },
        },
      });
    if (slowInit) {
      setTimeout(respond, 5000);
    } else {
      respond();
    }
    return;
  }
  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: { tools: [{ name: "echo", description: "Devuelve la entrada" }] },
    });
    return;
  }
  if (method === "resources/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: { resources: [{ uri: "fixture://readme", name: "readme" }] },
    });
    return;
  }
  if (method === "prompts/list") {
    send({ jsonrpc: "2.0", id, error: { message: "prompts no soportado en este fixture" } });
    return;
  }
  if (method === "slow") {
    setTimeout(() => send({ jsonrpc: "2.0", id, result: {} }), 5000);
    return;
  }
  send({ jsonrpc: "2.0", id, error: { message: `Método desconocido: ${method}` } });
}
