import { test } from "node:test";
import assert from "node:assert";
import { parseImageMarker, MAX_CUSTOMER_IMAGES } from "./image-marker.js";

test("no marker → text unchanged, query null", () => {
  const r = parseImageMarker("Dạ bên em có sản phẩm X giá 1tr ạ.");
  assert.strictEqual(r.query, null);
  assert.strictEqual(r.cleaned, "Dạ bên em có sản phẩm X giá 1tr ạ.");
});

test("marker at end → stripped from text, query extracted", () => {
  const r = parseImageMarker("Dạ đây là ảnh giao diện ạ.\n[[GUI_ANH: giao diện 9bizclaw]]");
  assert.strictEqual(r.query, "giao diện 9bizclaw");
  assert.ok(!r.cleaned.includes("GUI_ANH"), "marker must be stripped");
  assert.ok(r.cleaned.includes("ảnh giao diện"), "real text kept");
});

test("marker mid-sentence is stripped", () => {
  const r = parseImageMarker("Ảnh đây [[GUI_ANH: menu]] ạ");
  assert.strictEqual(r.query, "menu");
  assert.ok(!r.cleaned.includes("["));
});

test("malformed/unclosed marker never leaks, no send", () => {
  const r = parseImageMarker("Xem ảnh [[GUI_ANH: bảng giá");
  assert.strictEqual(r.query, null, "unclosed → no send");
  assert.ok(!r.cleaned.includes("GUI_ANH"), "fragment stripped");
});

test("multiple markers: first drives query, all stripped", () => {
  const r = parseImageMarker("a [[GUI_ANH: x]] b [[GUI_ANH: y]] c");
  assert.strictEqual(r.query, "x");
  assert.ok(!r.cleaned.includes("GUI_ANH"));
});

test("empty query marker → null", () => {
  const r = parseImageMarker("hi [[GUI_ANH: ]]");
  assert.strictEqual(r.query, null);
});

test("case + spacing tolerant", () => {
  const r = parseImageMarker("[[ gui_anh :  bảng giá  ]]");
  assert.strictEqual(r.query, "bảng giá");
});

test("cap constant is 10", () => { assert.strictEqual(MAX_CUSTOMER_IMAGES, 10); });
