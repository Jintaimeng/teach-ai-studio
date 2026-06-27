const body = JSON.stringify({
  message: "你好，请用一句话介绍你自己",
  model: "auto",
  permissionMode: "bypassPermissions"
});

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 120000);

const start = Date.now();
const resp = await fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
  signal: controller.signal,
});

console.log("Status:", resp.status, "Content-Type:", resp.headers.get("content-type"));

const reader = resp.body.getReader();
const decoder = new TextDecoder();
let got = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const payload = line.slice(6);
      try {
        const obj = JSON.parse(payload);
        got.push(obj);
        console.log(`[+${Date.now() - start}ms]`, obj.type, JSON.stringify(obj).slice(0, 200));
      } catch {
        console.log(`[+${Date.now() - start}ms] raw:`, payload.slice(0, 200));
      }
    }
  }
}
clearTimeout(timeout);
console.log("DONE. Total events:", got.length);
console.log("Event types:", got.map(g => g.type).join(", "));
