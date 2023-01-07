import {gameIdToFormattedName, gameIdToName, hideElement} from '../util.js';

export default class DumpTable extends HTMLElement {

    static html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="dump-table-wrapper">
            <div class="dump-header row-layout">
                <h2 class="dump-title">Unknown game</h2>
                <button class="themed-button row-layout-push" id="compare" title="Compare">Compare</button>
                <span id="compare-help" class="dump-help-msg hidden">Select builds to compare: <span id="compare-build-a">???</span> ↔ <span id="compare-build-b">???</span></span>
            </div>
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
    #onBuildLinkClickHandler;
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

        const compare = shadow.getElementById("compare");
        compare.title = `Compare ${gameIdToName(this.#game)} builds`;
        compare.addEventListener("click", this.#onCompare.bind(this));
        this.#onBuildLinkClickHandler = this.#onBuildLinkClick.bind(this)
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
        const link = cols[0].querySelector("a");
        link.href = `dump.html?game=${this.#game}&build=${build}`;
        link.title = `Open dump browser for ${gameIdToName(this.#game)} build ${build}`;
        link.addEventListener("click", this.#onBuildLinkClickHandler);
        const downloads = cols[0].querySelector("dump-downloads");
        downloads.setAttribute("game", this.#game);
        downloads.setAttribute("build", build);

        return row;
    }

    #onCompare(e) {
        const table = this.#body.parentElement;
        const compareBtn = e.target;
        const compareHelp = this.shadowRoot.getElementById("compare-help");
        const isCompareSelecting = table.dataset.compare !== undefined;
        hideElement(compareHelp, isCompareSelecting);
        if (isCompareSelecting) {
            delete table.dataset.compare;

            compareBtn.title = compareBtn.titleOld;
            compareBtn.innerText = compareBtn.innerTextOld;
            this.shadowRoot.querySelectorAll("tr > td > a").forEach(a => {
                a.title = a.titleOld;
                a.href = a.hrefOld;
            });
        } else {
            table.dataset.compare = "";

            compareBtn.titleOld = compareBtn.title;
            compareBtn.innerTextOld = compareBtn.innerText;
            compareBtn.title = `Stop selecting ${gameIdToName(this.#game)} builds to compare`;
            compareBtn.innerText = "Stop selection";
            this.shadowRoot.querySelectorAll("tr > td > a").forEach(a => {
                a.titleOld = a.title;
                a.hrefOld = a.href;
                a.titleCompareSelect = `Select ${gameIdToName(this.#game)} build ${a.parentElement.parentElement.dataset.build} to compare`;
                a.titleCompareUnselect = `Unselect ${gameIdToName(this.#game)} build ${a.parentElement.parentElement.dataset.build} to compare`;
                a.title = a.titleCompareSelect;
                if (a.hrefCompare) {
                    a.href = a.hrefCompare;
                } else {
                    a.removeAttribute("href");
                }
            });
        }
    }

    #onBuildLinkClick(e) {
        const table = this.#body.parentElement;
        const isCompareSelecting = table.dataset.compare !== undefined;
        if (isCompareSelecting) {
            const link = e.target;
            const row = link.parentElement.parentElement;
            const build = row.dataset.build;
            if (this.#buildSelectedForCompare === null) {
                // selected first build
                link.title = link.titleCompareUnselect;
                row.dataset.compareSelected = "";
                this.shadowRoot.getElementById("compare-build-a").innerText = build;
                this.#buildSelectedForCompare = build;
                this.shadowRoot.querySelectorAll("tr > td > a").forEach(a => {
                    if (a !== link) { // give the diff.html URL to the other links
                        const secondBuild = a.parentElement.parentElement.dataset.build;
                        a.hrefCompare = `diff.html?game=${this.#game}&build-a=${build}&build-b=${secondBuild}`;
                        a.href = a.hrefCompare;
                    }
                });
            } else if (this.#buildSelectedForCompare === build) {
                // unselected first build
                link.title = link.titleCompareSelect;
                delete row.dataset.compareSelected;
                this.shadowRoot.getElementById("compare-build-a").innerText = "???";
                this.#buildSelectedForCompare = null;
                this.shadowRoot.querySelectorAll("tr > td > a").forEach(a => {
                    a.hrefCompare = null;
                    a.removeAttribute("href");
                });
            } else {
                // selected second build
                row.dataset.compareSelected = "";
                this.shadowRoot.getElementById("compare-build-b").innerText = build;
                // at this point the clicked link has a valid href with a diff.html URL which will open now
            }
        }
    }
}
customElements.define('dump-table', DumpTable);
