import { getDumpURL, hideElement } from "../util.js";

export default class DumpDownloads extends HTMLElement {
    static sources = [
        { id: "html",       ext: "html",        text: "HTML",       desc: "Download structures list as HTML",           icon: "img/icon-html.svg" },
        { id: "plain-text", ext: "txt",         text: "Plain Text", desc: "Download structures list as plain text",     icon: "img/icon-txt.svg" },
        { id: "json",       ext: "json",        text: "JSON",       desc: "Download JSON dump",                         icon: "img/icon-json.svg" },
        { id: "tree-json",  ext: "tree.json",   text: "tree.json",  desc: "Download tree.json",                         icon: "img/icon-json.svg" },
        /*{ id: "xsd",        ext: "xsd",         text: "XSD",        desc: "Download structures XML Schema Definition",  icon: "img/icon-xsd.svg" },*/
    ];

    static html = `
        <link rel="stylesheet" href="css/style.css">
        <div id="dropdown" class="dump-downloads-dropdown">
            <button id="dropdown-button" class="header-icon dump-downloads-button" title="Download">
                <img src="img/download.svg">
            </button>
            <div id="dropdown-panel" class="dump-downloads-dropdown-panel hidden">
                ${DumpDownloads.sources.map(s => `<a id="link-${s.id}" download title="${s.desc}" class="header-icon dump-downloads-button"><img src="${s.icon}">${s.text}</a>`).join("")}
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
            shadow.getElementById(`link-${s.id}`).href = getDumpURL(game, build, s.ext);
        }
    }

    #onWindowClick(e) {
        if (this.#dropdownOpen && e.originalTarget.closest("#dropdown") !== this.#dropdown) {
            hideElement(this.#panel, true);
            this.#dropdownOpen = false;
        }
    }

    #onDropdownButtonClick(e) {
        hideElement(this.#panel, this.#dropdownOpen);
        this.#dropdownOpen = !this.#dropdownOpen;
    }
}
customElements.define('dump-downloads', DumpDownloads);
