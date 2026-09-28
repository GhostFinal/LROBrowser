import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const onlineSource = fs.readFileSync(new URL("./Online.js", import.meta.url), "utf8");

// Statements in the bundle may wrap across lines and gain trailing commas;
// compare statements with all whitespace (and formatter-added `,)` ) removed.
const compactSource = onlineSource.replace(/\s+/g, "").replace(/,\)/g, ")");
const compact = (statement) => statement.replace(/\s+/g, "");

test("binds equipment item interactions to the costume page as well as the general page", () => {
  assert.match(
    onlineSource,
    /const contents = root\.querySelectorAll\("\.content"\);\s*contents\.forEach\(\(content\) =>/
  );
});


test("keeps costume robe paperdoll state when the shoulder costume is removed", () => {
  const costumeRobeUpdate = "if (pkt.wearLocation & EquipmentLocation_default.COSTUME_ROBE) SessionStorage_default.Entity.robe = EquipmentController.getUI().checkEquipLoc(EquipmentLocation_default.COSTUME_ROBE);";
  const garmentUpdate = "if (pkt.wearLocation & EquipmentLocation_default.COSTUME_ROBE) SessionStorage_default.Entity.robe = EquipmentController.getUI().checkEquipLoc(EquipmentLocation_default.GARMENT);";
  assert.equal(compactSource.includes(compact(costumeRobeUpdate)), true);
  assert.equal(compactSource.includes(compact(garmentUpdate)), false);
});


test("keeps every head costume paperdoll slot mapped to its matching counterpart", () => {
  const expected = [
    ["HEAD_TOP", "COSTUME_HEAD_TOP", "accessory2"],
    ["HEAD_MID", "COSTUME_HEAD_MID", "accessory3"],
    ["HEAD_BOTTOM", "COSTUME_HEAD_BOTTOM", "accessory"],
  ];
  for (const [normal, costume, entity] of expected) {
    const normalUpdate = "if (pkt.wearLocation & EquipmentLocation_default." + normal + ") SessionStorage_default.Entity." + entity + " = EquipmentController.getUI().checkEquipLoc(EquipmentLocation_default." + costume + ");";
    const costumeUpdate = "if (pkt.wearLocation & EquipmentLocation_default." + costume + ") SessionStorage_default.Entity." + entity + " = EquipmentController.getUI().checkEquipLoc(EquipmentLocation_default." + normal + ");";
    assert.equal(compactSource.includes(compact(normalUpdate)), true, "normal " + normal + " should reveal costume " + costume);
    assert.equal(compactSource.includes(compact(costumeUpdate)), true, "costume " + costume + " should reveal normal " + normal);
  }
});


test("uses the item resource name for costume robe sprites", () => {
  assert.match(onlineSource, /location &\s*EquipmentLocation_default\.COSTUME_ROBE[\s\S]{0,200}?typeof RobeTable_default === "object"/);
  assert.match(onlineSource, /RobeTable_default\[pkt\.viewid\] = resourceName/);
  assert.match(onlineSource, /RobeTable_default\[spriteId\] = resourceName/);
  assert.doesNotMatch(onlineSource, /RobeTable_default\[3176\] = "c_rabbit_winged_robe"/);
});
