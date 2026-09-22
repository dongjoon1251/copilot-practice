const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(
  path.join(__dirname, "..", "static", "script.js"),
  "utf8",
);

function createElement() {
  return {
    children: [],
    classList: { add() {}, remove() {} },
    addEventListener(_, handler) {
      this.click = handler;
    },
    append(...children) {
      this.children.push(...children);
    },
  };
}

function createCalculator(responses, savedHistory = "[]") {
  const expression = { classList: { remove() {} }, textContent: "" };
  const result = {
    classList: {
      add() {},
      remove() {},
    },
    textContent: "0",
  };
  const historyList = {
    children: [],
    append(child) {
      this.children.push(child);
    },
    replaceChildren() {
      this.children = [];
    },
  };
  const clearHistory = createElement();
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
  ["0", "2", "3", "4", "5", "7", "8", "+", "-", "/"].forEach((value) => {
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
        if (id === "expression") {
          return expression;
        }
        if (id === "result") {
          return result;
        }
        if (id === "history-list") {
          return historyList;
        }
        return clearHistory;
      },
      createElement,
      querySelectorAll() {
        return buttons;
      },
      addEventListener() {},
    },
    localStorage: {
      value: savedHistory,
      getItem() {
        return this.value;
      },
      setItem(_, value) {
        this.value = value;
      },
    },
    fetch: async () => {
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
    historyList,
    clearHistory,
    click(action) {
      buttons.find((button) => button.dataset.action === action).click();
    },
    clickValue(value) {
      buttons.find((button) => button.dataset.value === value).click();
    },
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

test("successful calculations are saved, restored, and cleared from history", async () => {
  const calculator = createCalculator([{ result: 5 }, { result: 8 }]);

  calculator.clickValue("2");
  calculator.clickValue("+");
  calculator.clickValue("3");
  calculator.click("equals");
  await settle();
  calculator.click("clear");
  calculator.clickValue("5");
  calculator.clickValue("+");
  calculator.clickValue("3");
  calculator.click("equals");
  await settle();

  assert.equal(calculator.historyList.children.length, 2);
  const latestEntry = calculator.historyList.children[0].children[0];
  assert.equal(latestEntry.children[0].textContent, "5+3");
  assert.equal(latestEntry.children[1].textContent, "= 8");

  latestEntry.click();
  assert.equal(calculator.result.textContent, "5+3");

  calculator.clearHistory.click();
  assert.equal(calculator.historyList.children.length, 0);
  assert.equal(calculator.clearHistory.disabled, true);
});

test("history keeps valid saved entries and excludes failed calculations", async () => {
  const calculator = createCalculator(
    [{ ok: false, detail: "Division by zero" }],
    JSON.stringify([
      { expression: "1+1", result: 2 },
      { expression: "invalid", result: "not a number" },
    ]),
  );

  assert.equal(calculator.historyList.children.length, 1);
  calculator.clickValue("8");
  calculator.clickValue("/");
  calculator.clickValue("0");
  calculator.click("equals");
  await settle();

  assert.equal(calculator.historyList.children.length, 1);
});

test("history retains only the 20 most recent calculations", async () => {
  const calculator = createCalculator(
    Array.from({ length: 21 }, () => ({ result: 2 })),
  );

  for (let index = 0; index < 21; index += 1) {
    calculator.click("clear");
    calculator.clickValue("2");
    calculator.click("equals");
    await settle();
  }

  assert.equal(calculator.historyList.children.length, 20);
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
