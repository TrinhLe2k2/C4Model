#!/usr/bin/env python3
"""Check original project files against the supplied SHA-256 baseline. Read-only."""
from pathlib import Path
import hashlib, json, sys
BASE=Path(__file__).resolve().parents[1]
ROOT=BASE.parent
manifest=json.loads((BASE/'content/source-integrity.json').read_text(encoding='utf-8'))
missing=[];changed=[]
for item in manifest['files']:
    path=ROOT/item['path']
    if not path.is_file(): missing.append(item['path']);continue
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']: changed.append(item['path'])
report={'checked':len(manifest['files']),'unchanged':len(manifest['files'])-len(missing)-len(changed),'missing':missing,'changed':changed}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if missing or changed else 0)
