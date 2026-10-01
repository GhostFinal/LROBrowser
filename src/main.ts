import { bootstrapV2Client } from './runtime/client-bootstrap';
import { getAvailableServerProfile } from './servers/server-profiles';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app mount point');
const requestedServer = new URLSearchParams(window.location.search).get('server') ?? 'lastro-2x';
const profile = getAvailableServerProfile(requestedServer);
const assistantEnabled = true;
void bootstrapV2Client({ mount: root, profile, assistantEnabled, credentials: { username: '', password: '' } }).catch((error: unknown) => {
  root.replaceChildren();
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = `客户端启动失败：${error instanceof Error ? error.message : String(error)}`;
  root.append(message);
});
