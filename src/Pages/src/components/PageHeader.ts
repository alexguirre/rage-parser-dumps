import "./SvgIcon.js";
import { THEME_SWITCHER_ID, themeInit } from "../theming.js";

export default class PageHeader extends HTMLElement {
    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <link rel="stylesheet" href="css/style.css">
            <a class="header-title" href="." title="Home">rage::par</a>
            <a class="header-push header-icon" href="https://github.com/alexguirre/rage-parser-dumps" title="GitHub Repository">
                <svg-icon icon="github" clickable />
            </a>
            <button id="${THEME_SWITCHER_ID}" class="header-icon" title="Toggle Theme">
                <svg-icon icon="theme-switcher" clickable />
            </button>
        `;

        themeInit(shadow);
    }
}
customElements.define('page-header', PageHeader, { extends: "header" });
