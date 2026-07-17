import { initLanguage } from "./language.js";

const logo = document.querySelector(".logo-container");

initLanguage();

if (logo) {
    window.requestAnimationFrame(() => {
        logo.classList.add("is-visible");
    });
}

window.setTimeout(() => {
    window.location.replace("/");
}, 3500);
