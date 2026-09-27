import assert from "node:assert/strict";
import test from "node:test";
import {
	resolveCategoryCardAction,
	resolveSearchCardAction,
	resolveMenuButtonTagName,
	installLastROCardMenuButton
} from "./lastro-card-collection-ui.mjs";

function fakeElement(tagName) {
	return {
		tagName: tagName.toUpperCase(),
		children: [],
		attrs: {},
		dataset: {},
		className: "",
		textContent: "",
		type: undefined,
		setAttribute(name, value) { this.attrs[name] = String(value); },
		getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
		appendChild(child) { this.children.push(child); return child; },
		append(...children) { this.children.push(...children); },
		addEventListener() {}
	};
}

function fakeMenu({ sampleTag = "div", hasCard = false } = {}) {
	return {
		children: [],
		appendChild(child) { this.children.push(child); return child; },
		querySelector(selector) {
			if (selector === "#card") return hasCard ? {} : null;
			return sampleTag ? { tagName: sampleTag.toUpperCase() } : null;
		}
	};
}

function fakeDoc() {
	return {
		created: [],
		createElement(tag) {
			const el = fakeElement(tag);
			this.created.push(el);
			return el;
		}
	};
}

function fakeRoot(menu) {
	return { querySelector(selector) { return selector === ".buttons" ? menu : null; } };
}

test("category actions follow recharge state", () => {
	assert.deepEqual(resolveCategoryCardAction({ tab: 1, level: 2, state: 0 }).action.action, "recharge");
	assert.equal(resolveCategoryCardAction({ tab: 1, level: 2, state: 0 }).badgeText, "未充能");

	const charged = resolveCategoryCardAction({ tab: 1, level: 2, state: 1 });
	assert.equal(charged.badgeKind, "charged");
	assert.equal(charged.action.action, "add-deck");
	assert.equal(charged.action.kind, "btn-gold");

	const inDeck = resolveCategoryCardAction({ tab: 1, level: 2, state: 2 });
	assert.equal(inDeck.badgeKind, "indeck");
	assert.equal(inDeck.action.disabled, true);
	assert.equal("action" in inDeck.action, false);
});

test("search actions remove deck cards and delegate the rest", () => {
	const deckHit = resolveSearchCardAction({ tab: 0, level: 1, state: 2 });
	assert.equal(deckHit.badgeText, "卡组生效");
	assert.equal(deckHit.action.action, "cancel");
	assert.equal(deckHit.action.kind, "btn-ghost-danger");

	const categoryHit = resolveSearchCardAction({ tab: 3, level: 1, state: 1 });
	assert.equal(categoryHit.action.action, "add-deck");
});

test("menu tag name comes from the skin's own buttons, never from selector substrings", () => {
	// Regression: ".buttons > div[id]" includes the substring "button" via
	// ".buttons"; a substring check wrongly produced a native <button>.
	assert.equal(resolveMenuButtonTagName(fakeMenu({ sampleTag: "div" }), ".buttons > div[id]"), "div");
	assert.equal(resolveMenuButtonTagName(fakeMenu({ sampleTag: "button" }), ".buttons button"), "button");
	assert.equal(resolveMenuButtonTagName(fakeMenu({ sampleTag: null }), ".whatever"), "div");
});

test("menu button installer creates a matching div for the V5 div-based skin", () => {
	const doc = fakeDoc();
	const processed = [];
	const menu = fakeMenu({ sampleTag: "div" });
	const ok = installLastROCardMenuButton({
		root: fakeRoot(menu),
		buttonsSelector: ".buttons > div[id]",
		buttonKeyBy: "id",
		GUIComponent: { processDataAttrs(el) { processed.push(el); } },
		doc
	});
	assert.equal(ok, true);
	const button = menu.children[0];
	assert.equal(button.tagName, "DIV");
	assert.equal(button.id, "card");
	assert.equal(button.className, "card event_add_cursor");
	assert.equal(button.title, "卡片典藏");
	assert.equal(button.getAttribute("data-background"), "menu_icon/bt_card.bmp");
	assert.equal(button.getAttribute("data-down"), "menu_icon/bt_card_press.bmp");
	assert.equal(button.children.length, 1);
	assert.equal(button.children[0].className, "name");
	assert.equal(button.children[0].textContent, "卡片典藏");
	assert.equal(processed[0], button);
});

test("menu button installer creates a button in button-based skins without a label", () => {
	const doc = fakeDoc();
	const menu = fakeMenu({ sampleTag: "button" });
	const ok = installLastROCardMenuButton({
		root: fakeRoot(menu),
		buttonsSelector: ".buttons button",
		buttonKeyBy: "class",
		GUIComponent: { processDataAttrs() {} },
		doc
	});
	assert.equal(ok, true);
	const button = menu.children[0];
	assert.equal(button.tagName, "BUTTON");
	assert.equal(button.type, "button");
	assert.equal(button.children.length, 0);
});

test("menu button installer is idempotent and tolerates missing menus", () => {
	const GUIComponent = { processDataAttrs() {} };
	assert.equal(installLastROCardMenuButton({ root: fakeRoot(null), buttonsSelector: ".buttons button", GUIComponent }), false);
	assert.equal(installLastROCardMenuButton({ root: { querySelector: () => null }, buttonsSelector: ".buttons button", GUIComponent }), false);

	const menu = fakeMenu({ sampleTag: "div", hasCard: true });
	assert.equal(installLastROCardMenuButton({
		root: fakeRoot(menu),
		buttonsSelector: ".buttons > div[id]",
		buttonKeyBy: "id",
		GUIComponent,
		doc: fakeDoc()
	}), false);
	assert.equal(menu.children.length, 0);
});
