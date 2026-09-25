import { bootstrapV2Client } from './runtime/client-bootstrap';
import { getAvailableServerProfile } from './servers/server-profiles';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app mount point');
const requestedServer = new URLSearchParams(window.location.search).get('server') ?? 'lastro-2x';
const profile = getAvailableServerProfile(requestedServer);
void bootstrapV2Client({ mount: root, profile, credentials: { username: '', password: '' } });
