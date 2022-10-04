import { gameIdToFormattedName, getDumpURL } from '../util.js';

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

        // expand/collapse not needed for now
        // this.#table = content.querySelector("table");
        // this.#table.hidden = true;
        // header.addEventListener("click", () => {
        //     this.#table.hidden = !this.#table.hidden;
        // });

        shadow.appendChild(content);
    }

    addRow(build, aliases) {
        this.#body.appendChild(this.#createRow(build, aliases));
    }

    #createRow(build, aliases) {
        const row = this.#rowTemplate.content.cloneNode(true);

        const cols = row.querySelectorAll("td");
        cols[0].textContent = build;
        if (aliases.length > 0) {
            cols[1].textContent = aliases.join(", ");
        }
        cols[2].querySelector(".dump-icon-page").href = `dump.html?game=${this.#game}&build=${build}`;
        cols[2].querySelector(".dump-icon-html").href = getDumpURL(this.#game, build, "html");
        cols[2].querySelector(".dump-icon-plain-text").href = getDumpURL(this.#game, build, "txt");
        cols[2].querySelector(".dump-icon-json").href = getDumpURL(this.#game, build, "json");
        cols[2].querySelector(".dump-icon-xsd").href = getDumpURL(this.#game, build, "xsd");

        return row;

    }
}
customElements.define('dump-table', DumpTable);
