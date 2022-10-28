import { gameIdToFormattedName } from '../util.js';

export default class DumpTable extends HTMLElement {
    #game;
    #body;
    #rowTemplate;

    constructor(game) {
        super();

        this.#game = game;

        const shadow = this.attachShadow({ mode: "open" });

        this.#rowTemplate = document.getElementById("dump-table-row-template");
        const template = document.getElementById("dump-table-template");
        const content = template.content.cloneNode(true);

        const header = content.querySelector("h2");
        header.innerHTML = gameIdToFormattedName(game);
        this.#body = content.querySelector("tbody");

        shadow.appendChild(content);
    }

    addRow(build, aliases) {
        this.#body.appendChild(this.#createRow(build, aliases));
    }

    #createRow(build, aliases) {
        const row = this.#rowTemplate.content.cloneNode(true);

        const cols = row.querySelectorAll("td");
        cols[1].innerText = build;
        if (aliases.length > 0) {
            cols[2].innerText = aliases.join(", ");
        }
        cols[0].querySelector("a").href = `dump.html?game=${this.#game}&build=${build}`;
        const downloads = cols[0].querySelector("dump-downloads");
        downloads.setAttribute("game", this.#game);
        downloads.setAttribute("build", build);

        return row;
    }
}
customElements.define('dump-table', DumpTable);
