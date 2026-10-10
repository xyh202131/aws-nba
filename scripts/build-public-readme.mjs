import { readFile, mkdir, writeFile } from "node:fs/promises";

// Render the authored README to a standalone page; escape raw HTML first.
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const inline = (value) =>
  escape(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      if (!/^(https:\/\/|docs\/|WORKSPACE\.md)/.test(href)) return label;
      const target = href.startsWith("https://")
        ? href
      : `/${href}`;
      return `<a href="${target}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
const markdown = await readFile(
  new URL("../README.md", import.meta.url),
  "utf8",
);
const lines = markdown.split(/\r?\n/);
const output = [];
let fence = false,
  list = "",
  table = false;
const closeList = () => {
  if (list) output.push(`</${list}>`);
  list = "";
};
const closeTable = () => {
  if (table) output.push("</tbody></table></div>");
  table = false;
};
for (const line of lines) {
  if (line.startsWith("```")) {
    closeList();
    closeTable();
    output.push(fence ? "</code></pre>" : "<pre><code>");
    fence = !fence;
    continue;
  }
  if (fence) {
    output.push(escape(line) + "\n");
    continue;
  }
  if (!line.trim()) {
    closeList();
    closeTable();
    continue;
  }
  if (/^\|[\s:|-]+\|$/.test(line)) continue;
  if (line.startsWith("|")) {
    closeList();
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => inline(cell.trim()));
    if (!table) {
      output.push(
        `<div class="table-scroll"><table><thead><tr>${cells.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>`,
      );
      table = true;
    } else
      output.push(
        `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
      );
    continue;
  }
  closeTable();
  const heading = /^(#{1,3}) (.+)/.exec(line);
  if (heading) {
    closeList();
    const level = heading[1].length;
    output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    continue;
  }
  const item = /^(?:- |\d+\. )(.+)/.exec(line);
  if (item) {
    const type = line.startsWith("-") ? "ul" : "ol";
    if (list !== type) {
      closeList();
      output.push(`<${type}>`);
      list = type;
    }
    output.push(`<li>${inline(item[1])}</li>`);
    continue;
  }
  closeList();
  output.push(`<p>${inline(line)}</p>`);
}
closeList();
closeTable();
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8fbfc"><meta name="description" content="Team11 COURTSIDE 深度赛场：28 秒中文解说成片、官方数据可视化、证据复盘与 AI 视频创作引擎。"><title>Team11 · 作品 README | COURTSIDE 深度赛场</title><link rel="icon" href="/court-blue.svg">
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fbfc;color:#17233b;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.9}header{background:white;border-bottom:1px solid #dfe7ef;padding:20px 32px;display:flex;align-items:center;gap:16px}header strong{background:#2e73fc;color:white;padding:5px 12px;border-radius:7px}header span{font-weight:700;letter-spacing:.3px}header a{margin-left:auto}a{color:#245dcd;text-decoration:none}a:hover{text-decoration:underline}:focus-visible{outline:3px solid #2e73fc;outline-offset:4px}main{max-width:1040px;margin:36px auto 70px;background:white;border:1px solid #e1e7ee;border-radius:16px;padding:38px 48px}h1{font-size:32px;letter-spacing:-1px;line-height:1.4;margin:0 0 12px}h2{font-size:23px;letter-spacing:-.4px;margin:38px 0 16px;padding-top:22px;border-top:1px solid #e8edf3}h3{font-size:18px;margin:25px 0 9px}p{margin:12px 0}li{margin:7px 0}strong{font-weight:700}code{background:#f0f4fa;border-radius:4px;padding:2px 5px;font-size:13px}pre{background:#f1f5fa;border:1px solid #e0e7f0;padding:18px;border-radius:10px;overflow:auto;line-height:1.65}pre code{padding:0;white-space:pre;font-size:12px}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:18px 0}td,th{padding:12px 14px;border-bottom:1px solid #e5ebf1;text-align:left;vertical-align:top}th{background:#eef4ff;color:#2453a0}td:first-child{font-weight:600;white-space:nowrap}footer{text-align:center;color:#657388;font-size:12px;padding:0 24px 36px}
</style></head><body><header><strong>Team11</strong><span>COURTSIDE · 深度赛场</span><a href="/">← 返回作品，观看成片</a></header><main>${output.join("\n")}</main><footer>Team11 · BROADCAST CODE 12 · COURTSIDE 深度赛场</footer></body></html>`;
const directory = new URL("../public/readme/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("index.html", directory), html);
console.log("Generated public/readme/index.html from README.md");
