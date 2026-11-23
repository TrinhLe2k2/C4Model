#!/usr/bin/env python3
"""Chromium UI tests using an in-memory document fixture.

Does not navigate around an environment's file/HTTP restrictions. Actual app
HTML/CSS/JS is injected verbatim; localStorage is optionally a fixture. These
are UI/DOM tests, NOT proof that a user's browser permits file:// or persistence.
Usage: python bilingual/tests/ui_tests.py [output-directory]
Requires: pip install playwright; a Chromium executable, or playwright install chromium.
"""
from pathlib import Path
import re, json, os, shutil, base64, mimetypes, sys
from playwright.sync_api import sync_playwright
BASE=Path(__file__).resolve().parents[1]
ROOT=BASE.parent
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else BASE/'tests/results'
OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]

def check(name, condition, detail=None):
    record={'name':name,'passed':bool(condition)}
    if detail is not None: record['detail']=detail
    RESULTS.append(record)
    print(('PASS ' if condition else 'FAIL ')+name,flush=True)

def mount(page, storage=None, fallback=False):
    html=(BASE/'index.html').read_text(encoding='utf-8')
    html=html.replace('<head>','<head><base href="https://c4-reader.invalid/bilingual/index.html">')
    html=re.sub(r'<script[^>]+src="assets/[^\"]+"[^>]*></script>','',html)
    html=html.replace('<link rel="stylesheet" href="assets/reader.css">','<style>'+(BASE/'assets/reader.css').read_text(encoding='utf-8')+'</style>')
    page.route('**/*',lambda r:r.abort())
    page.set_content(html,wait_until='domcontentloaded')
    if storage is not None:
        page.evaluate('''data=>{const values={...data};Object.defineProperty(window,'localStorage',{value:{getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v)},removeItem:k=>{delete values[k]}}});window.__testStorage=values;}''',storage)
    if fallback: page.evaluate('window.Highlight=undefined')
    page.add_script_tag(content=(BASE/'assets/reader-data.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(BASE/'assets/reader.js').read_text(encoding='utf-8'))
    page.wait_for_timeout(100)

def route(page,path):
    page.evaluate('(p)=>{location.hash="/"+p}',path)
    page.wait_for_timeout(80)
    page.evaluate('document.querySelector("#rr-en-scroll").scrollTop=0')
    page.wait_for_timeout(80)

def hover(page,text):
    xy=page.evaluate('''text=>{const w=document.createTreeWalker(document.querySelector('#rr-en'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const at=n.textContent.indexOf(text);if(at<0)continue;const r=document.createRange();r.setStart(n,at+Math.min(2,text.length-1));r.setEnd(n,at+Math.min(3,text.length));const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}throw Error('missing '+text);}''',text)
    page.mouse.move(**xy);page.wait_for_timeout(55)
    return page.evaluate('C4ReaderDiagnostics()')

def load_images(page):
    sources=page.locator('#rr-en img,#rr-vi img').evaluate_all('(imgs)=>imgs.map(i=>i.src)')
    vals={}
    for src in set(sources):
        relative=src.removeprefix('https://c4-reader.invalid/')
        path=ROOT/relative
        if path.is_file():
            vals[src]='data:'+str(mimetypes.guess_type(str(path))[0] or 'image/png')+';base64,'+base64.b64encode(path.read_bytes()).decode()
    page.evaluate('vals=>document.querySelectorAll("#rr-en img,#rr-vi img").forEach(i=>{if(vals[i.src])i.src=vals[i.src]})',vals)
    page.wait_for_timeout(100)

DOM_SIGNATURE='''()=>{
 const p=C4_READER_DATA.pages.find(p=>p.path===C4ReaderDiagnostics().page), expected=document.createElement('div');expected.innerHTML=p.raw;
 if(p.toolsHtml)expected.querySelector('#toolsTable').innerHTML=p.toolsHtml;
 const sig=n=>n.nodeType===3?['text',n.textContent]:n.nodeType===8?['comment',n.textContent]:[n.nodeName,...[...n.childNodes].map(sig)];
 return JSON.stringify([...expected.childNodes].map(sig))===JSON.stringify([...document.querySelector('#rr-en').childNodes].map(sig));
}'''

with sync_playwright() as p:
    exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    launch={'headless':True}
    if exe: launch['executable_path']=exe
    browser=p.chromium.launch(**launch)
    browser_version=browser.version
    ctx=browser.new_context(viewport={'width':1500,'height':1050},device_scale_factor=1,accept_downloads=True)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    mount(page,{})
    paths=page.evaluate('C4_READER_DATA.pages.map(p=>p.path)')
    for path in paths:
        route(page,path)
        d=page.evaluate('C4ReaderDiagnostics()')
        check('Render and source DOM: '+path,d['page']==path and d['units']==d['expected'] and not d['errors'] and page.evaluate(DOM_SIGNATURE),d)
    check('No JavaScript exceptions on 24 pages',not errors,errors)
    route(page,'introduction.html');load_images(page)
    original=page.locator('#rr-en').inner_html()
    d=hover(page,'building industry')
    check('Hover locates authored phrase',d['active']['phrase']=='in the building industry')
    h=page.evaluate('Object.fromEntries([...CSS.highlights].map(([k,v])=>[k,[...v].map(r=>r.toString())]))')
    check('Vietnamese highlight matches intended phrase',h.get('rr-vietnamese')==['trong ngành xây dựng'],h)
    page.screenshot(path=str(OUT/'desktop-practice.png'),full_page=True)
    dims=[];positions=[]
    for text in ['building industry','visually communicate','software developer','software system','In contrast','building industry']:
        hover(page,text)
        dims.append(page.locator('.selection-dock').bounding_box())
        positions.append(page.evaluate('[document.querySelector("#rr-en-scroll").scrollTop,document.querySelector("#rr-vi-scroll").scrollTop]'))
    check('Hover does not resize or move dock',all(d==dims[0] for d in dims),dims)
    check('Hover does not auto-scroll either pane',all(d==positions[0] for d in positions),positions)
    page.locator('#rr-pin').click();hover(page,'software developer')
    check('Pinned phrase does not change on hover',page.evaluate('C4ReaderDiagnostics().active.phrase')=='in the building industry')
    page.keyboard.press('Escape')
    check('Escape clears pin and highlight',page.evaluate('!C4ReaderDiagnostics().pinned && !C4ReaderDiagnostics().active && !CSS.highlights.has("rr-english")'))
    hover(page,'software developer');page.locator('#rr-save').click();page.locator('#rr-save').click()
    check('Save context; duplicate ignored',page.evaluate('C4ReaderDiagnostics().words')==1)
    page.locator('button[data-mode=challenge]').click();hover(page,'building industry')
    check('Challenge does not leak hover translation',not page.evaluate('CSS.highlights.has("rr-vietnamese")') and 'đang ẩn' in page.locator('#rr-selected-vi').inner_text())
    page.locator('#rr-reveal').click()
    check('Explicit reveal displays target paragraph',page.locator('#rr-vi .vi-unit.is-revealed').count()==1 and 'trong ngành xây dựng' in page.locator('#rr-selected-vi').inner_text())
    page.locator('#rr-reset-reveals').click()
    check('Reset hides revealed paragraphs',page.locator('#rr-vi .vi-unit.is-revealed').count()==0)
    page.locator('button[data-mode=parallel]').click()
    check('Parallel mode selected',page.locator('body').get_attribute('data-mode')=='parallel')
    check('English HTML unchanged by learning actions',page.locator('#rr-en').inner_html()==original)
    page.screenshot(path=str(OUT/'desktop-parallel.png'),full_page=True)
    page.keyboard.press('Escape');page.keyboard.press('Shift+ArrowDown')
    check('Keyboard paragraph selection works',page.evaluate('C4ReaderDiagnostics().active.unit===0 && C4ReaderDiagnostics().pinned'))
    page.locator('#rr-sync').uncheck();page.evaluate('document.querySelector("#rr-en-scroll").scrollTop=500');page.wait_for_timeout(180)
    check('Scrolls independently when sync disabled',page.evaluate('document.querySelector("#rr-vi-scroll").scrollTop')<30)
    page.locator('#rr-sync').check();page.wait_for_timeout(240)
    pos=page.evaluate('[document.querySelector("#rr-en-scroll").scrollTop,document.querySelector("#rr-vi-scroll").scrollTop]')
    page.wait_for_timeout(400)
    pos2=page.evaluate('[document.querySelector("#rr-en-scroll").scrollTop,document.querySelector("#rr-vi-scroll").scrollTop]')
    check('Sync scroll maps blocks and settles',pos[1]>100 and max(abs(a-b) for a,b in zip(pos,pos2))<2,{'after':pos,'settled':pos2})
    page.locator('#rr-open-notebook').click()
    check('Notebook includes saved original context','ask a software developer' in page.locator('#rr-library-content').inner_text())
    page.locator('[data-library=review]').click()
    check('Review starts with answer hidden',page.locator('.flashcard .meaning').inner_text()=='')
    page.locator('.flashcard .primary-button').click()
    check('Review reveals answer on request',bool(page.locator('.flashcard .meaning').inner_text()))
    page.get_by_role('button',name='Đã nhớ',exact=True).click()
    page.locator('[data-library=glossary]').click();page.locator('#rr-library-search').fill('container diagram')
    check('Contextual glossary filters','sơ đồ container' in page.locator('#rr-library-content').inner_text())
    page.locator('#rr-library-search').fill('');page.locator('[data-library=saved]').click()
    with page.expect_download() as dl:
        page.locator('#rr-export').click()
    download=dl.value;target=OUT/'export-test.json';download.save_as(target)
    export=json.loads(target.read_text())
    check('Export contains original context and review status',export['format']=='c4-reader-v1' and len(export['words'])==1 and export['words'][0]['known'] and 'building industry' in export['words'][0]['context'])
    page.locator('#rr-import').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps(export).encode()});page.wait_for_timeout(100)
    check('Import skips duplicate vocabulary',page.evaluate('C4ReaderDiagnostics().words')==1)
    bad={'format':'c4-reader-v1','words':[{'en':'bad','vi':'test','page':'../../invalid.html','unit':0}]}
    page.locator('#rr-import').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(100)
    check('Import rejects unknown source page',page.evaluate('C4ReaderDiagnostics().words')==1 and 'Không nhập được' in page.locator('#rr-toast').inner_text())
    xss={'format':'c4-reader-v1','words':[{'en':'<img src=x onerror="window.__injected=1">','vi':'<b>text only</b>','page':'introduction.html','unit':1}]}
    page.locator('#rr-import').set_input_files({'name':'text.json','mimeType':'application/json','buffer':json.dumps(xss).encode()});page.wait_for_timeout(100)
    check('Imported text is not executable markup',page.evaluate('!window.__injected') and page.locator('#rr-library-content img').count()==0 and page.evaluate('C4ReaderDiagnostics().words')==2)
    page.locator('[data-close=rr-library]').click();page.wait_for_timeout(350)
    saved=page.evaluate('window.__testStorage')
    fresh=ctx.new_page();mount(fresh,saved)
    check('Serialized state restores (storage fixture)',fresh.evaluate('C4ReaderDiagnostics().words')==2)
    fresh.close()
    page.locator('a.nav-link[href="#/tooling/index.html"]').click();page.wait_for_timeout(100)
    check('Sidebar navigates internally',page.evaluate('C4ReaderDiagnostics().page')=='tooling/index.html')
    before=page.locator('#rr-en .toolingOption:not(.hidden)').count()
    page.locator('#rr-en input[value=Diagramming]').check();page.wait_for_timeout(50)
    after=page.locator('#rr-en .toolingOption:not(.hidden)').count()
    check('Original Tooling filter kept and synced',before>0 and after>0 and page.locator('#rr-vi input[value=Diagramming]').is_checked() and after==page.locator('#rr-vi .toolingOption:not(.hidden)').count(),{'Modelling':before,'Diagramming':after})
    route(page,'diagrams/container.html');page.locator('button[data-mode=parallel]').click();load_images(page)
    page.screenshot(path=str(OUT/'desktop-diagram.png'),full_page=True)
    route(page,'introduction.html');page.locator('button[data-mode=parallel]').click();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
    check('Mobile viewport does not overflow page',page.evaluate('document.documentElement.scrollWidth')==390)
    page.locator('#rr-menu').click()
    check('Mobile navigation opens',page.locator('#rr-sidebar').evaluate('(e)=>e.getBoundingClientRect().left')==0)
    page.locator('#rr-nav-backdrop').click(position={'x':300,'y':200})
    check('Mobile navigation closes',page.locator('#rr-sidebar').evaluate('(e)=>e.getBoundingClientRect().right')<=0)
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    fallback=ctx.new_page();mount(fallback,{},True);hover(fallback,'building industry')
    check('Old-browser fallback highlights without wrapping English',not fallback.evaluate('C4ReaderDiagnostics().highlightAPI') and fallback.locator('.fallback-highlight').count()>0 and fallback.evaluate(DOM_SIGNATURE))
    fallback.close()
    blocked=ctx.new_page();mount(blocked)
    check('Blocked storage still permits reading',not blocked.evaluate('C4ReaderDiagnostics().storageOK') and not blocked.evaluate('C4ReaderDiagnostics().errors'))
    blocked.close()
    check('No JavaScript exceptions during interactions',not errors,errors)
    browser.close()
report={'environment':{'browser':'Chromium '+browser_version,'method':'in-memory document with real application scripts; external requests blocked','storage':'test fixture except blocked-storage case','notValidated':['Actual file:// navigation','Live HTTP navigation','Real persistent storage on user browser','Installed English TTS voice audio']},'passed':sum(r['passed'] for r in RESULTS),'failed':sum(not r['passed'] for r in RESULTS),'checks':RESULTS}
(OUT/'ui-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed']},ensure_ascii=False))
sys.exit(1 if report['failed'] else 0)
