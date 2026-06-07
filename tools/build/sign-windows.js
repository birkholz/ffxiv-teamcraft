const { execSync } = require('child_process');
const { platform } = require('os');
const { renameSync, unlinkSync } = require('fs');

const {
  SIGN_TOOL_PATH = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe',
  TIMESTAMP_SERVER = 'http://timestamp.digicert.com'
} = process.env;

const SITE = 'https://ffxivteamcraft.com';

const signOnWindows = (filePath, name, certPath, password) => {
  // certutil import may fail if cert is already in the store — log but continue.
  try {
    execSync(
      `certutil -f -p "${password}" -importPfx My "${certPath}" NoRoot`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error('Unable to import certificate:', err.message);
  }

  // signtool failure means the binary is unsigned — re-throw so the build fails.
  try {
    execSync(
      `"${SIGN_TOOL_PATH}" sign /a /s My /sm /t "${TIMESTAMP_SERVER}" /d "${name}" /du "${SITE}" "${filePath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error(`Signing ${filePath} failed`);
    throw err;
  }
};

const signOnLinux = (filePath, name, certPath, password) => {
  const tmp = `${filePath}.signed`;
  try {
    execSync(
      `osslsigncode sign -pkcs12 "${certPath}" -pass "${password}" -n "${name}" -i "${SITE}" -t "${TIMESTAMP_SERVER}" -in "${filePath}" -out "${tmp}"`,
      { stdio: 'inherit' }
    );
    renameSync(tmp, filePath);
  } catch (err) {
    // Remove any partial output before re-throwing so subsequent runs don't
    // accidentally pick up a corrupted .signed file.
    try { unlinkSync(tmp); } catch {}
    console.error(`Signing ${filePath} failed`);
    throw err;
  }
};

exports.default = ({ path, name, cscInfo }) => {
  const { file, password } = cscInfo || {};
  if (!file) return;

  if (platform() === 'win32') {
    signOnWindows(path, name, file, password);
  } else {
    signOnLinux(path, name, file, password);
  }
};
