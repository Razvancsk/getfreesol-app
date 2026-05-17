// Install Vulcan CLI on Linux (Render deploy)
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

if (process.platform === 'linux') {
  const vulcanBin = join(homedir(), '.local', 'bin', 'vulcan');
  if (!existsSync(vulcanBin)) {
    console.log('Installing Vulcan CLI for Phoenix Perpetuals...');
    try {
      execSync(
        'curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh',
        { stdio: 'inherit', shell: true, timeout: 60000 }
      );
      console.log('Vulcan CLI installed:', vulcanBin);
    } catch (e) {
      console.warn('Vulcan install skipped (non-fatal):', e.message);
    }
  } else {
    console.log('Vulcan CLI ready:', vulcanBin);
  }
}
