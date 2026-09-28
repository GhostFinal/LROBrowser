import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const FACTORY_MARKER = "function createQuest(config)";

function extractFunction(marker) {
  const source = readFileSync(ONLINE_PATH, "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} was not found`);

  const functionIndex = source.indexOf("function", markerIndex);
  const openBrace = source.indexOf("{", functionIndex);
  let depth = 0;

  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") ++depth;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(functionIndex, index + 1);
    }
  }

  throw new Error(`${marker} has unbalanced braces`);
}

function createNode(id = "") {
  const listeners = new Map();
  return {
    id,
    style: {},
    children: [],
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector() {
      return createNode();
    },
    dispatch(type) {
      listeners.get(type)?.({ currentTarget: this });
    }
  };
}

function createQuestPanel(renewLayout = true) {
  let attached = true;
  const lists = {
    active: createNode(),
    feature: createNode(),
    inactive: createNode(),
    cooldown: createNode()
  };
  const menuItems = Object.keys(lists).map((id) => createNode(id));
  const titlebar = createNode();
  const closeButton = createNode();
  const toggleButton = createNode();
  const selectors = new Map([
    ["#active-quest-list", lists.active],
    ["#feature-quest-list", lists.feature],
    ["#inactive-quest-list", lists.inactive],
    ["#cooldown-quest-list", lists.cooldown],
    ["#all-quest-list", createNode()],
    [".titlebar", titlebar],
    [".close-quest-container-btn", closeButton],
    [".toggle-quest-list", toggleButton],
    [".view", createNode()],
    [".close", createNode()],
    [".btn-right", createNode()]
  ]);
  const root = {
    querySelector(selector) {
      return selectors.get(selector) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === ".quest-menu-item") return menuItems;
      if (selector === ".quest-list") return Object.values(lists);
      return [];
    }
  };
  const document = { createElement: () => createNode() };

  class FakeGUIComponent {
    constructor(name) {
      this.name = name;
      this._host = { style: {} };
      this.ui = {
        hide() {},
        show() {}
      };
    }

    getRoot() {
      return attached ? root : null;
    }

    draggable() {}
  }

  const createQuest = new Function(
    "GUIComponent",
    "Preferences",
    "Renderer",
    "Client",
    "DB",
    "PACKET",
    "Network",
    "ChatBox_default",
    "SessionStorage_default",
    "document",
    "UIManager",
    `return (${extractFunction(FACTORY_MARKER)});`
  )(
    FakeGUIComponent,
    { get: (_name, defaults) => ({ ...defaults, save() {} }) },
    { width: 1920, height: 1080 },
    { loadFile: (_path, callback) => callback("data:image/bmp;base64,") },
    { INTERFACE_PATH: "" },
    { CZ: { ACTIVE_QUEST: class {} } },
    { sendPacket() {} },
    { addText() {}, TYPE: {}, FILTER: {} },
    {},
    document,
    { addComponent: (component) => component }
  );
  const quest = createQuest({
    name: "Quest",
    htmlText: "",
    cssText: "",
    questHelper: { prepare() {}, clearQuestDesc() {} },
    questWindow: { prepare() {}, append() {}, ClearQuestList() {}, setQuestList() {} },
    renewLayout
  });

  return { lists, menuItems, quest, setAttached(value) { attached = value; } };
}

test("renewal quest panel renders active quests into its visible list", () => {
  const { lists, quest } = createQuestPanel();

  quest.init();
  quest.setQuestList({
    1001: {
      questID: 1001,
      title: "Talk to Jerry",
      summary: "Visit the fishing village",
      icon: "ico_nq.bmp",
      active: 1,
      end_time: 0,
      hunt_list: []
    }
  });

  assert.equal(lists.active.style.display, "block");
  assert.equal(lists.active.children.length, 1);
  assert.equal(lists.active.children[0].className, "quest-item");
});

test("renewal quest panel keeps the selected tab visible after quest data refresh", () => {
  const { lists, menuItems, quest } = createQuestPanel();

  quest.init();
  menuItems.find((item) => item.id === "inactive").dispatch("click");
  quest.setQuestList({
    1001: { questID: 1001, title: "Inactive quest", summary: "Summary", icon: "ico_nq.bmp", active: 0, end_time: 0, hunt_list: [] }
  });

  assert.equal(lists.inactive.style.display, "block");
  assert.equal(lists.active.style.display, "none");
  assert.equal(lists.inactive.children.length, 1);
});

test("renewal quest panel explicitly shows every selected tab", () => {
  const { lists, menuItems, quest } = createQuestPanel();

  quest.init();
  const menuOrder = ["feature", "inactive", "cooldown", "active"];
  for (const id of menuOrder) {
    const menuItem = menuItems.find((item) => item.id === id);
    menuItem.dispatch("click");

    assert.equal(lists[menuItem.id].style.display, "block");
    for (const [id, list] of Object.entries(lists)) {
      if (id !== menuItem.id) assert.equal(list.style.display, "none");
    }
  }
});
