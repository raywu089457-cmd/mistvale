import sys

path = sys.argv[1]
s = open(path, encoding='utf-8').read()
depth = {'{': 0, '(': 0, '[': 0}
close = {'}': '{', ')': '(', ']': '['}
quote = None
esc = False
line = 1
stack = []
for ch in s:
    if ch == '\n':
        line += 1
    if quote:
        if esc:
            esc = False
        elif ch == '\\':
            esc = True
        elif ch == quote:
            quote = None
        continue
    if ch in '"\'`':
        quote = ch
        stack.append((ch, line))
        continue
    if ch in depth:
        depth[ch] += 1
    elif ch in close:
        depth[close[ch]] -= 1
        if depth[close[ch]] < 0:
            print('extra closing', ch, 'at line', line)
            break
print('depth', depth, 'unclosed quote:', quote, stack[-3:] if stack else None)
