function noOpController() {
  return { sync() {}, setBusy() {}, get isBusy() { return false; } };
}

export function createActionReadiness({ button, controls = [], isReady }) {
  if (!button || typeof isReady !== "function") return noOpController();
  let busy = false;

  function sync() {
    const ready = !busy && Boolean(isReady());
    button.disabled = !ready;
    button.dataset.inputAction = "";
    button.dataset.actionState = busy ? "busy" : ready ? "ready" : "waiting";
  }

  [...controls].filter(Boolean).forEach((control) => {
    control.addEventListener("input", sync);
    control.addEventListener("change", sync);
  });

  sync();
  return {
    sync,
    setBusy(value) { busy = Boolean(value); sync(); },
    get isBusy() { return busy; }
  };
}

export function createFormActionReadiness(form, button, options = {}) {
  if (!form || !button) return noOpController();
  const controls = [...form.querySelectorAll("input, textarea, select")];
  const requiredTextIsPresent = () => controls.every((control) => {
    if (!control.required || !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return true;
    if (control.type === "checkbox" || control.type === "radio" || control.type === "file") return true;
    return control.value.trim().length > 0;
  });
  const controller = createActionReadiness({
    button,
    controls,
    isReady: () => form.checkValidity() && requiredTextIsPresent() && (options.isReady?.() ?? true)
  });
  form.addEventListener("reset", () => requestAnimationFrame(controller.sync));
  return controller;
}
