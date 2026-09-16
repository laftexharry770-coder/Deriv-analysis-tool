#!/usr/bin/env python3
"""Stamp every local css/js URL in index.html with a fresh ?v= value so browsers fetch the new build."""
import re, sys, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
p = root / 'index.html'
v = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.utcnow().strftime('%Y%m%d%H%M')
s = p.read_text(encoding='utf-8')
s2 = re.sub(r'(href|src)="((?:css|js)/[^"?]+)(\?v=[^"]*)?"', lambda m: f'{m.group(1)}="{m.group(2)}?v={v}"', s)
p.write_text(s2, encoding='utf-8')
print('stamped', s2.count('?v=' + v), 'urls with', v)
