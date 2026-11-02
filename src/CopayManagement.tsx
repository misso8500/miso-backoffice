import prototype from '../docs/prototypes/copay-review.html?raw';
import companySeal from '../docs/prototypes/assets/copay-company-seal.png?url';
import runtime from './copay-runtime.js?raw';
import {requestJson} from './storage';
import './copay-management.css';
import pageHeadingCss from './PageHeading.css?raw';
import { useEffect, useRef } from 'react';
import type { CopayRecipientRequest } from './lib/copay-recipient';
import recipientLinkCss from './copay-recipient.css?raw';

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
  .replace('<header class="heading">', '<header class="page-heading workspace-page-heading">')
  .replace('<span class="eyebrow">RECIPIENT PAYMENTS</span>', '')
  .replace("new URL('./assets/copay-company-seal.png',document.baseURI).href", JSON.stringify(companySeal))
  .replace('</head>', `<style>
    ${pageHeadingCss}
    ${recipientLinkCss}
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
  onBusy: (busy: boolean)=>void,
  onRecipient: (row: CopayRecipientRequest)=>void
)=>void; copayRefreshRecipients?: ()=>void };

export default function CopayManagement({onDirty,onBusy,onRecipient,recipientRevision=0,active=true}:{onDirty:(dirty:boolean)=>void;onBusy:(busy:boolean)=>void;onRecipient:(row:CopayRecipientRequest)=>void;recipientRevision?:number;active?:boolean}) {
  const frame=useRef<HTMLIFrameElement>(null),recipientHandler=useRef(onRecipient);
  recipientHandler.current=onRecipient;
  useEffect(()=>{if(active)(frame.current?.contentWindow as CopayFrameWindow|null)?.copayRefreshRecipients?.();},[recipientRevision,active]);
  return <iframe
    ref={frame}
    className="copay-management-frame"
    title="본인부담금 관리"
    srcDoc={documentHtml}
    onLoad={event=>(event.currentTarget.contentWindow as CopayFrameWindow|null)?.copayStart?.(requestJson,onDirty,onBusy,row=>recipientHandler.current(row))}
  />;
}
