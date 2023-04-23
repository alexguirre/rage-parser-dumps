import {gameIdToFormattedName, gameIdToName, hideElement} from '../util';
import {GameId, RegistryEntry} from "../types";

/**
 * Extra data associated to a row link for implementing the "compare selection" mode.
 */
type RowLinkExtraData = {
    titleOld: string;
    hrefOld: string;
    titleCompareSelect: string;
    titleCompareUnselect: string;
    hrefCompare: string | null;
};

/**
 * Table that displays the available builds for a game.
 */
export default class DumpTable extends HTMLElement {

    static readonly html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="dump-table-wrapper">
            <div class="dump-header row-layout">
                <h2 class="dump-title">Unknown game</h2>
                <div class="row-layout-push"></div>
                <span id="compare-help" class="dump-help-msg hidden">Select builds to compare: <span id="compare-build-a">???</span> ↔ <span id="compare-build-b">???</span></span>
                <button class="themed-button" id="compare" title="Compare">Compare</button>
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

    static readonly htmlRow = `
        <tr>
            <td>
                <a class="dump-link" title="Open Dump Browser"></a>
                <dump-downloads></dump-downloads>
            </td>
            <td>???</td>
            <td>–</td>
        </tr>
    `;

    readonly #game: GameId;
    readonly #body: HTMLTableSectionElement;
    readonly #rowTemplate: HTMLTemplateElement;
    readonly #onBuildLinkClickHandler;
    #buildSelectedForCompare: string | null = null;

    // used to restore the original text when switching to "compare selection" mode
    #compareBtnTitleOld: string = "";
    #compareBtnInnerTextOld: string = "";
    #linksExtraData: WeakMap<HTMLAnchorElement, RowLinkExtraData> | null = null;

