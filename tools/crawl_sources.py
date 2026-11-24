"""Archive the supplied report sites, including their local pages and assets."""
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote, urldefrag
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SITES = {
    'lab00-report': 'https://lab00-sdr-402111259-402111272.lunarbun37.chatgpt.site/',
    'lab01-prelab': 'https://sdr-lab-romina.goofy-dream-4386.chatgpt.site/',
    'lab01-report': 'https://sdr-lab01-spectrum-report.goofy-dream-4386.chatgpt.site/',
    'lab02-prelab': 'https://sdr-lab2-prelab-romina.goofy-dream-4386.chatgpt.site/',
    'lab02-report': 'https://sdr-lab02-rf-report.lunarbun37.chatgpt.site/',
}

def crawl(item):
    key, origin = item
    dest = ROOT / 'sources' / key
    dest.mkdir(parents=True, exist_ok=True)
    seen, pending, files, errors = set(), [origin], [], []
    def fetch(url):
        path = unquote(urlsplit(url).path).lstrip('/') or 'index.html'
        if path.endswith('/'): path += 'index.html'
        target = dest / path
        target.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '45', '-o', str(target), url], capture_output=True, text=True)
        if result.returncode:
            return url, None, result.stderr[-200:]
        return url, target, None
    while pending:
        batch = list(dict.fromkeys(pending)); pending = []
        batch = [u for u in batch if u not in seen]
        seen.update(batch)
        with ThreadPoolExecutor(8) as pool:
            for url, path, error in pool.map(fetch, batch):
                if error:
                    errors.append({'url':url,'error':error}); continue
                raw = path.read_bytes()
                files.append({'path':str(path.relative_to(dest)), 'url':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
                links = []
                if path.suffix in ['.html', '.htm']:
                    doc = BeautifulSoup(raw, 'html.parser')
                    for tag in doc.find_all(True):
                        for attr in ['src','href','poster','data-image','data-full','data-src']:
                            val = tag.get(attr)
                            if val and not val.startswith(('#','data:','mailto:','tel:','javascript:')):
                                links.append(val)
                    links += re.findall(r'''(?:fetch\(|url\()[\s'"]*([^'"\s)]+)''', raw.decode('utf-8','replace'))
                elif path.suffix in ['.css', '.js']:
                    body = raw.decode('utf-8','replace')
                    links += re.findall(r'''url\([\s'"]*([^'"\s)]+)''', body)
                    links += re.findall(r'''['"]([^'"\s<>]+\.(?:woff2?|ttf|png|webp|jpg|jpeg|svg|json|py|grc|css|js|pdf|zip))['"]''', body)
                for link in links:
                    full = urldefrag(urljoin(url, link))[0]
                    parsed = urlsplit(full)
                    if parsed.netloc != urlsplit(origin).netloc or parsed.scheme not in ('http','https'):continue
                    full = parsed._replace(query='').geturl()
                    if full.endswith('/index.html'):full=full[:-10]
                    if full not in seen:pending.append(full)
    manifest = {'id':key,'origin':origin,'files':sorted(files,key=lambda f:f['path']),'errors':errors}
    (dest / '_source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    return {'id':key,'files':len(files),'html':[f['path'] for f in files if f['path'].endswith('.html')],'bytes':sum(f['bytes'] for f in files),'errors':errors}

if __name__ == '__main__':
    with ThreadPoolExecutor(5) as pool:
        for report in pool.map(crawl, SITES.items()):print(json.dumps(report,ensure_ascii=False),flush=True)
