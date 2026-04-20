"""
Rewrite all citations in Draft_Paper.tex so that reference numbers 
appear in strictly non-decreasing order through the document.

Strategy:
- Walk through the text linearly
- For each \cite{...} encountered, assign new sequential numbers
  to any keys not yet seen
- Rewrite the bibliography in the new order
"""
import re

INPUT  = r'c:\Users\worap\Documents\TSE\PaperIEEE\paper\Draft_Paper.tex'

with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

# --- 1. Split into body and bibliography ---
bib_marker = r'\begin{thebibliography}{00}'
bib_end_marker = r'\end{thebibliography}'

bib_start_idx = content.index(bib_marker)
bib_end_idx = content.index(bib_end_marker)

body = content[:bib_start_idx]
bib_block = content[bib_start_idx + len(bib_marker):bib_end_idx]
footer = content[bib_end_idx:]  # includes \end{thebibliography} onward

# --- 2. Parse existing bibitems ---
# Each bibitem starts with \bibitem{key} and runs until the next \bibitem or end
bibitem_re = re.compile(r'\\bibitem\{([^}]+)\}\s*', re.DOTALL)
entries = {}
positions = list(bibitem_re.finditer(bib_block))
for i, m in enumerate(positions):
    key = m.group(1)
    start = m.end()
    end = positions[i+1].start() if i+1 < len(positions) else len(bib_block)
    entries[key] = bib_block[start:end].strip()

print(f"Found {len(entries)} bibliography entries: {list(entries.keys())}")

# --- 3. Walk through the body and assign new sequential numbers ---
old_to_new = {}   # old_key -> new_number (1-based)
counter = [0]     # mutable counter

def assign_and_replace(match):
    """For each \cite{k1,k2,...}, assign new numbers and rewrite."""
    keys = [k.strip() for k in match.group(1).split(',')]
    for k in keys:
        if k not in old_to_new:
            counter[0] += 1
            old_to_new[k] = counter[0]
    # Sort keys by their new number so [3,5] doesn't become [5,3]
    new_keys = sorted(keys, key=lambda k: old_to_new[k])
    new_labels = [f"b{old_to_new[k]}" for k in new_keys]
    return r'\cite{' + ','.join(new_labels) + '}'

new_body = re.sub(r'\\cite\{([^}]+)\}', assign_and_replace, body)

print(f"\nMapping (old -> new number):")
for old_key, new_num in sorted(old_to_new.items(), key=lambda x: x[1]):
    print(f"  {old_key} -> [b{new_num}]")

# --- 4. Rebuild bibliography in new order ---
new_bib_lines = []
for old_key, new_num in sorted(old_to_new.items(), key=lambda x: x[1]):
    if old_key in entries:
        new_bib_lines.append(f"\\bibitem{{b{new_num}}} {entries[old_key]}")
    else:
        print(f"WARNING: {old_key} cited but not in bibliography!")

# Check for uncited entries
for old_key in entries:
    if old_key not in old_to_new:
        print(f"WARNING: {old_key} in bibliography but never cited!")

new_bib = "\n".join(new_bib_lines) + "\n"

# --- 5. Write output ---
output = new_body + bib_marker + "\n" + new_bib + footer

with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(output)

print(f"\nDone! Rewrote {counter[0]} references in sequential order.")
