if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        const serviceWorkerUrl = new URL("service-worker.js", `${window.location.origin}/`).href;
        navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: "none" })
            .then((registration) => registration.update())
            .catch(() => {});
    });
}
import "./theme-toggle.js";
