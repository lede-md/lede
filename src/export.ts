function escapeTitle(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
*,*::before,*::after{box-sizing:border-box}
body.lede-export{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:17px;line-height:1.7;color:#1a1a1a;
  max-width:720px;margin:0 auto;padding:2.5rem 1.5rem 4rem;
  -webkit-text-size-adjust:100%;
}
h1,h2,h3,h4,h5,h6{
  line-height:1.25;font-weight:600;margin:2rem 0 .6rem;color:#111;
}
h1{font-size:2em;margin-top:0}
h2{font-size:1.5em}
h3{font-size:1.25em}
h4,h5,h6{font-size:1em}
p{margin:.75rem 0}
a{color:#5a32d8;text-decoration:underline;text-underline-offset:2px}
a:hover{opacity:.85}
code{
  font-family:ui-monospace,"SFMono-Regular",Menlo,Monaco,Consolas,monospace;
  font-size:.875em;background:#f4f4f5;padding:.15em .35em;border-radius:4px;
}
pre{
  background:#f4f4f5;border-radius:6px;padding:1rem 1.25rem;
  overflow-x:auto;line-height:1.5;
}
pre code{background:none;padding:0;font-size:.875em}
/* highlight.js token colours — GitHub Light */
.hljs{background:transparent}
.hljs-comment,.hljs-quote{color:#6a737d;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type{color:#d73a49}
.hljs-string,.hljs-attr,.hljs-template-tag{color:#032f62}
.hljs-number,.hljs-symbol{color:#005cc5}
.hljs-title,.hljs-title.function_,.hljs-section{color:#6f42c1}
.hljs-name,.hljs-tag{color:#22863a}
.hljs-built_in,.hljs-title.class_{color:#e36209}
.hljs-attribute,.hljs-variable,.hljs-meta{color:#e36209}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:bold}
blockquote{
  margin:1rem 0;padding:.5rem 1rem;
  border-left:4px solid #d1d5db;color:#555;
}
blockquote>*{margin:.35rem 0}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.95em}
th,td{border:1px solid #d1d5db;padding:.5rem .75rem;text-align:left}
th{background:#f4f4f5;font-weight:600}
tr:nth-child(even) td{background:#fafafa}
ul,ol{margin:.75rem 0;padding-left:1.75rem}
li{margin:.25rem 0}
img{max-width:100%;height:auto;display:block}
hr{border:none;border-top:1px solid #e5e7eb;margin:2rem 0}
.lede-export li:has(> input[type="checkbox"]){list-style:none;margin-left:-1.1em}
.lede-export input[type="checkbox"]{
  appearance:none;-webkit-appearance:none;
  width:15px;height:15px;margin:0 7px 0 0;vertical-align:-2px;
  border:1.5px solid #d1d5db;border-radius:4px;
  background:#fff;position:relative;cursor:default;
}
.lede-export input[type="checkbox"]:checked{background:#5a32d8;border-color:#5a32d8}
.lede-export input[type="checkbox"]:checked::after{
  content:"";position:absolute;left:4px;top:1px;
  width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;
  transform:rotate(45deg);
}
`.trim();

export function buildStandaloneHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapeTitle(title);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${safeTitle}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    `<body class="lede-export">${bodyHtml}</body>`,
    '</html>',
  ].join('\n');
}
