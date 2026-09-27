import { createAccountStore } from './accounts/account-store';
import { mountAccountManager, type LoginHandler } from './accounts/account-ui';
import { LASTRO_SERVER_PROFILES } from './servers/server-profiles';

export function mountAppShell(root: HTMLElement, onLogin?: LoginHandler): void {
  const header = document.createElement('header');
  header.className = 'app-header';
  const icon = document.createElement('img');
  icon.src = '/icons/icon.svg';
  icon.alt = '';
  icon.width = 40;
  icon.height = 40;
  const title = document.createElement('h1');
  title.textContent = 'LRO进阶客户端(Powered by LTSD.Ro)';
  const status = document.createElement('p');
  status.id = 'environment-status';
  status.setAttribute('role', 'status');
  status.textContent = '尚未启动';
  header.append(icon, title, status);

  const main = document.createElement('main');
  main.className = 'app-content';
  const controls = document.createElement('aside');
  controls.className = 'login-controls';
  for (const [id, label] of [['server', '服务器'], ['account', '账号']] as const) {
    const region = document.createElement('section');
    region.id = `${id}-region`;
    region.setAttribute('aria-labelledby', `${id}-title`);
    const heading = document.createElement('h2');
    heading.id = `${id}-title`;
    heading.textContent = label;
    region.append(heading);
    controls.append(region);
  }
  const game = document.createElement('section');
  game.id = 'game-mount';
  game.setAttribute('aria-label', '游戏');
  main.append(controls, game);
  root.replaceChildren(header, main);
  mountAccountManager({ root: controls, profiles: LASTRO_SERVER_PROFILES, store: createAccountStore(),
    onLogin: onLogin ?? (() => { status.textContent = '客户端尚未就绪'; throw new Error('Client not initialized'); }) });
}
