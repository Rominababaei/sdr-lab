"""Build the GitHub Pages site without changing the supplied report content."""
from pathlib import Path
from bs4 import BeautifulSoup
import html
import json
import posixpath
import shutil
from urllib.parse import urlsplit, urljoin, urldefrag
from lab00_fa import translate

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'docs'
CATALOG=json.loads((ROOT/'catalog.json').read_text())
DOCS={d['id']:{**d,'number':exp['number'],'experiment_title':exp['title']} for exp in CATALOG['experiments'] for d in exp['documents']}
NUMBERS=str.maketrans('0123456789','۰۱۲۳۴۵۶۷۸۹')

def fa(value):return str(value).translate(NUMBERS)

def fragment(markup):
    return BeautifulSoup(markup,'html.parser')

def header(prefix='',current=None):
    links=''.join(f'<li><a href="{prefix}reports/{key}/index.html"'+(' aria-current="page"' if current==key else '')+f'>{html.escape(doc["label"])} آزمایش {fa(doc["number"])}</a></li>' for key,doc in DOCS.items())
    return f'''<header class="hub-header" id="top" data-hub-shell>
      <div class="hub-header-inner"><a class="hub-brand" href="{prefix}index.html"><img src="{prefix}assets/mark.svg" width="42" height="42" alt=""><span>آزمایشگاه رادیوی نرم‌افزار<small lang="en" dir="ltr">SOFTWARE DEFINED RADIO</small></span></a>
      <nav class="hub-top-nav" aria-label="پیمایش آزمایشگاه"><a href="{prefix}index.html#archive">آرشیو آزمایش‌ها</a><a href="{prefix}index.html#team">اعضای گروه</a><details class="hub-switch"><summary>گزارش‌ها</summary><ul>{links}</ul></details></nav></div></header>'''

ICONS={
'setup':'<rect x="7" y="8" width="34" height="24" rx="2"/><path d="M18 40h12m-6-8v8M14 20l5 5 11-12"/>',
'spectrum':'<path d="M5 40h38M7 37V8M10 31l5-2 4-18 5 25 6-16 4 10 8 2"/><path d="M12 39v-3m10 3v-3m10 3v-3m10 3v-3"/>',
'rf':'<path d="M24 39V23m-9 17h18M24 23l-6 17m6-17 6 17"/><circle cx="24" cy="18" r="2.5"/><path d="M17 11a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M12 6a17 17 0 0 0 0 24M36 6a17 17 0 0 1 0 24"/>'
}

def experiments():
    blocks=[]
    for exp in CATALOG['experiments']:
        cards=[]
        for doc in exp['documents']:
            pdf=''
            if doc.get('pdf'):
                pdf=f'<div class="hub-pdf-actions"><a href="{html.escape(doc["pdf"])}" target="_blank" rel="noopener">مشاهدهٔ PDF</a><a href="{html.escape(doc["pdf"])}" download>دانلود PDF</a></div>'
            cards.append(f'''<div class="hub-document" data-type="{doc['type']}"><span class="hub-document-kind" lang="en" dir="ltr">{'PRE-LAB' if doc['type']=='prelab' else 'LAB REPORT'}</span><a class="hub-document-link" href="reports/{doc['id']}/index.html">{doc['label']}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/></svg></a>{pdf}</div>''')
        blocks.append(f'''<article class="hub-experiment" data-search="{html.escape(exp['keywords'])}"><div class="hub-lab-mark" aria-hidden="true"><svg viewBox="0 0 48 48">{ICONS[exp['icon']]}</svg></div><div class="hub-experiment-info"><p class="hub-experiment-label">آزمایش {fa(exp['number'])}</p><h3 class="hub-experiment-title">{exp['title']}</h3><p class="hub-experiment-topic">{exp['topic']}</p></div><div class="hub-documents">{''.join(cards)}</div></article>''')
    return '\n'.join(blocks)

