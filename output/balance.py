"""粗略的 JS 括號平衡掃描（處理字串、樣板、註解、以及啟發式判斷的正則表達式）。"""
import sys

path = sys.argv[1]
src = open(path, encoding='utf-8').read()
i = 0
n = len(src)
line = 1
stack = []
prev_significant = ''
while i < n:
    ch = src[i]
    if ch == '\n':
        line += 1
        i += 1
        continue
    if ch in ' \t\r':
        i += 1
        continue
    # 註解
    if ch == '/' and i + 1 < n and src[i + 1] == '/':
        while i < n and src[i] != '\n':
            i += 1
        continue
    if ch == '/' and i + 1 < n and src[i + 1] == '*':
        i += 2
        while i + 1 < n and not (src[i] == '*' and src[i + 1] == '/'):
            if src[i] == '\n':
                line += 1
            i += 1
        i += 2
        continue
    # 字串
    if ch in '"\'':
        quote = ch
        i += 1
        while i < n and src[i] != quote:
            if src[i] == '\\':
                i += 1
            i += 1
        i += 1
        prev_significant = quote
        continue
    # 樣板字串：${} 內的東西要照算，所以逐段處理
    if ch == '`':
        i += 1
        depth = 0
        while i < n:
            if src[i] == '\\':
                i += 2
                continue
            if src[i] == '\n':
                line += 1
            if src[i] == '$' and i + 1 < n and src[i + 1] == '{':
                stack.append(('{', line, 'template'))
                i += 2
                break
            if src[i] == '`':
                i += 1
                break
            i += 1
        prev_significant = '`'
        continue
    # 正則表達式（啟發式：前一個有效字元不是識別字/括號收尾就當成正則）
    if ch == '/' and prev_significant not in ')]}' and not (prev_significant.isalnum() or prev_significant in '_$'):
        i += 1
        in_class = False
        while i < n and (in_class or src[i] != '/'):
            if src[i] == '\\':
                i += 2
                continue
            if src[i] == '[':
                in_class = True
            elif src[i] == ']':
                in_class = False
            i += 1
        i += 1
        prev_significant = '/'
        continue
    if ch in '({[':
        stack.append((ch, line, ''))
    elif ch in ')}]':
        want = {'}': '{', ')': '(', ']': '['}[ch]
        if not stack or stack[-1][0] != want:
            print(f'第 {line} 行:多了 {ch}（堆疊頂端是 {stack[-1] if stack else None}）')
            break
        stack.pop()
    prev_significant = ch
    i += 1
else:
    if stack:
        print('沒有閉合:', stack[-8:])
    else:
        print('括號平衡 OK')
