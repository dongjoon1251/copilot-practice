const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(
  path.join(__dirname, "..", "static", "script.js"),
  "utf8",
);

function createCalculator(responses) {
  const expression = { classList: { remove() {} }, textContent: "" };
  const result = {
    classList: {
      add() {},
      remove() {},
    },
    textContent: "0",
  };
  let keydownHandler = () => {};
  const requests = [];
  const buttons = [
    "memory-clear",
    "memory-recall",
    "memory-add",
    "memory-subtract",
    "equals",
    "clear",
  ].map((action) => ({
    dataset: { action },
    addEventListener(_, handler) {
      this.click = handler;
    },
  }));
  ["(", ")", "0", "2", "3", "4", "5", "7", "8", "+", "-", "/"].forEach((value) => {
    buttons.push({
      dataset: { value },
      addEventListener(_, handler) {
        this.click = handler;
      },
    });
  });

  vm.runInNewContext(script, {
    document: {
      getElementById(id) {
        return id === "expression" ? expression : result;
      },
      querySelectorAll() {
        return buttons;
      },
      addEventListener(eventName, handler) {
        if (eventName === "keydown") {
          keydownHandler = handler;
        }
      },
    },
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body));
      const response = responses.shift();
      return {
        ok: response.ok ?? true,
        json: async () => response,
      };
    },
  });

  return {
    expression,
    result,
    click(action) {
      buttons.find((button) => button.dataset.action === action).click();
    },
    clickValue(value) {
      buttons.find((button) => button.dataset.value === value).click();
    },
    pressKey(key) {
      let defaultPrevented = false;
      keydownHandler({
        key,
        preventDefault() {
          defaultPrevented = true;
        },
      });
      return defaultPrevented;
    },
    requests,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("M+, M-, MR, and MC preserve a valid memory value", async () => {
  const calculator = createCalculator([{ result: 5 }, { result: 8 }]);

  calculator.clickValue("2");
  calculator.clickValue("+");
  calculator.clickValue("3");
  calculator.click("equals");
  await settle();
  calculator.click("memory-add");

  calculator.click("clear");
  calculator.clickValue("5");
  calculator.clickValue("-");
  calculator.clickValue("3");
  calculator.click("equals");
  await settle();
  calculator.click("memory-subtract");
  calculator.click("clear");
  calculator.click("memory-recall");
  assert.equal(calculator.result.textContent, "-3");

  calculator.click("clear");
  calculator.clickValue("2");
  calculator.click("memory-recall");
  assert.equal(calculator.result.textContent, "2*(-3)");

  calculator.click("memory-clear");
  calculator.click("clear");
  calculator.click("memory-recall");
  assert.equal(calculator.result.textContent, "0");
});

test("memory does not change after an invalid expression", async () => {
  const calculator = createCalculator([
    { result: 7 },
    { ok: false, detail: "Division by zero" },
  ]);

  calculator.clickValue("3");
  calculator.clickValue("+");
  calculator.clickValue("4");
  calculator.click("equals");
  await settle();
  calculator.click("memory-add");

  calculator.click("clear");
  calculator.clickValue("8");
  calculator.clickValue("/");
  calculator.clickValue("0");
  calculator.click("equals");
  await settle();
  calculator.click("memory-add");
  calculator.click("clear");
  calculator.click("memory-recall");

  assert.equal(calculator.result.textContent, "7");
});

test("grouped expressions can mix keypad and keyboard input", async () => {
  const calculator = createCalculator([{ result: 5 }]);

  calculator.clickValue("(");
  calculator.pressKey("7");
  calculator.pressKey("+");
  calculator.pressKey("8");
  calculator.clickValue(")");
  calculator.clickValue("/");
  calculator.pressKey("3");
  assert.equal(calculator.pressKey("Enter"), true);
  await settle();

  assert.deepEqual(calculator.requests, [{ expression: "(7+8)/3" }]);
  assert.equal(calculator.expression.textContent, "(7+8)/3 =");
  assert.equal(calculator.result.textContent, "5");
});
