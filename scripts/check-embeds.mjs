// Offline check: every sample embed (and the report panel) respects Discord's limits.
import { createServer } from "vite";
import path from "node:path";

const root = process.cwd();
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const logs = await server.ssrLoadModule("/src/lib/discord-logs.ts");
  const disc = await server.ssrLoadModule("/src/lib/discord.ts");
  const kinds = ["visits", "cart", "checkout", "pix", "card", "paid", "tickets", "errors", "customers", "audit", "gateway", "report"];
  let bad = 0;
  const check = (name, embed) => {
    const e = disc.styleEmbed("visits", disc.cleanEmbed(embed), "RecargasBuxs");
    const problems = [];
    let total = (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0);
    if ((e.title?.length ?? 0) > 256) problems.push("title>256");
    if ((e.fields?.length ?? 0) > 25) problems.push("fields>25");
    for (const f of e.fields ?? []) {
      total += f.name.length + f.value.length;
      if (!f.name || !f.value) problems.push("empty field");
      if (f.name.length > 256 || f.value.length > 1024) problems.push("field too long");
    }
    if (total > 6000) problems.push(`total ${total}>6000`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name} fields=${e.fields?.length ?? 0} chars=${total} ${problems.join(",")}`);
    if (problems.length) bad += 1;
  };
  for (const k of kinds) {
    const list = logs.sampleEmbed(k, "RecargasBuxs");
    list.forEach((e, i) => check(`${k}#${i}`, e));
  }
  check("report-panel", logs.reportPanelEmbed("RecargasBuxs"));
  for (const k of kinds.slice(0, 1)) {
    // keep ESLint-style quiet: print a sample to eyeball
    const e = logs.sampleEmbed("paid")[0];
    console.log("\nSAMPLE paid:", e.title, "|", e.description);
    for (const f of e.fields) console.log(`  ${f.inline ? "[i]" : "[b]"} ${f.name}: ${f.value.replace(/\n/g, " / ")}`);
  }
  console.log(bad ? `\n${bad} FAILED` : "\nALL OK");
  process.exitCode = bad ? 1 : 0;
} finally {
  await server.close();
}