def build():
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT/'assets/fonts').mkdir(parents=True,exist_ok=True)
    for font in (ROOT/'sources/lab01-prelab/fonts').glob('*.woff2'):
        shutil.copy2(font,OUTPUT/'assets/fonts'/font.name)
    for asset in (ROOT/'assets-src').iterdir():
        if asset.is_file():shutil.copy2(asset,OUTPUT/'assets'/asset.name)
    home=(ROOT/'templates/index.html').read_text().replace('{{HEADER}}',header()).replace('{{EXPERIMENTS}}',experiments())
    home=home.replace('{{EXPERIMENT_COUNT}}',fa(len(CATALOG['experiments']))).replace('{{DOCUMENT_COUNT}}',fa(len(DOCS)))
    (OUTPUT/'index.html').write_text(home)
    for key,docinfo in DOCS.items():
        source=ROOT/'sources'/key
        target=OUTPUT/'reports'/key
        shutil.copytree(source,target,dirs_exist_ok=True)
        (target/'_source-manifest.json').unlink(missing_ok=True)
        original_origin=json.loads((source/'_source-manifest.json').read_text())['origin']
        for original in source.rglob('*.html'):
            relative=original.relative_to(source)
            destination=target/relative
            doc=BeautifulSoup(original.read_text(),'html.parser')
            if key=='lab00-report':
                mapping=translate(doc)
                (ROOT/'sources/lab00-translation.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2))
                metadata={
                  'description':'گزارش آزمایش صفر آزمایشگاه رادیوی نرم‌افزار، تهیه‌شده توسط Romina Babaei و Seyed Mohammad Mahdi Mousavi: نتایج گیرنده در MATLAB، GNU Radio، Ubuntu و Python.',
                  'og:title':'آزمایشگاه SDR، آزمایش صفر — آماده‌سازی محیط و ابزارها',
                  'og:description':'گزارش آزمایشگاه · Romina Babaei و Seyed Mohammad Mahdi Mousavi · راه‌اندازی ADALM-Pluto و روش‌های دریافت.'
                }
                for tag in doc.select('meta[name],meta[property]'):
                    name=tag.get('name') or tag.get('property')
                    if name in metadata:tag['content']=metadata[name]
            prefix=posixpath.relpath('.',str(Path('reports')/key/relative.parent))+'/'
            url='https://rominababaei.github.io/sdr-lab/reports/'+key+'/'+relative.as_posix()
            for tag in doc.select('link[rel=canonical]'):tag['href']=url
            for tag in doc.select('meta[property="og:url"]'):tag['content']=url
            for tag in doc.find_all(True):
                # Keep all local paths and anchors, including multi-page reports.
                for attr in ('href','src','data-image','data-full'):
                    value=tag.get(attr)
                    if value and value.startswith(original_origin):
                        tail=value[len(original_origin):]
                        tag[attr]=posixpath.relpath(tail or 'index.html',relative.parent.as_posix())
            for asset in ('hub.css','report-theme.css'):
                tag=doc.new_tag('link',rel='stylesheet',href=prefix+'assets/'+asset)
                doc.head.append(tag)
            tag=doc.new_tag('script',src=prefix+'assets/hub.js',defer='')
            doc.head.append(tag)
            body=doc.body
            body['data-report']=key
            wrapper=doc.new_tag('div',attrs={'class':'original-report'})
            for node in list(body.contents):wrapper.append(node.extract())
            # Avoid duplicating an existing 'top' id inside the report.
            shell=header(prefix,key).replace(' id="top"','')
            body.append(fragment(shell))
            crumbs=f'''<nav class="hub-crumbs" aria-label="مسیر صفحه" data-hub-shell><a href="{prefix}index.html#archive">آرشیو آزمایش‌ها</a><span class="hub-crumb-divider" aria-hidden="true"></span><span>آزمایش {fa(docinfo['number'])}</span><span class="hub-crumb-divider" aria-hidden="true"></span><span>{docinfo['label']}</span></nav>'''
            body.append(fragment(crumbs))
            body.append(wrapper)
            destination.write_text(str(doc))
        if key=='lab00-report':
            js=(target/'app.js').read_text()
            for a,b in {
              'Code copied to clipboard.':'کد در کلیپ‌بورد کپی شد.',
              'Code selected. Use your keyboard to copy it.':'کد انتخاب شد. برای کپی از صفحه‌کلید استفاده کنید.',
              'Copy code':'کپی کد','Copied':'کپی شد','Select code':'انتخاب کد',
              'Zoom to original':'بزرگ‌نمایی تا اندازهٔ اصلی','Fit to screen':'اندازهٔ متناسب با صفحه'
            }.items():js=js.replace('"'+a+'"','"'+b+'"')
            (target/'app.js').write_text(js)
    (OUTPUT/'.nojekyll').touch()
    print(f'Built {len(DOCS)} reports in docs/ for GitHub Pages.')

if __name__=='__main__':build()
