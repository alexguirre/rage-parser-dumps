import {gameIdToFormattedName, hideElement} from '../util.js';

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
                        <th></th>
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
            <td>
                <button title="Select for compare">Select for compare</button>
                <button title="Compare with selected" class="hidden">Compare with selected</button>
            </td>
        </tr>
    `;

    #game;
    #body;
    #rowTemplate;
    #onSelectForCompareHandler;
    #onCompareWithSelectedHandler;
    #buildSelectedForCompare;

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

        this.#onSelectForCompareHandler = this.#onSelectForCompare.bind(this);
        this.#onCompareWithSelectedHandler = this.#onCompareWithSelected.bind(this);
        this.#buildSelectedForCompare = null;
    }

    addRow(build, aliases) {
        this.#body.appendChild(this.#createRow(build, aliases));
        this.#body.lastElementChild.dataset.build = build;
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

        cols[3].querySelector("button:first-child").addEventListener("click", this.#onSelectForCompareHandler);
        cols[3].querySelector("button:last-child").addEventListener("click", this.#onCompareWithSelectedHandler);

        return row;
    }

    #onSelectForCompare(e) {
        console.log(e);
        console.log(e.target);
        const isSelected = e.target.dataset.selected !== undefined;
        if (isSelected) {
            // unselect
            this.#buildSelectedForCompare = null;
            delete e.target.dataset.selected;
            this.#body.querySelectorAll("tr > td:nth-child(4) > button:first-child").forEach(b => hideElement(b, false));
            this.#body.querySelectorAll("tr > td:nth-child(4) > button:last-child").forEach(b => hideElement(b, true));
        } else {
            // select
            this.#buildSelectedForCompare = e.target.parentElement.parentElement.dataset.build;
            e.target.dataset.selected = "";
            this.#body.querySelectorAll("tr > td:nth-child(4) > button:first-child").forEach(b => {
                if (b !== e.target) {
                    hideElement(b, true);
                }
            });
            this.#body.querySelectorAll("tr > td:nth-child(4) > button:last-child").forEach(b => {
                if (b.parentElement !== e.target.parentElement) {
                    hideElement(b, false);
                }
            });
        }
    }

    #onCompareWithSelected(e) {
        if (this.#buildSelectedForCompare === null) {
            return;
        }

        const buildA = this.#buildSelectedForCompare;
        const buildB = e.target.parentElement.parentElement.dataset.build;

        window.location = `diff.html?game=${this.#game}&build-a=${buildA}&build-b=${buildB}`;
    }
}
customElements.define('dump-table', DumpTable);
