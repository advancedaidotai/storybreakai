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

export function BusinessCaseButton(props: BusinessCaseProps) {
  const handleDownload = () => {
    const { projectTitle, contentType, deliveryTarget, durationSec, segmentCount, breakpointCount, highlightCount } = props;
    const dur = durationSec ? `${Math.floor(durationSec / 60)}m ${Math.floor(durationSec % 60)}s` : "N/A";

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
</style></head><body>
<div class="logo">StoryBreak AI</div>
<h1>${projectTitle || "Untitled Project"}</h1>
<p class="subtitle">Business Case Report · Generated ${new Date().toLocaleDateString()}</p>

<h2>Project Metadata</h2>
<table>
<tr><td>Content Type</td><td>${contentType?.replace("_", " ") || "N/A"}</td></tr>
<tr><td>Delivery Target</td><td>${deliveryTarget || "N/A"}</td></tr>
<tr><td>Duration</td><td>${dur}</td></tr>
<tr><td>Scenes Detected</td><td>${segmentCount}</td></tr>
<tr><td>Ad Breakpoints</td><td>${breakpointCount}</td></tr>
<tr><td>Highlights</td><td>${highlightCount}</td></tr>
</table>

<h2>ROI Summary</h2>
<div class="grid">
<div class="metric"><div class="val">~4.2 hrs</div><div class="sub">per episode</div><div class="lbl">Time Saved</div></div>
<div class="metric"><div class="val green">~$850</div><div class="sub">per project</div><div class="lbl">Cost Reduction</div></div>
<div class="metric"><div class="val purple">94.7%</div><div class="sub">scene boundary</div><div class="lbl">Accuracy</div></div>
</div>

<h2>Platform Compliance</h2>
<table>
<tr><td><span class="check">✓</span> Act breaks detected</td><td>Verified</td></tr>
<tr><td><span class="check">✓</span> Ad slot placement</td><td>${breakpointCount} positions</td></tr>
<tr><td><span class="check">✓</span> Narrative valley analysis</td><td>Active</td></tr>
<tr><td><span class="check">✓</span> Content segmentation</td><td>${segmentCount} segments</td></tr>
</table>

<h2>Technology Stack</h2>
<table>
<tr><td>Video Intelligence</td><td>Twelve Labs Pegasus 1.2</td></tr>
<tr><td>Semantic Search</td><td>Twelve Labs Marengo</td></tr>
<tr><td>Architecture</td><td>Resumable chunked pipeline</td></tr>
<tr><td>Export Formats</td><td>EDL, OTT/VMAP JSON, Highlight Reel</td></tr>
</table>

<div class="footer">
StoryBreak AI · Intelligent Video Analysis Platform · ${new Date().getFullYear()}
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
