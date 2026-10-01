import ts from 'typescript';

function replaceOne(source, needle, replacement) {
  if (source.split(needle).length !== 2) throw new Error('credential-security: missing or ambiguous anchor');
  return source.replace(needle, replacement);
}

/** Keep native callback closures and debug packet output from retaining secrets. */
export function patchRuntimeCredentialSecurity(source) {
  const file = ts.createSourceFile('Online.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'onConnectionRequest') functions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (functions.length !== 1) throw new Error('credential-security: login function');
  const node = functions[0];
  let body = source.slice(node.body.getStart(file), node.body.end);
  body = replaceOne(body, '  SoundManager.play(', `  const loginAttempt = ++lastroLoginAttemptSequence;
  let loginSent = false;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password
    || username.length > 1024 || password.length > 1024 || /[\\u0000\\r\\n]/.test(username + password)) {
    username = password = "";
    return;
  }
  SoundManager.play(`);
  body = replaceOne(body, '    if (!success) {', `    if (loginAttempt !== lastroLoginAttemptSequence) { username = password = ""; return; }
    if (!success) {
      loginSent = true;
      username = password = "";`);
  const parsed = ts.createSourceFile('login.js', `function login() ${body}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let sendLogin;
  function findSend(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'sendLogin') sendLogin = node;
    ts.forEachChild(node, findSend);
  }
  findSend(parsed);
  if (!sendLogin) throw new Error('credential-security: send login function');
  const offset = 'function login() '.length;
  const start = sendLogin.body.getStart(parsed) - offset;
  const end = sendLogin.body.end - offset;
  const originalBody = body.slice(start + 1, end - 1);
  body = body.slice(0, start) + `{
      if (loginSent || loginAttempt !== lastroLoginAttemptSequence) { username = password = ""; return; }
      loginSent = true;
      try {${originalBody}
      } finally {
        if (pkt && Object.hasOwn(pkt, "Passwd")) pkt.Passwd = "";
        username = password = "";
      }
    }` + body.slice(end);
  let output = source.slice(0, node.getStart(file)) + 'let lastroLoginAttemptSequence = 0;\n'
    + source.slice(node.getStart(file), node.body.getStart(file)) + body + source.slice(node.body.end);
  output = replaceOne(output, '      const autoLogin = Configs.get("autoLogin");',
    '      let autoLogin = Configs.get("autoLogin");\n      Configs.set("autoLogin", null);');
  output = replaceOne(output, '        onConnectionRequest.apply(null, autoLogin);\n        Configs.set("autoLogin", null);',
    '        try { onConnectionRequest.apply(null, autoLogin); } finally { autoLogin = null; }');
  // Packet dumps include login passwords, tokens and PINs on both directions.
  output = replaceOne(output, '  packetDump = Configs.get("packetDump", false);', '  packetDump = false; // Never dump authentication/session packet payloads.');
  return output;
}
