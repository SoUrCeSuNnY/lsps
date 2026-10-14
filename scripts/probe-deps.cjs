const fs = require('fs');
for (const pkg of ['@cesium/engine', '@cesium/core', '@cesium/widgets']) {
  const p = JSON.parse(fs.readFileSync('node_modules/' + pkg + '/package.json', 'utf8'));
  const deps = Object.keys(p.dependencies || {});
  const cjs = [];
  for (const d of deps) {
    for (const cand of ['node_modules/' + d + '/package.json', 'node_modules/' + pkg + '/node_modules/' + d + '/package.json']) {
      if (fs.existsSync(cand)) {
        const q = JSON.parse(fs.readFileSync(cand, 'utf8'));
        const exportsStr = q.exports ? JSON.stringify(q.exports) : '';
        const esm = q.type === 'module' || exportsStr.includes('"import"');
        if (!esm) cjs.push(d);
        break;
      }
    }
  }
  console.log(pkg, 'deps:', deps.join(', '));
  console.log('  CJS/AMBIGUOUS:', cjs.join(', ') || '(none)');
}
