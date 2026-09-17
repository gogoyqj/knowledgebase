import type { VerifyResult, DiffResult, FixSuggestion } from '../types.js';

interface HTMLReportData {
  result: VerifyResult;
  fixSuggestions: FixSuggestion[];
  screenshot?: {
    figma: string; // base64 data URI
    dom: string;
    diff: string;
  };
  pixelResult?: {
    ssimScore: number;
    pixelMismatchRatio: number;
    mismatchRegions: Array<{ x: number; y: number; width: number; height: number; pixelCount: number }>;
  };
}

/**
 * Generate a self-contained HTML visualization report.
 * All CSS/JS is inlined — no external dependencies.
 */
export function generateHTMLReport(data: HTMLReportData): string {
  const { result, fixSuggestions, screenshot, pixelResult } = data;

  // Group diffs by node
  const diffsByNode = new Map<string, DiffResult[]>();
  for (const d of result.diffs) {
    if (!diffsByNode.has(d.nodeId)) diffsByNode.set(d.nodeId, []);
    diffsByNode.get(d.nodeId)!.push(d);
  }

  const failedDiffs = result.diffs.filter(d => !d.pass);
  const passedDiffs = result.diffs.filter(d => d.pass);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Figma UI Verification Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#333;line-height:1.6}
.container{max-width:1400px;margin:0 auto;padding:20px}
header{background:#fff;border-radius:12px;padding:24px 32px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
header h1{font-size:24px;font-weight:700;margin-bottom:4px}
header .subtitle{color:#666;font-size:14px}
.score-bar{display:flex;align-items:center;gap:16px;margin-top:16px}
.score-ring{position:relative;width:80px;height:80px}
.score-ring svg{transform:rotate(-90deg)}
.score-ring .value{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
.score-ring.pass .value{color:#22c55e}
.score-ring.fail .value{color:#ef4444}
.breakdown{display:flex;gap:12px;flex-wrap:wrap}
.breakdown .cat{background:#f8f9fa;border-radius:8px;padding:8px 16px;font-size:13px}
.breakdown .cat .label{color:#888;font-size:11px;text-transform:uppercase}
.breakdown .cat .val{font-weight:600;font-size:16px}
.tabs{display:flex;gap:4px;margin-bottom:16px}
.tabs button{padding:8px 20px;border:1px solid #e0e0e0;background:#fff;border-radius:8px 8px 0 0;cursor:pointer;font-size:14px;font-weight:500}
.tabs button.active{background:#fff;border-bottom-color:#fff;color:#2563eb}
.tab-content{display:none}
.tab-content.active{display:block}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.screenshot-viewer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.screenshot-panel{position:relative;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden}
.screenshot-panel .label{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.7);color:#fff;padding:2px 10px;border-radius:4px;font-size:12px;z-index:1}
.screenshot-panel img{width:100%;display:block}
.diff-list{max-height:600px;overflow-y:auto}
.diff-item{border:1px solid #e8e8e8;border-radius:8px;margin-bottom:8px;overflow:hidden}
.diff-item-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;background:#fafafa}
.diff-item-header:hover{background:#f0f0f0}
.diff-item-header .node-name{font-weight:600;font-size:14px}
.diff-item-header .node-id{color:#999;font-size:12px;margin-left:8px}
.diff-item-header .badge{padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.badge.fail{background:#fef2f2;color:#dc2626}
.badge.pass{background:#f0fdf4;color:#16a34a}
.diff-item-body{display:none;padding:12px 16px;border-top:1px solid #e8e8e8}
.diff-item.open .diff-item-body{display:block}
.prop-table{width:100%;border-collapse:collapse;font-size:13px}
.prop-table th{text-align:left;padding:6px 8px;background:#f8f9fa;color:#666;font-weight:500;border-bottom:1px solid #e8e8e8}
.prop-table td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
.prop-table .pass{color:#22c55e}
.prop-table .fail{color:#ef4444}
.fix-list .fix-item{padding:12px 16px;border:1px solid #e8e8e0;border-radius:8px;margin-bottom:8px}
.fix-item .property{font-weight:600;color:#2563eb}
.fix-item .arrow{color:#999;margin:0 8px}
.fix-item .expected{color:#22c55e}
.fix-item .actual{color:#ef4444;text-decoration:line-through}
.pixel-info{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.pixel-info .metric{background:#f8f9fa;border-radius:8px;padding:16px;text-align:center}
.pixel-info .metric .label{font-size:12px;color:#888}
.pixel-info .metric .value{font-size:24px;font-weight:700;margin-top:4px}
.mismatch-regions{position:absolute;top:0;left:0;width:100%;height:100%}
.mismatch-regions .region{position:absolute;border:2px solid #ef4444;background:rgba(239,68,68,.15)}
</style>
</head>
<body>
<div class="container">
<header>
  <h1>Figma UI Verification Report</h1>
  <div class="subtitle">Generated ${new Date().toLocaleString('zh-CN')}</div>
  <div class="score-bar">
    <div class="score-ring ${result.passed ? 'pass' : 'fail'}">
      <svg width="80" height="80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#e8e8e8" stroke-width="6"/>
        <circle cx="40" cy="40" r="36" fill="none" stroke="${result.passed ? '#22c55e' : '#ef4444'}" stroke-width="6"
          stroke-dasharray="${2 * Math.PI * 36}" stroke-dashoffset="${2 * Math.PI * 36 * (1 - result.score / 100)}" stroke-linecap="round"/>
      </svg>
      <div class="value">${result.score}</div>
    </div>
    <div>
      <div style="font-size:14px;color:#666">Threshold: ${result.threshold} | ${result.passed ? '✅ PASSED' : '❌ FAILED'}</div>
      <div class="breakdown">
        ${Object.entries(result.breakdown).map(([cat, info]) => `
          <div class="cat">
            <div class="label">${formatCategory(cat)}</div>
            <div class="val">${info.score}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
</header>

<div class="tabs">
  <button class="active" onclick="switchTab('screenshots')">📸 Screenshots</button>
  <button onclick="switchTab('diffs')">🔍 Diffs (${failedDiffs.length} failed)</button>
  <button onclick="switchTab('fixes')">🔧 Fix Suggestions (${fixSuggestions.length})</button>
  <button onclick="switchTab('summary')">📊 Summary</button>
</div>

<div id="tab-screenshots" class="tab-content active">
  ${screenshot ? `
  <div class="card">
    <div class="screenshot-viewer">
      <div class="screenshot-panel">
        <div class="label">Figma Design</div>
        <img src="${screenshot.figma}" alt="Figma design"/>
      </div>
      <div class="screenshot-panel">
        <div class="label">DOM Screenshot</div>
        <img src="${screenshot.dom}" alt="DOM screenshot"/>
      </div>
      <div class="screenshot-panel">
        <div class="label">Pixel Diff</div>
        <img src="${screenshot.diff}" alt="Pixel diff"/>
        ${pixelResult ? `
        <div class="mismatch-regions">
          ${pixelResult.mismatchRegions.map(r => `
            <div class="region" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px"></div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
    ${pixelResult ? `
    <div class="pixel-info">
      <div class="metric">
        <div class="label">SSIM Score</div>
        <div class="value" style="color:${pixelResult.ssimScore >= 0.95 ? '#22c55e' : '#ef4444'}">${pixelResult.ssimScore.toFixed(4)}</div>
      </div>
      <div class="metric">
        <div class="label">Pixel Mismatch</div>
        <div class="value" style="color:${pixelResult.pixelMismatchRatio < 0.05 ? '#22c55e' : '#ef4444'}">${(pixelResult.pixelMismatchRatio * 100).toFixed(2)}%</div>
      </div>
    </div>
    ` : ''}
  </div>
  ` : '<div class="card"><p style="color:#888">No screenshots available. Use --screenshot flag to capture.</p></div>'}
</div>

<div id="tab-diffs" class="tab-content">
  <div class="card">
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button onclick="filterDiffs('all')" style="padding:4px 12px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;background:#2563eb;color:#fff">All (${result.diffs.length})</button>
      <button onclick="filterDiffs('fail')" style="padding:4px 12px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer">Failed (${failedDiffs.length})</button>
      <button onclick="filterDiffs('pass')" style="padding:4px 12px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer">Passed (${passedDiffs.length})</button>
      <button onclick="filterDiffs('missing')" style="padding:4px 12px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer">Missing (${result.missing_nodes})</button>
    </div>
    <div class="diff-list" id="diff-list">
      ${renderDiffList(diffsByNode)}
      ${result.missing.length > 0 ? `
        <div class="diff-item open">
          <div class="diff-item-header">
            <span><span class="node-name">Missing Nodes</span></span>
            <span class="badge fail">${result.missing.length} missing</span>
          </div>
          <div class="diff-item-body">
            <table class="prop-table">
              <tr><th>Node ID</th><th>Name</th><th>Type</th><th>Size</th></tr>
              ${result.missing.map(n => `
                <tr><td>${n.id}</td><td>${n.name}</td><td>${n.type}</td><td>${n.width}×${n.height}</td></tr>
              `).join('')}
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  </div>
</div>

<div id="tab-fixes" class="tab-content">
  <div class="card">
    ${fixSuggestions.length > 0 ? `
    <div class="fix-list">
      ${fixSuggestions.map(fix => `
        <div class="fix-item">
          <div style="margin-bottom:6px">
            <span class="property">${fix.property}</span>
            <span class="arrow">→</span>
            <span class="actual">${fix.actualPx}</span>
            <span class="arrow">→</span>
            <span class="expected">${fix.expectedPx}</span>
          </div>
          <div style="font-size:12px;color:#666">${fix.nodeName} (${fix.nodeId})</div>
          <div style="font-size:13px;margin-top:4px">${fix.fix}</div>
        </div>
      `).join('')}
    </div>
    ` : '<p style="color:#888">No fix suggestions. All properties within tolerance.</p>'}
  </div>
</div>

<div id="tab-summary" class="tab-content">
  <div class="card">
    <table class="prop-table">
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Figma Nodes</td><td>${result.total_nodes}</td></tr>
      <tr><td>Matched Nodes</td><td>${result.total_nodes - result.missing_nodes}</td></tr>
      <tr><td>Missing Nodes</td><td class="fail">${result.missing_nodes}</td></tr>
      <tr><td>Extra DOM Nodes</td><td class="fail">${result.extra_nodes}</td></tr>
      <tr><td>Total Diffs</td><td>${result.diffs.length}</td></tr>
      <tr><td>Failed Diffs</td><td class="fail">${failedDiffs.length}</td></tr>
      <tr><td>Passed Diffs</td><td class="pass">${passedDiffs.length}</td></tr>
      ${pixelResult ? `
        <tr><td>SSIM Score</td><td>${pixelResult.ssimScore.toFixed(4)}</td></tr>
        <tr><td>Pixel Mismatch</td><td>${(pixelResult.pixelMismatchRatio * 100).toFixed(2)}%</td></tr>
      ` : ''}
    </table>
  </div>
  ${result.viewport_scores ? `
  <div class="card">
    <h3 style="margin-bottom:12px">Viewport Scores</h3>
    <table class="prop-table">
      <tr><th>Viewport</th><th>Score</th><th>SSIM</th><th>Pixel Diff</th></tr>
      ${Object.entries(result.viewport_scores).map(([vp, info]) => `
        <tr>
          <td>${vp}px</td>
          <td>${info.score}</td>
          <td>${info.ssim ?? '—'}</td>
          <td>${info.pixel_diff ?? '—'}</td>
        </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}
</div>

</div>
<script>
function switchTab(name){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  event.target.classList.add('active');
}
function filterDiffs(filter){
  document.querySelectorAll('.diff-item').forEach(item=>{
    if(filter==='all'){item.style.display='';return}
    const badge=item.querySelector('.badge');
    if(!badge)return;
    item.style.display=badge.classList.contains(filter)?'':'none';
  });
}
document.querySelectorAll('.diff-item-header').forEach(h=>{
  h.addEventListener('click',()=>h.parentElement.classList.toggle('open'));
});
</script>
</body>
</html>`;
}

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    completeness: 'Completeness',
    position_size: 'Position/Size',
    color_style: 'Color/Style',
    typography: 'Typography',
    layout_properties: 'Layout',
  };
  return map[cat] ?? cat;
}

function renderDiffList(diffsByNode: Map<string, DiffResult[]>): string {
  let html = '';
  for (const [nodeId, diffs] of diffsByNode) {
    const failed = diffs.filter(d => !d.pass);
    if (failed.length === 0) continue;

    const firstName = diffs[0]?.nodeName ?? nodeId;
    html += `
      <div class="diff-item">
        <div class="diff-item-header">
          <span>
            <span class="node-name">${firstName}</span>
            <span class="node-id">${nodeId}</span>
          </span>
          <span class="badge fail">${failed.length} failed</span>
        </div>
        <div class="diff-item-body">
          <table class="prop-table">
            <tr><th>Property</th><th>Category</th><th>Expected</th><th>Actual</th><th>Status</th></tr>
            ${diffs.map(d => `
              <tr>
                <td>${d.property}</td>
                <td>${formatCategory(d.category)}</td>
                <td>${formatValue(d.expected)}</td>
                <td>${formatValue(d.actual)}</td>
                <td class="${d.pass ? 'pass' : 'fail'}">${d.pass ? '✓' : '✗'}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
  }
  return html;
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}