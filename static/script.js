const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const historyListEl = document.getElementById("history-list");
const clearHistoryButton = document.getElementById("clear-history");
const HISTORY_STORAGE_KEY = "calculator-history";
const MAX_HISTORY_ITEMS = 20;

let expression = "";
let lastResult = null;
let memory = 0;
let history = loadHistory();

function render() {
  expressionEl.textContent = expression;
  resultEl.classList.remove("error");
}

function showError(message) {
  resultEl.textContent = message;
  resultEl.classList.add("error");
}

function appendValue(value) {
  expression += value;
  lastResult = null;
  resultEl.textContent = expression || "0";
  render();
}

function clearAll() {
  expression = "";
  lastResult = null;
  resultEl.textContent = "0";
  render();
}

function backspace() {
  expression = expression.slice(0, -1);
  lastResult = null;
  resultEl.textContent = expression || "0";
  render();
}

function clearMemory() {
  memory = 0;
}

function recallMemory() {
  const memoryValue = formatResult(memory);
  const needsMultiplication = expression && /[0-9)]$/.test(expression);
  const recalledValue = memory < 0 && expression
    ? `(${memoryValue})`
    : memoryValue;
  expression += needsMultiplication ? `*${recalledValue}` : recalledValue;
  lastResult = null;
  resultEl.textContent = expression;
  render();
}

function updateMemory(operation) {
  if (lastResult === null) {
    return;
  }
  memory = operation(memory, lastResult);
}

async function evaluateExpression() {
  if (!expression.trim()) {
    return;
  }
  const evaluatedExpression = expression;
  try {
    const response = await fetch("/api/calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expression: evaluatedExpression }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Invalid expression");
    }
    lastResult = data.result;
    addHistoryItem(evaluatedExpression, data.result);
    expressionEl.textContent = evaluatedExpression + " =";
    resultEl.textContent = formatResult(data.result);
    resultEl.classList.remove("error");
    expression = String(data.result);
  } catch (err) {
    showError(err.message || "Error");
  }
}

function loadHistory() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const savedHistory = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(savedHistory)) {
      return [];
    }
    return savedHistory
      .filter((item) => (
        item
        && typeof item.expression === "string"
        && typeof item.result === "number"
        && Number.isFinite(item.result)
      ))
      .slice(0, MAX_HISTORY_ITEMS);
  } catch (error) {
    return [];
  }
}

function saveHistory() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
}

function addHistoryItem(evaluatedExpression, value) {
  history.unshift({ expression: evaluatedExpression, result: value });
  history = history.slice(0, MAX_HISTORY_ITEMS);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  historyListEl.replaceChildren();
  history.forEach((item) => {
    const historyItem = document.createElement("li");
    const restoreButton = document.createElement("button");
    const savedExpression = document.createElement("span");
    const savedResult = document.createElement("span");

    restoreButton.type = "button";
    restoreButton.className = "history-entry";
    restoreButton.addEventListener("click", () => {
      expression = item.expression;
      lastResult = null;
      resultEl.textContent = expression;
      render();
    });
    savedExpression.className = "history-expression";
    savedExpression.textContent = item.expression;
    savedResult.className = "history-result";
    savedResult.textContent = `= ${formatResult(item.result)}`;
    restoreButton.append(savedExpression, savedResult);
    historyItem.append(restoreButton);
    historyListEl.append(historyItem);
  });
  clearHistoryButton.disabled = history.length === 0;
}

function clearHistory() {
  history = [];
  saveHistory();
  renderHistory();
}

function formatResult(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toFixed(10)).toString();
}

document.querySelectorAll(".key").forEach((button) => {
  button.addEventListener("click", () => {
    const { action, value } = button.dataset;
    if (action === "clear") {
      clearAll();
    } else if (action === "backspace") {
      backspace();
    } else if (action === "equals") {
      evaluateExpression();
    } else if (action === "memory-clear") {
      clearMemory();
    } else if (action === "memory-recall") {
      recallMemory();
    } else if (action === "memory-add") {
      updateMemory((currentMemory, result) => currentMemory + result);
    } else if (action === "memory-subtract") {
      updateMemory((currentMemory, result) => currentMemory - result);
    } else if (value !== undefined) {
      appendValue(value);
    }
  });
});

document.addEventListener("keydown", (event) => {
  const { key } = event;
  if (/^[0-9.+\-*/%]$/.test(key)) {
    appendValue(key);
  } else if (key === "Enter" || key === "=") {
    event.preventDefault();
    evaluateExpression();
  } else if (key === "Backspace") {
    backspace();
  } else if (key === "Escape") {
    clearAll();
  }
});

clearHistoryButton.addEventListener("click", clearHistory);
renderHistory();
