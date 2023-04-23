import "./SvgIcon";
import {animateButtonClick, getDumpURL, hideElement} from "../util";

export default class DumpDownloads extends HTMLElement {
    static sources = [
        { id: "html",       ext: "html",        text: "HTML",               desc: "Download structures list as HTML",                                       icon: "icon-html" },
        { id: "plain-text", ext: "txt",         text: "Plain Text",         desc: "Download structures list as plain text",                                 icon: "icon-txt" },
        { id: "json",       ext: "json",        text: "JSON",               desc: "Download raw JSON dump",                                                 icon: "icon-json" },
        { id: "tree-json",  ext: "tree.json",   text: "Preprocessed JSON",  desc: "Download preprocessed JSON dump. This is the data source for this site", icon: "icon-json" },
        /*{ id: "xsd",        ext: "xsd",         text: "XSD",        desc: "Download structures XML Schema Definition",  icon: "img/icon-xsd.svg" },*/
    ];

    static html = `
        <link rel="stylesheet" href="css/style.css">
        <div id="dropdown" class="dump-downloads-dropdown">
            <button id="dropdown-button" class="header-icon dump-downloads-button" title="Download">
                <svg-icon icon="download" clickable />
            </button>
            <div id="dropdown-panel" class="dump-downloads-dropdown-panel hidden">
                ${DumpDownloads.sources.map(s =>
                    `<a id="link-${s.id}" download title="${s.desc}" class="dump-downloads-dropdown-entry header-icon">
                            <svg-icon icon="${s.icon}">
                            ${s.text}
                    </a>`).join("")}
            </div>
        </div>
    `;

    #dropdown;
    #button;
    #panel;
    #onWindowClickHandler;
    #dropdownOpen;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpDownloads.html;

        this.#dropdown = shadow.getElementById("dropdown");
        this.#button = shadow.getElementById("dropdown-button");
        this.#panel = shadow.getElementById("dropdown-panel");

        this.#button.addEventListener("click", this.#onDropdownButtonClick.bind(this));
        this.#onWindowClickHandler = this.#onWindowClick.bind(this);

        this.#dropdownOpen = false;
    }

    connectedCallback() {
        const game = this.getAttribute("game");
        const build = this.getAttribute("build");
        this.setGameBuild(game, build);

        window.addEventListener("click", this.#onWindowClickHandler);
    }

    disconnectedCallback() {
        window.removeEventListener("click", this.#onWindowClickHandler);
    }

    setGameBuild(game, build) {
        this.setAttribute("game", game);
        this.setAttribute("build", build);
        const shadow = this.shadowRoot;
        for (const s of DumpDownloads.sources) {
            const link = shadow.getElementById(`link-${s.id}`);
            link.href = getDumpURL(game, build, s.ext);
            link.addEventListener("click", () => animateButtonClick(link.querySelector("svg")));
        }
    }

    #onWindowClick(e) {
        if (this.#dropdownOpen) {
            const buttonBounds = this.#button.getBoundingClientRect();
            const panelBounds = this.#panel.getBoundingClientRect();
            const isPointInRect = (x, y, rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

            if (!isPointInRect(e.clientX, e.clientY, buttonBounds) && !isPointInRect(e.clientX, e.clientY, panelBounds)) {
                hideElement(this.#panel, true);
                this.#dropdownOpen = false;
            }
        }
    }

    #onDropdownButtonClick(e) {
        if (!this.#dropdownOpen) {
            // anchor panel on left/right side relative to the button, so it is inside the viewport always
            const middle = window.innerWidth / 2;
            if (this.#dropdown.offsetLeft <= middle) {
                this.#panel.classList.remove("dump-downloads-dropdown-panel-right");
                this.#panel.classList.add("dump-downloads-dropdown-panel-left");
            } else {
                this.#panel.classList.remove("dump-downloads-dropdown-panel-left");
                this.#panel.classList.add("dump-downloads-dropdown-panel-right");
            }
        }

        hideElement(this.#panel, this.#dropdownOpen);
        this.#dropdownOpen = !this.#dropdownOpen;
        e.stopPropagation();
        e.preventDefault();
    }
}
customElements.define('dump-downloads', DumpDownloads);
