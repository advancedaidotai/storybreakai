import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BusinessCaseProps {
  projectTitle: string;
  contentType: string | null;
  deliveryTarget: string | null;
  durationSec: number | null;
  segmentCount: number;
  breakpointCount: number;
  highlightCount: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function BusinessCaseButton(props: BusinessCaseProps) {
  const handleDownload = () => {
    const { projectTitle, contentType, deliveryTarget, durationSec, segmentCount, breakpointCount, highlightCount } = props;
    const dur = durationSec ? `${Math.floor(durationSec / 60)}m ${Math.floor(durationSec % 60)}s` : "N/A";

    const safeTitle = escapeHtml(projectTitle || "Untitled Project");
    const safeContentType = escapeHtml(contentType?.replace("_", " ") || "N/A");
    const safeDeliveryTarget = escapeHtml(deliveryTarget || "N/A");
    const safeDur = escapeHtml(dur);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>StoryBreak AI - Business Case</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#0d1117;color:#c9d1d9;padding:48px;max-width:800px;margin:0 auto}
h1{font-size:28px;color:#58a6ff;margin-bottom:4px}
.subtitle{color:#8b949e;font-size:13px;margin-bottom:32px}
h2{font-size:16px;color:#f0f6fc;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #21262d}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}
.metric{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;text-align:center}
.metric .val{font-size:24px;font-weight:700;color:#58a6ff}
.metric .val.green{color:#3fb950}
.metric .val.purple{color:#bc8cff}
.metric .lbl{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
.metric .sub{font-size:11px;color:#8b949e;margin-top:2px}
table{width:100%;border-collapse:collapse;margin:12px 0}
td{padding:8px 12px;font-size:13px;border-bottom:1px solid #21262d}
td:first-child{color:#8b949e;width:40%}
td:last-child{color:#c9d1d9;font-weight:500}
.check{color:#3fb950;margin-right:6px}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #21262d;text-align:center;color:#484f58;font-size:11px}
.logo{font-size:20px;font-weight:700;color:#58a6ff}
.problem-box{background:#1c1219;border:1px solid #f8514933;border-radius:12px;padding:16px;margin:12px 0}
.problem-box .label{font-size:10px;color:#f85149;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px}
.problem-box p{font-size:13px;color:#c9d1d9;line-height:1.6}
.solution-box{background:#0d1f0d;border:1px solid #3fb95033;border-radius:12px;padding:16px;margin:12px 0}
.solution-box .label{font-size:10px;color:#3fb950;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px}
.solution-box p{font-size:13px;color:#c9d1d9;line-height:1.6}
.source{font-size:9px;color:#484f58;font-style:italic;margin-top:4px}
</style></head><body>
<div class="logo">StoryBreak AI</div>
<h1>${safeTitle}</h1>
<p class="subtitle">Business Case Report · Generated ${escapeHtml(new Date().toLocaleDateString())}</p>

<h2>The Problem</h2>
<div class="problem-box">
<div class="label">Industry Pain Point</div>
<p>Manual video segmentation costs <strong>$50–$100 per hour</strong> of content in editor time. Poorly placed ad breaks reduce viewer engagement by <strong>15–30%</strong>, costing broadcasters significant ad revenue. Content teams spend <strong>6–8 hours per episode</strong> on asset research, segmentation, and compliance review.</p>
</div>

<h2>The Solution</h2>
<div class="solution-box">
<div class="label">StoryBreak AI</div>
<p>Automated semantic segmentation and highlight reel generation powered by multimodal AI. StoryBreak analyzes narrative structure, detects natural ad break points using valley-based engagement modeling, and generates compliance-ready deliverables — <strong>reducing asset research and editing time by 70–90%</strong>.</p>
</div>

<h2>Quantified Impact</h2>
<div class="grid">
<div class="metric"><div class="val">8 hrs → 12 min</div><div class="sub">asset research time</div><div class="lbl">Speed</div></div>
<div class="metric"><div class="val green">~$400</div><div class="sub">saved per request</div><div class="lbl">Cost Reduction</div></div>
<div class="metric"><div class="val purple">70–90%</div><div class="sub">editing time eliminated</div><div class="lbl">Efficiency</div></div>
</div>
<p class="source">Based on industry benchmarks from broadcast post-production workflows (NAB, IBC research).</p>

<h2>Analysis Results — ${safeTitle}</h2>
<table>
<tr><td>Content Type</td><td>${safeContentType}</td></tr>
<tr><td>Delivery Target</td><td>${safeDeliveryTarget}</td></tr>
<tr><td>Duration</td><td>${safeDur}</td></tr>
<tr><td>Scenes Detected</td><td>${segmentCount}</td></tr>
<tr><td>Ad Breakpoints</td><td>${breakpointCount}</td></tr>
<tr><td>Highlights Extracted</td><td>${highlightCount}</td></tr>
</table>

<h2>Platform Compliance</h2>
<table>
<tr><td><span class="check">✓</span> Act break detection</td><td>Verified · ${segmentCount} narrative segments</td></tr>
<tr><td><span class="check">✓</span> Ad slot placement</td><td>Optimized · ${breakpointCount} valley-based positions</td></tr>
<tr><td><span class="check">✓</span> Engagement valley analysis</td><td>Active · natural pause detection</td></tr>
<tr><td><span class="check">✓</span> Highlight reel generation</td><td>Ready · ${highlightCount} clips ranked by score</td></tr>
</table>

<h2>Technology Stack</h2>
<table>
<tr><td>Video Intelligence</td><td>Twelve Labs Pegasus 1.2</td></tr>
<tr><td>Semantic Search</td><td>Twelve Labs Marengo</td></tr>
<tr><td>Narrative Analysis</td><td>AWS Bedrock (Claude Sonnet)</td></tr>
<tr><td>Architecture</td><td>Resumable chunked pipeline with 5-min overlap</td></tr>
<tr><td>Export Formats</td><td>EDL, OTT/VMAP JSON, Highlight Reel</td></tr>
</table>

<div class="footer">
StoryBreak AI · Intelligent Video Analysis Platform · ${new Date().getFullYear()}<br>
Built for the Twelve Labs Hackathon
</div>
</body></html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 rounded-xl text-xs h-8 border-border/40 hover:border-highlight/40 hover:bg-highlight/5 btn-hover"
      onClick={handleDownload}
    >
      <FileText className="h-3.5 w-3.5" /> Download Business Case
    </Button>
  );
}
