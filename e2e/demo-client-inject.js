// @ts-check
const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '..', 'apps', 'web');
const CLIENT_SOURCE = path.join(WEB_DIR, 'src', 'demo', 'client.ts');
const TYPESCRIPT = require.resolve('typescript', { paths: [WEB_DIR] });

/**
 * Transpile the *production* demo client (TypeScript) to a classic script and
 * expose its exports as `window.__demoClient`. The browser then runs the real
 * transport code against the real same-origin demo proxy and the real browser
 * cookie jar — no helper reimplementation and no fake assertions.
 */
async function injectDemoClient(page) {
  const ts = require(TYPESCRIPT);
  const source = fs.readFileSync(CLIENT_SOURCE, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: CLIENT_SOURCE,
  });
  const wrapped =
    'window.__demoClient = (function(){var module={exports:{}};var exports=module.exports;' +
    `(function(module,exports){${outputText}\n})(module,exports);return module.exports;})();`;
  await page.addScriptTag({ content: wrapped });
}

module.exports = { injectDemoClient };
