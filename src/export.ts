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
a{color:#0070f3;text-decoration:none}
a:hover{text-decoration:underline}
code{
  font-family:ui-monospace,"SFMono-Regular",Menlo,Monaco,Consolas,monospace;
  font-size:.875em;background:#f4f4f5;padding:.15em .35em;border-radius:4px;
}
pre{
  background:#f4f4f5;border-radius:6px;padding:1rem 1.25rem;
  overflow-x:auto;line-height:1.5;
}
pre code{background:none;padding:0;font-size:.875em}
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
