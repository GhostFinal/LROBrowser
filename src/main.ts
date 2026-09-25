import { mountAppShell } from './app-shell';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app mount point');
mountAppShell(root);
