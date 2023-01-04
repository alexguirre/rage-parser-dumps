import { gameIdToFormattedName } from '../util.js';

export default class DumpTable extends HTMLElement {

    static html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="dump-table-wrapper">
            <h2 class="dump-title">Unknown game</h2>
            <table class="themed-table dump-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Build</th>
                        <th>Aliases</th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            </table>
        </div>
    `;

    static htmlRow = `
        <tr>
            <td>
                <a class="dump-link" title="Open Dump Browser"></a>
                <dump-downloads></dump-downloads>
            </td>
            <td>???</td>
            <td>–</td>
        </tr>
    `;

    #game;
    #body;
    #rowTemplate;

    constructor(game) {
        super();

        this.#game = game;

        this.#rowTemplate = document.createElement("template");
        this.#rowTemplate.innerHTML = DumpTable.htmlRow;

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpTable.html;

        const header = shadow.querySelector("h2");
        header.innerHTML = gameIdToFormattedName(game);
        this.#body = shadow.querySelector("tbody");
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
