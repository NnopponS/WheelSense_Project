import re

# Read the entire LaTeX file
with open(r'c:\Users\worap\Documents\TSE\PaperIEEE\paper\Draft_Paper.tex', 'r', encoding='utf-8') as f:
    content = f.read()

# Split into main text and bibliography
bib_start_match = re.search(r'\\begin\{thebibliography\}\{00\}', content)
if not bib_start_match:
    print("Could not find bibliography start")
    exit(1)

main_text = content[:bib_start_match.start()]
bib_text = content[bib_start_match.end():]

bib_end_match = re.search(r'\\end\{thebibliography\}', bib_text)
bib_content = bib_text[:bib_end_match.start()]
footer = bib_text[bib_end_match.start():]

# Parse bibitems into a dictionary
bibitem_pattern = re.compile(r'\\bibitem\{([^}]+)\}(.*?)(?=\\bibitem\{|$)', re.DOTALL)
bib_dict = {}
for match in bibitem_pattern.finditer(bib_content):
    key = match.group(1).strip()
    entry = match.group(2).strip()
    bib_dict[key] = entry

# Find all citations in order
old_to_new = {}
new_id_counter = 1

def replacer(match):
    global new_id_counter
    # Extracted keys: match.group(1) like "b1,b9"
    keys = [k.strip() for k in match.group(1).split(',')]
    new_keys = []
    
    for key in keys:
        if key not in old_to_new:
            old_to_new[key] = f"b{new_id_counter}"
            new_id_counter += 1
        new_keys.append(old_to_new[key])
    
    # Optional sorting of keys to look nice, e.g. \cite{b1,b2}
    new_keys.sort(key=lambda x: int(x[1:]))
    return r'\cite{' + ','.join(new_keys) + '}'

# Replace citations in main text
new_main_text = re.sub(r'\\cite\{([^}]+)\}', replacer, main_text)

# Reorder bibliography
new_bib_lines = []
for old_key, new_key in sorted(old_to_new.items(), key=lambda x: int(x[1][1:])):
    if old_key in bib_dict:
        new_bib_lines.append(f"\\bibitem{{{new_key}}} {bib_dict[old_key]}")
    else:
        print(f"WARNING: Reference {old_key} cited but not in bibliography!")

new_bib_content = "\n".join(new_bib_lines) + "\n"

# Check if there are any bibitems not cited
for old_key in bib_dict:
    if old_key not in old_to_new:
        print(f"WARNING: Reference {old_key} in bibliography but not cited!")

# Reconstruct file
new_content = new_main_text + "\\begin{thebibliography}{00}\n" + new_bib_content + footer

with open(r'c:\Users\worap\Documents\TSE\PaperIEEE\paper\Draft_Paper.tex', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Successfully reordered {len(old_to_new)} references.")
