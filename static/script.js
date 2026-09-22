const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");

let expression = "";
let lastResult = null;
let memory = 0;

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
  try {
    const response = await fetch("/api/calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expression }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Invalid expression");
    }
    lastResult = data.result;
    expressionEl.textContent = expression + " =";
    resultEl.textContent = formatResult(data.result);
    resultEl.classList.remove("error");
    expression = String(data.result);
  } catch (err) {
    showError(err.message || "Error");
  }
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
  if (/^[0-9.+\-*/%()]$/.test(key)) {
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
