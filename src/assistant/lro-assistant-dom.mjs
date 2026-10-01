import { setLastROInnerHTML, setLastROAdjacentHTML, setLastROOuterHTML } from './lastro-trusted-dom.mjs';

// Preserve the standard edition's Shadow DOM CSS without weakening the client's
// Trusted Types policy. CSS is textContent, HTML still uses the native validator.
function splitStyles(value) {
  const styles = [];
  const html = String(value).replace(/<style>([\s\S]*?)<\/style>/gi, (_match, css) => {
    if (/@import\b|expression\s*\(|javascript\s*:/i.test(css)) throw new TypeError('不允许的助手样式');
    styles.push(css);
    return '';
  });
  return { html, styles };
}

export function setAssistantInnerHTML(element, value) {
  const { html, styles } = splitStyles(value);
  setLastROInnerHTML(element, html);
  for (const css of styles.reverse()) {
    const node = element.ownerDocument.createElement('style');
    node.textContent = css;
    element.prepend(node);
  }
}

export const setAssistantAdjacentHTML = setLastROAdjacentHTML;
export const setAssistantOuterHTML = setLastROOuterHTML;
