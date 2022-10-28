import { THEME_SWITCHER_ID, themeInit } from "../theming.js";

export default class PageHeader extends HTMLElement {
    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = /*html*/`
            <link rel="stylesheet" href="css/style.css">
            <a class="header-title" href="." title="Home">rage::par</a>
            <a class="header-push header-icon" href="https://github.com/alexguirre/rage-parser-dumps" title="GitHub Repository">
                <img src="img/github.svg">
            </a>
            <button id="${THEME_SWITCHER_ID}" class="header-icon" title="Toggle Theme">
                <img src="img/theme-switcher.svg">
            </button>
        `;

        themeInit(shadow);
    }
}
customElements.define('page-header', PageHeader, { extends: "header" });
