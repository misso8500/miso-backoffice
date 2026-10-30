import prototype from '../docs/prototypes/copay-review.html?raw';
import companySeal from '../docs/prototypes/assets/copay-company-seal.png?url';
import runtime from './copay-runtime.js?raw';
import {requestJson} from './storage';
import './copay-management.css';

// Reuse the reviewed forms while keeping their document/print styles isolated
// from the application shell. Vite bundles both the HTML and the seal asset.
const documentHtml = prototype
  .replace(/(<script[^>]*id="source-data"[^>]*>)[\s\S]*?(<\/script>)/, '$1[]$2')
  .replace('focusId=source[0].id', 'focusId=source[0]?.id')
  .replaceAll('${r.name}', '${esc(r.name)}')
  .replaceAll('${row.name}', '${esc(row.name)}')
  .replace('시안 · 수급자명 가명 · 제공한 예시의 인영 사용', '')
  .replaceAll('시안 출력물', '저장 자료 기준')
  .replace('실제 수납일 8자리', '실제 수납일')
  .replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, '')
  .replace('<h1>본인부담금</h1>', '<h1>본인부담금 관리</h1>')
  .replace("new URL('./assets/copay-company-seal.png',document.baseURI).href", JSON.stringify(companySeal))
  .replace('</head>', `<style>
    .shell{display:block;min-height:0}
    .main{width:100%;max-width:none;margin:0;padding:0 0 24px;min-width:0}
    body{background:#f7f6f9}
    #copay-status:not(:empty),#copay-import-error:not(:empty){padding:12px;margin:12px 0;background:#f0eaf8;border-radius:8px;color:#754e83;white-space:pre-wrap}
    @media(max-width:720px){.main{padding:0 0 20px}}
  </style></head>`)
  .replace(/;render\(\);\s*<\/script><\/body>/, ';\n'+runtime+'\n</script></body>');

type CopayFrameWindow = Window & {copayStart?: (
  api: typeof requestJson,
  onDirty: (dirty: boolean)=>void,
  onBusy: (busy: boolean)=>void
)=>void};

export default function CopayManagement({onDirty,onBusy}:{onDirty:(dirty:boolean)=>void;onBusy:(busy:boolean)=>void}) {
  return <iframe
    className="copay-management-frame"
    title="본인부담금 관리"
    srcDoc={documentHtml}
    onLoad={event=>(event.currentTarget.contentWindow as CopayFrameWindow|null)?.copayStart?.(requestJson,onDirty,onBusy)}
  />;
}
