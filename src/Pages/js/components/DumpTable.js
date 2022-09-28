import { gameIdToName } from '../util.js';
import DumpTableRow from "./DumpTableRow.js";

export default class DumpTable extends HTMLElement {
    #game;
    #body;

    constructor(game) {
        super();

        this.#game = game;

        const shadow = this.attachShadow({ mode: "open" });
        const template = document.getElementById("dump-table-template");
        const content = template.content.cloneNode(true);

        const header = content.querySelector("h2");
        header.classList.add(`${game}-font`);
        header.textContent = gameIdToName(game);
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
        this.#body.appendChild(new DumpTableRow(this.#game, build, aliases));
    }
}
customElements.define('dump-table', DumpTable);
