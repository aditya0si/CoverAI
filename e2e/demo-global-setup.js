// @ts-check
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Generate the synthetic demo policy PDF through the API test fixture command.
 * Output goes only to test-results; it is never shipped into the UI.
 */
module.exports = async () => {
  const output = path.join(__dirname, '..', 'test-results', 'demo-policy.pdf');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    'poetry',
    ['run', 'python', 'tests/demo/make_fixture_pdf.py', output],
    {
      cwd: path.join(__dirname, '..', 'apps', 'api'),
      stdio: 'inherit',
      shell: true,
    }
  );
};
