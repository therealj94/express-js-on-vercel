#!/bin/bash
S=/tmp/claude-0/-home-user/2611f717-6182-5311-8e6b-eee5393945e0/scratchpad/hn/electrum; N=3797; cd $S/codigo
prev=-1; quieto=0
while true; do
  c=$(ls $S/cuadros | wc -l); [ $c -ge $N ] && break
  curl -s -o /dev/null http://127.0.0.1:8766/ || (nohup python3 -m http.server 8766 --bind 127.0.0.1 >/dev/null 2>&1 &)
  if [ $c -eq $prev ]; then quieto=$((quieto+1)); else quieto=0; fi; prev=$c
  vivos=$(ps aux | grep -c "[r]ender_el.py [0-9]")
  if [ $vivos -eq 0 ] || [ $quieto -ge 4 ]; then
    pkill -f "render_el.py [0-9]"; sleep 2
    python3 - > $S/faltan.txt <<PY
import os
h={int(f[:5]) for f in os.listdir('$S/cuadros')}; m=[i for i in range($N) if i not in h]
r=[];a=None
for i in m:
    if a is None: a=b=i
    elif i==b+1: b=i
    else: r.append((a,b+1)); a=b=i
if a is not None: r.append((a,b+1))
out=[]
for a,b in r:
    n=max(1,(b-a)//3+1)
    for k in range(a,b,n): out.append(f"{k} {min(b,k+n)}")
print("\n".join(out[:4]))
PY
    while read a b; do nohup python3 render_el.py $a $b ../cuadros >> ../r_re.log 2>&1 & done < $S/faltan.txt
    quieto=0
  fi
  sleep 60
done
echo fin $(ls $S/cuadros | wc -l)