    constructor(game: GameId) {
        super();

        this.#game = game;

        this.#rowTemplate = document.createElement("template");
        this.#rowTemplate.innerHTML = DumpTable.htmlRow;

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpTable.html;

        const header = shadow.querySelector("h2");
        if (header === null) {
            throw new Error("h2 element not found");
        }
        header.innerHTML = gameIdToFormattedName(game);

        const body = shadow.querySelector("tbody");
        if (body === null) {
            throw new Error("tbody element not found");
        }
        this.#body = body;

        const compare = shadow.getElementById("compare");
        if (compare === null) {
            throw new Error("compare button not found");
        }
        compare.title = `Compare ${gameIdToName(this.#game)} builds`;
        compare.addEventListener("click", this.#onCompare.bind(this));

        this.#onBuildLinkClickHandler = this.#onBuildLinkClick.bind(this);
    }

    addRow(entry: RegistryEntry): void {
        this.#body.appendChild(this.#createRow(entry));
        (this.#body.lastElementChild as HTMLElement).dataset["build"] = entry.build;
    }

    #createRow(entry: RegistryEntry): Node {
        const row = this.#rowTemplate.content.cloneNode(true) as DocumentFragment;

        const cols = row.querySelectorAll("td");
        if (cols.length !== 3) {
            throw new Error("expected 3 columns in row template");
        }
        cols[1].innerText = entry.build;
        if (entry.aliases.length > 0) {
            cols[2].innerText = entry.aliases.join(", ");
        }

        const link = cols[0].querySelector("a");
        if (link === null) {
            throw new Error("link element not found in row template");
        }
        link.href = `dump.html?game=${this.#game}&build=${entry.build}`;
        link.title = `Open dump browser for ${gameIdToName(this.#game)} build ${entry.build}`;
        link.addEventListener("click", this.#onBuildLinkClickHandler);

        const downloads = cols[0].querySelector("dump-downloads");
        if (downloads === null) {
            throw new Error("dump-downloads element not found in row template");
        }
        downloads.setAttribute("game", this.#game);
        downloads.setAttribute("build", entry.build);

        return row;
    }

    #onCompare(e: MouseEvent): void {
        if (this.#linksExtraData === null) {
            this.#linksExtraData = new WeakMap();
        }

        const shadowRoot = this.shadowRoot!;
        const table = this.#body.parentElement;
        if (table === null) {
            throw new Error("table element not found");
        }
        const compareBtn = e.target as HTMLButtonElement | null;
        if (compareBtn === null) {
            throw new Error("compare button event target not found");
        }
        const compareHelp = this.shadowRoot!.getElementById("compare-help");
        if (compareHelp === null) {
            throw new Error("compare-help element not found");
        }
        const isCompareSelecting = this.dataset["compare"] !== undefined;
        hideElement(compareHelp, isCompareSelecting);
        if (isCompareSelecting) {
            delete this.dataset["compare"];
            delete table.dataset["compare"];

            compareBtn.title = this.#compareBtnTitleOld;
            compareBtn.innerText = this.#compareBtnInnerTextOld;
            shadowRoot.querySelectorAll("tr > td > a").forEach(elem => {
                const a = elem as HTMLAnchorElement;
                const aData = this.#linksExtraData!.get(a);
                if (aData === undefined) {
                    throw new Error("link extra data not found");
                }
                a.title = aData.titleOld;
                a.href = aData.hrefOld;
            });
        } else {
            this.dataset["compare"] = "";
            table.dataset["compare"] = "";

            this.#compareBtnTitleOld = compareBtn.title;
            this.#compareBtnInnerTextOld = compareBtn.innerText;
            compareBtn.title = `Stop selecting ${gameIdToName(this.#game)} builds to compare`;
            compareBtn.innerText = "Cancel";
            shadowRoot.querySelectorAll("tr > td > a").forEach(elem => {
                const a = elem as HTMLAnchorElement;
                const data= this.#linksExtraData?.get(a) || {
                    titleOld: "",
                    hrefOld: "",
                    titleCompareSelect: "",
                    titleCompareUnselect: "",
                    hrefCompare: null,
                };

                data.titleOld = a.title;
                data.hrefOld = a.href;
                data.titleCompareSelect = `Select ${gameIdToName(this.#game)} build ${a.parentElement!.parentElement!.dataset["build"]} to compare`;
                data.titleCompareUnselect = `Unselect ${gameIdToName(this.#game)} build ${a.parentElement!.parentElement!.dataset["build"]} to compare`;
                this.#linksExtraData!.set(a, data);
                a.title = data.titleCompareSelect;
                if (data.hrefCompare) {
                    a.href = data.hrefCompare;
                } else {
                    a.href = "#";
                }
            });
        }
    }

    #onBuildLinkClick(e: MouseEvent): void {
        const isCompareSelecting = this.dataset["compare"] !== undefined;
        if (isCompareSelecting) {
            if (this.#linksExtraData === null) {
                this.#linksExtraData = new WeakMap();
            }

            const shadowRoot = this.shadowRoot!;
            const link = e.target as HTMLAnchorElement | null;
            if (link === null) {
                throw new Error("link event target not found");
            }
            const linkData = this.#linksExtraData!.get(link);
            if (linkData === undefined) {
                throw new Error("link extra data not found");
            }
            const row = link.parentElement!.parentElement!;
            const build = row.dataset["build"];
            if (build === undefined) {
                throw new Error("expected build data attribute in row");
            }

            if (this.#buildSelectedForCompare === null) {
                // selected first build
                link.title = linkData.titleCompareUnselect;
                row.dataset["compareSelected"] = "";
                shadowRoot.getElementById("compare-build-a")!.innerText = build;
                this.#buildSelectedForCompare = build;
                shadowRoot.querySelectorAll("tr > td > a").forEach(elem => {
                    const a = elem as HTMLAnchorElement;
                    if (a !== link) { // give the diff.html URL to the other links
                        const aData = this.#linksExtraData!.get(a);
                        if (aData === undefined) {
                            throw new Error("link extra data not found");
                        }
                        const secondBuild = a.parentElement!.parentElement!.dataset["build"];
                        aData.hrefCompare = `diff.html?game=${this.#game}&build-a=${build}&build-b=${secondBuild}`;
                        a.href = aData.hrefCompare;
                    }
                });
                e.preventDefault(); // prevent adding # to the URL
            } else if (this.#buildSelectedForCompare === build) {
                // unselected first build
                link.title = linkData.titleCompareSelect;
                delete row.dataset["compareSelected"];
                shadowRoot.getElementById("compare-build-a")!.innerText = "???";
                this.#buildSelectedForCompare = null;
                shadowRoot.querySelectorAll("tr > td > a").forEach(elem => {
                    const a = elem as HTMLAnchorElement;
                    const aData = this.#linksExtraData!.get(a);
                    if (aData === undefined) {
                        throw new Error("link extra data not found");
                    }
                    aData.hrefCompare = null;
                    a.href = "#";
                });
                e.preventDefault(); // prevent adding # to the URL
            } else {
                // selected second build
                row.dataset["compareSelected"] = "";
                shadowRoot.getElementById("compare-build-b")!.innerText = build;
                // at this point the clicked link has a valid href with a diff.html URL which will open now
            }
        }
    }
}
customElements.define('dump-table', DumpTable);
