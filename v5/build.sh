#!/bin/sh
set -e
npx --no-install oxlint src-*.js --deny-warnings
node lint.mjs

out=fresh-flow-v0.html
cat head.html > $out
printf '<script id="lib">\n' >> $out
cat preact-lib.js >> $out
printf '\n</script>\n' >> $out
printf '<script id="src-ns">\nvar FF=window.FF||(window.FF={});\nvar FV=window.FV||(window.FV={});\nFF._injected=window.preactSignals.signal;\nFF._injectedComputed=window.preactSignals.computed;\n</script>\n' >> $out
for part in core store access uistate kernel runner record engine counter fact report-data debug render text ui-flow ui-matrix ui-chart ui-outlook report clip view boot; do
  printf '<script id="src-%s">\n(function(FF,FV){\n' "$part" >> $out
  cat src-$part.js >> $out
  printf '})(window.FF,window.FV);\n</script>\n' >> $out
done
cat tail.html >> $out

node test.mjs
node ui-test.mjs
node perf.mjs
node golden.mjs check
# 다시드 회귀는 별도다: ./sweep.sh
