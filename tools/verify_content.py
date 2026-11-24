"""Check source preservation and internal links before GitHub publication."""
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import unquote,urlsplit
import hashlib,json,re

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'docs'

def normalised_text(node):
    clone=BeautifulSoup(str(node),'html.parser')
    for tag in clone(['script','style']):tag.decompose()
    return re.sub(r'\s+',' ',clone.get_text()).strip()

def code_blocks(doc):return [tag.get_text() for tag in doc.select('pre')]

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def check():
    results=[];errors=[];assets=0
    for manifest in sorted((ROOT/'sources').glob('*/_source-manifest.json')):
        info=json.loads(manifest.read_text());key=info['id']
        for entry in info['files']:
            src=manifest.parent/entry['path'];dst=OUTPUT/'reports'/key/entry['path']
            assert sha(src)==entry['sha256'],f'Archived source changed: {src}'
            if src.suffix=='.html':
                before=BeautifulSoup(src.read_text(),'html.parser')
                after=BeautifulSoup(dst.read_text(),'html.parser')
                content=after.select_one('.original-report')
                assert content is not None,dst
                assert code_blocks(before)==code_blocks(content),f'Code changed: {dst}'
                counts={tag:len(before.select(tag)) for tag in ['table','img','figure','pre','math','svg']}
                assert counts=={tag:len(content.select(tag)) for tag in counts},f'Content structure changed: {dst}'
                if key!='lab00-report':
                    assert normalised_text(before.body)==normalised_text(content),f'Persian text changed: {dst}'
                    mode='exact Persian text match'
                else:
                    # Formulas and source code are retained literally during translation.
                    for cls in ['.equation','.calculation']:
                        assert [normalised_text(t) for t in before.select(cls)]==[normalised_text(t) for t in content.select(cls)],f'Formula changed: {dst}'
                    original_cells=before.select('td');translated_cells=content.select('td')
                    for a,b in zip(original_cells,translated_cells):
                        assert re.findall(r'\d+(?:[.,]\d+)*',a.get_text())==re.findall(r'\d+(?:[.,]\d+)*',b.get_text()),f'Table values changed: {a.get_text()} / {b.get_text()}'
                    mode='Persian translation; code, formulas and table numbers preserved'
                results.append({'page':str(dst.relative_to(OUTPUT)),'verification':mode,'text_sha256':hashlib.sha256(normalised_text(content).encode()).hexdigest(),**counts})
            elif not(key=='lab00-report' and entry['path']=='app.js'):
                assert sha(dst)==entry['sha256'],f'Original asset changed: {dst}'
                assets+=1
    for file in OUTPUT.rglob('*.html'):
        soup=BeautifulSoup(file.read_text(),'html.parser')
        for tag in soup.find_all(True):
            for attr in ('href','src','data-image','data-full'):
                value=tag.get(attr)
                if not value or value.startswith(('data:','mailto:','tel:','javascript:')):continue
                url=urlsplit(value)
                if url.scheme or url.netloc:continue
                target=(file.parent/unquote(url.path)).resolve() if url.path else file
                if target.is_dir():target=target/'index.html'
                if not target.exists():errors.append(f'{file.relative_to(OUTPUT)}: missing {value}')
                elif url.fragment and target.suffix=='.html':
                    dest=soup if target==file else BeautifulSoup(target.read_text(),'html.parser')
                    if not dest.find(id=unquote(url.fragment)) and not dest.find(attrs={'name':unquote(url.fragment)}):
                        errors.append(f'{file.relative_to(OUTPUT)}: missing anchor {value}')
    for file in OUTPUT.rglob('*.css'):
        for value in re.findall(r'''url\([\s'"]*([^'"\s)]+)''',file.read_text()):
            if value.startswith(('data:','http:','https:')):continue
            if not(file.parent/unquote(value.split('?')[0].split('#')[0])).exists():errors.append(f'{file.relative_to(OUTPUT)}: missing CSS asset {value}')
    audit={'reports':5,'pages':len(results),'unchanged_original_assets':assets,'checks':results,'broken_links':errors}
    (ROOT/'content-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in audit.items() if k!='checks'},ensure_ascii=False))
    if errors:raise SystemExit('\n'.join(errors))

if __name__=='__main__':check()
