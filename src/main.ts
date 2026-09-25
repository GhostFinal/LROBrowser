import { mountAppShell } from './app-shell';
import { bootstrapV2Client } from './runtime/client-bootstrap';
import type { LoginRequest } from './accounts/account-ui';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app mount point');
mountAppShell(root, async (request: LoginRequest) => {
  const game = document.getElementById('game-mount');
  const status = document.getElementById('environment-status');
  if (!game) throw new Error('Missing game mount point');
  if (status) status.textContent = '正在启动客户端';
  await bootstrapV2Client({ mount: game, profile: request.profile, credentials: request });
  if (status) status.textContent = '客户端已启动';
});
