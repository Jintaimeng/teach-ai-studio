import { query } from "@tencent-ai/agent-sdk";

const stream = query({
  prompt: "你好",
  options: {
    cwd: process.cwd(),
    model: "auto",
    maxTurns: 3,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: Object.fromEntries(
      Object.entries({
        CODEBUDDY_API_KEY: process.env.CODEBUDDY_API_KEY,
        CODEBUDDY_INTERNET_ENVIRONMENT: process.env.CODEBUDDY_INTERNET_ENVIRONMENT || "external",
        SERVER__PORT: "0",
      }).filter(([, v]) => v !== undefined)
    ),
    stderr: (data) => console.log("[CLI stderr]", data.trim()),
  },
});

const start = Date.now();
try {
  for await (const msg of stream) {
    console.log(`[+${Date.now() - start}ms] type=${msg.type}`, JSON.stringify(msg));
  }
  console.log("STREAM ENDED normally");
} catch (e) {
  console.error("STREAM THREW:", e);
}
