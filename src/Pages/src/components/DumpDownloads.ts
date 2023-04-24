import "./SvgIcon";
import {animateButtonClick, getDumpURL, hideElement} from "../util";
import {GameId} from "../types";

export default class DumpDownloads extends HTMLElement {
    static readonly sources: readonly { id: string, ext: string, text: string, desc: string, icon: string }[] = [
        { id: "html",       ext: "html",        text: "HTML",               desc: "Download structures list as HTML",                                       icon: "icon-html" },
        { id: "plain-text", ext: "txt",         text: "Plain Text",         desc: "Download structures list as plain text",                                 icon: "icon-txt" },
        { id: "json",       ext: "json",        text: "JSON",               desc: "Download raw JSON dump",                                                 icon: "icon-json" },
        { id: "tree-json",  ext: "tree.json",   text: "Preprocessed JSON",  desc: "Download preprocessed JSON dump. This is the data source for this site", icon: "icon-json" },
        /*{ id: "xsd",        ext: "xsd",         text: "XSD",        desc: "Download structures XML Schema Definition",  icon: "img/icon-xsd.svg" },*/
    ];

    static readonly html = `
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

    readonly #dropdown: HTMLElement;
    readonly #button: HTMLElement;
    readonly #panel: HTMLElement;
    readonly #onWindowClickHandler;
    #dropdownOpen: boolean;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpDownloads.html;

        const dropdown = shadow.getElementById("dropdown");
        if (dropdown === null) {
            throw new Error("dropdown element not found");
        }
        const button = shadow.getElementById("dropdown-button");
        if (button === null) {
            throw new Error("dropdown-button element not found");
        }
        const panel = shadow.getElementById("dropdown-panel");
        if (panel === null) {
            throw new Error("dropdown-panel element not found");
        }

        this.#dropdown = dropdown;
        this.#button = button;
        this.#panel = panel;

        this.#button.addEventListener("click", this.#onDropdownButtonClick.bind(this));
        this.#onWindowClickHandler = this.#onWindowClick.bind(this);

        this.#dropdownOpen = false;
    }

    connectedCallback(): void {
        const game = this.getAttribute("game");
        const build = this.getAttribute("build");
        if (game === null || build === null) {
            throw new Error("game and build attributes must be set");
        }
        this.setGameBuild(game as GameId, build);

        window.addEventListener("click", this.#onWindowClickHandler);
    }

    disconnectedCallback(): void {
        window.removeEventListener("click", this.#onWindowClickHandler);
    }

    setGameBuild(game: GameId, build: string): void {
        this.setAttribute("game", game);
        this.setAttribute("build", build);
        const shadow = this.shadowRoot!;
        for (const s of DumpDownloads.sources) {
            const link = shadow.getElementById(`link-${s.id}`) as HTMLAnchorElement | null;
            if (link === null) {
                throw new Error(`link-${s.id} element not found`);
            }
            link.href = getDumpURL(game, build, s.ext);
            link.addEventListener("click", () => {
                const svg = link.querySelector("svg");
                if (svg !== null) {
                    animateButtonClick(svg);
                }
            });
        }
    }

    #onWindowClick(e: MouseEvent): void {
        if (this.#dropdownOpen) {
            const buttonBounds = this.#button.getBoundingClientRect();
            const panelBounds = this.#panel.getBoundingClientRect();
            const isPointInRect = (x: number, y: number, rect: DOMRect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

            if (!isPointInRect(e.clientX, e.clientY, buttonBounds) && !isPointInRect(e.clientX, e.clientY, panelBounds)) {
                hideElement(this.#panel, true);
                this.#dropdownOpen = false;
            }
        }
    }

    #onDropdownButtonClick(e: MouseEvent): void {
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
