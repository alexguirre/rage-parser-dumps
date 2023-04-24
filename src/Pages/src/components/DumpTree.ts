import "./SvgIcon";
import "./CodeSnippet";
import "./DumpDownloads";
import {animateButtonClick, gameIdToFormattedName, hideElement} from "../util";
import DumpDownloads from "./DumpDownloads";
import {GameId, JTree, JTreeNode, JTreeStructNode} from "../types";

type TreeNodeType = "struct" | "enum";
class TreeNode {
    readonly type: TreeNodeType;
    readonly name: string;
    readonly nameLowerCase: string;
    readonly markup: string;
    readonly markupLowerCase: string;
    element: HTMLLIElement | null = null;
    previousSibling: TreeNode | null = null;
    nextSibling: TreeNode | null = null;
    parent: TreeNode | null = null;
    children: TreeNode[] | null = null;
    /**
     * Object with the JSON data.
     */
    readonly data: JTreeNode;

    constructor(type: TreeNodeType, nodeData: JTreeNode, noChildren: boolean= false) {
        this.type = type;
        this.name = nodeData.name;
        this.markup = nodeData.markup;
        this.nameLowerCase = this.name.toLowerCase();
        this.markupLowerCase = this.markup.toLowerCase();
        this.data = nodeData;

        const structNode = nodeData as JTreeStructNode;
        if (!noChildren && structNode.children && structNode.children.length > 0) {
            this.children = new Array(structNode.children.length);
            for (let i = 0; i < structNode.children.length; i++) {
                this.children[i] = new TreeNode("struct", structNode.children[i]);
            }
            this.children.sort(TreeNode.compare);
        }
    }

    /**
     * Creates an unlinked copy of this node.
     */
    copy(): TreeNode {
        const copy = new TreeNode(this.type, this.data, true);
        copy.element = this.element;
        copy.previousSibling = null;
        copy.nextSibling = null;
        copy.parent = null;
        copy.children = null;
        return copy;
    }

    hasChildren(): boolean { return this.children !== null && this.children.length > 0; }
    isExpanded(): boolean {
        const detailsElem = (this.hasChildren() && this.element?.querySelector("details")) || null;
        return detailsElem !== null && detailsElem.open;
    }
    expand(state: boolean): void {
        const detailsElem = (this.hasChildren() && this.element?.querySelector("details")) || null;
        if (detailsElem !== null) {
            detailsElem.open = state;
        }
    }

    static compare(a: TreeNode, b: TreeNode): number { return a.name.localeCompare(b.name, "en"); }
}

export default class DumpTree extends HTMLElement {
    static readonly URL_PARAM_GAME = "game";
    static readonly URL_PARAM_BUILD = "build";
    static readonly URL_PARAM_BUILD_A = "build-a";
    static readonly URL_PARAM_BUILD_B = "build-b";
    static readonly URL_PARAM_SEARCH = "search";

    static readonly html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="dump-tree-root">
            <div id="subheader" class="row-layout hidden">
                <div id="game-info"></div>
                <div id="search-box">
                    <input id="search-input" type="text" placeholder="Search..." />
                    <div id="search-options" class="row-layout">
                        <button id="search-toggle-match-case"    class="header-icon dump-search-toggle" title="Match Case"><svg-icon icon="match-case" clickable /></button>
                        <button id="search-toggle-regex"         class="header-icon dump-search-toggle" title="Use Regular Expression"><svg-icon icon="regex" clickable /></button>
                        <button id="search-toggle-match-members" class="header-icon dump-search-toggle" title="Match Members"><svg-icon icon="match-members" clickable /></button>
                        <button id="search-toggle-show-children" class="header-icon dump-search-toggle" title="Show Children"><svg-icon icon="show-children" clickable /></button>
                    </div>
                </div>
                <dump-downloads id="downloads" class="row-layout-push"></dump-downloads>
            </div>
            <div id="contents" class="hidden">
                <div id="tree" tabindex="0">
                    <p id="no-results-msg" class="dump-help-msg hidden">No results found.</p>
                </div>
                <div id="splitter"></div>
                <div id="details">
                    <p id="details-help-tip" class="dump-help-msg">Select a type to display its details here.</p>
                    <div id="details-view" class="hidden">
                        <div class="row-layout">
                            <button id="details-link" class="header-icon" title="Copy link">
                                <svg-icon icon="link" clickable />
                            </button>
                            <h3 id="details-name">CSomeStruct</h3>
                        </div>
                        <code-snippet id="details-struct" code-lang="cpp"></code-snippet>
                        <div class="dump-details-section-contents row-layout">
                            <span id="details-version">Version - 1.0</span>
                            <span id="details-size">Size - 123</span>
                            <span id="details-alignment">Alignment - 123</span>
                        </div>
                        <details id="details-fields-section" open>
                            <summary><h4 class="dump-details-title">Fields</h4></summary>
                            <table id="details-fields" class="themed-table dump-details-section-contents">
                                <thead>
                                    <tr>
                                        <th>Offset</th>
                                        <th>Name</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody id="details-fields-body">
                                </tbody>
                            </table>
                        </details>
                        <details id="details-usage-list-section" open>
                            <summary><h4 class="dump-details-title">Used in</h4></summary>
                            <ul id="details-usage-list" class="dump-details-section-contents">
                            </ul>
                        </details>
                        <details id="details-xml-section" open>
                            <summary><h4 class="dump-details-title">XML example</h4></summary>
                            <div class="dump-details-section-contents"><code-snippet id="details-xml" code-lang="xml"></code-snippet></div>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    `;

    #game: GameId | null = null;
    #buildA: string | null = null;
    #buildB: string | null = null;
    #treeNavFocusNode: TreeNode | null = null;
    #selectedEntryBtn: HTMLElement | null = null;
    #selectedEntryNode: TreeNode | null = null;
    #nodes: TreeNode[] = [];
    #visibleNodes: TreeNode[] = [];
    readonly #tree: HTMLElement;
    readonly #detailsContainer: HTMLElement;
    readonly #detailsView: HTMLElement;
    readonly #detailsLink: HTMLButtonElement;
    readonly #detailsHelpTip: HTMLElement;
    readonly #detailsName: HTMLElement;
    readonly #detailsStruct: HTMLElement;
    readonly #detailsVersion: HTMLElement;
    readonly #detailsSize: HTMLElement;
    readonly #detailsAlignment: HTMLElement;
    readonly #detailsFieldsSection: HTMLElement;
    readonly #detailsFieldsBody: HTMLElement;
    readonly #detailsUsageListSection: HTMLElement;
    readonly #detailsUsageList: HTMLElement;
    readonly #detailsXmlSection: HTMLElement;
    readonly #detailsXml: HTMLElement;
    readonly #noResultsMsg: HTMLElement;
    readonly #splitterHandler: SplitterHandler;
    readonly #searchHandler: SearchHandler;
    readonly #onLocationHashChangedHandler;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpTree.html;

        const tree = shadow.getElementById("tree");
        if (tree === null) {
            throw new Error("tree element not found");
        }
        this.#tree = tree;
        this.#tree.addEventListener("click", this.#onTreeEntrySelected.bind(this));
        this.#tree.addEventListener("keydown", this.#onTreeKeydown.bind(this));
        this.#tree.addEventListener("focusin", this.#onTreeFocusIn.bind(this));
        this.#tree.addEventListener("focusout", this.#onTreeFocusOut.bind(this));

        const detailsContainer = shadow.getElementById("details");
        if (detailsContainer === null) {
            throw new Error("details element not found");
        }
        this.#detailsContainer = detailsContainer;

        const detailsView = shadow.getElementById("details-view");
        if (detailsView === null) {
            throw new Error("details-view element not found");
        }
        this.#detailsView = detailsView;

        const detailsLink = shadow.getElementById("details-link");
        if (detailsLink === null) {
            throw new Error("details-link element not found");
        }
        this.#detailsLink = detailsLink as HTMLButtonElement
        this.#detailsLink.addEventListener("click", this.#onCopyLink.bind(this));

        const detailsHelpTip = shadow.getElementById("details-help-tip");
        if (detailsHelpTip === null) {
            throw new Error("details-help-tip element not found");
        }
        this.#detailsHelpTip = detailsHelpTip;

        const detailsName = shadow.getElementById("details-name");
        if (detailsName === null) {
            throw new Error("details-name element not found");
        }
        this.#detailsName = detailsName;

        const detailsStruct = shadow.getElementById("details-struct");
        if (detailsStruct === null) {
            throw new Error("details-struct element not found");
        }
        this.#detailsStruct = detailsStruct;

        const detailsVersion = shadow.getElementById("details-version");
        if (detailsVersion === null) {
            throw new Error("details-version element not found");
        }
        this.#detailsVersion = detailsVersion;

        const detailsSize = shadow.getElementById("details-size");
        if (detailsSize === null) {
            throw new Error("details-size element not found");
        }
        this.#detailsSize = detailsSize;

        const detailsAlignment = shadow.getElementById("details-alignment");
        if (detailsAlignment === null) {
            throw new Error("details-alignment element not found");
        }
        this.#detailsAlignment = detailsAlignment;

        const detailsFieldsSection = shadow.getElementById("details-fields-section");
        if (detailsFieldsSection === null) {
            throw new Error("details-fields-section element not found");
        }
        this.#detailsFieldsSection = detailsFieldsSection;

        const detailsFieldsBody = shadow.getElementById("details-fields-body");
        if (detailsFieldsBody === null) {
            throw new Error("details-fields-body element not found");
        }
        this.#detailsFieldsBody = detailsFieldsBody;

        const detailsUsageListSection = shadow.getElementById("details-usage-list-section");
        if (detailsUsageListSection === null) {
            throw new Error("details-usage-list-section element not found");
        }
        this.#detailsUsageListSection = detailsUsageListSection;

        const detailsUsageList = shadow.getElementById("details-usage-list");
        if (detailsUsageList === null) {
            throw new Error("details-usage-list element not found");
        }
        this.#detailsUsageList = detailsUsageList;

        const detailsXmlSection = shadow.getElementById("details-xml-section");
        if (detailsXmlSection === null) {
            throw new Error("details-xml-section element not found");
        }
        this.#detailsXmlSection = detailsXmlSection;

        const detailsXml = shadow.getElementById("details-xml");
        if (detailsXml === null) {
            throw new Error("details-xml element not found");
        }
        this.#detailsXml = detailsXml;

        const noResultsMsg = shadow.getElementById("no-results-msg");
        if (noResultsMsg === null) {
            throw new Error("no-results-msg element not found");
        }
        this.#noResultsMsg = noResultsMsg;

        this.#onLocationHashChangedHandler = this.#onLocationHashChanged.bind(this);

        const splitter = shadow.getElementById("splitter");
        if (splitter === null) {
            throw new Error("splitter element not found");
        }
        this.#splitterHandler = new SplitterHandler(splitter);
        this.#searchHandler = new SearchHandler(shadow);
        this.#searchHandler.onsearch = this.#onSearchDone.bind(this);
    }

    connectedCallback(): void {
        window.addEventListener("hashchange", this.#onLocationHashChangedHandler);
        this.#splitterHandler.connect();
        this.#searchHandler.connect();
    }

    disconnectedCallback(): void {
        window.removeEventListener("hashchange", this.#onLocationHashChangedHandler);
        this.#splitterHandler.disconnect();
        this.#searchHandler.disconnect();
    }

    setTree(treeData: JTree, game: GameId, buildA: string, buildB: string | null): void {
        this.#game = game;
        this.#buildA = buildA;
        this.#buildB = buildB;

        const shadow = this.shadowRoot!;
        const isDiff = buildB !== null;
        const downloads = shadow.getElementById("downloads") as DumpDownloads | null;
        if (downloads === null) {
            throw new Error("downloads element not found");
        }
        const info = shadow.getElementById("game-info");
        if (info === null) {
            throw new Error("game-info element not found");
        }

        if (!isDiff) {
            downloads.setGameBuild(game, buildA);
            info.innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${buildA})</small></h2>`;
        } else {
            hideElement(downloads, true);
            info.innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${buildA} ↔ ${buildB})</small></h2>`;
        }

        const subheader = shadow.getElementById("subheader");
        if (subheader === null) {
            throw new Error("subheader element not found");
        }
        hideElement(subheader, false);

        this.#renderTree(treeData);

        const postRenderInitNodes = (nodes: TreeNode[], parent: TreeNode | null) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const element = shadow.getElementById(node.name)?.closest("li") || null;
                if (element === null) {
                    throw new Error(`element for node ${node.name} not found`);
                }
                node.element = element;
                node.previousSibling = i > 0 ? nodes[i - 1] : null;
                node.nextSibling = i < nodes.length - 1 ? nodes[i + 1] : null;
                node.parent = parent;
                if (node.children) {
                    postRenderInitNodes(node.children, node);
                }
            }
        };
        postRenderInitNodes(this.#nodes, null);
        this.#visibleNodes = this.#nodes;

        this.#searchHandler.initNodes(this.#nodes);

        const contents = shadow.getElementById("contents");
        if (contents === null) {
            throw new Error("contents element not found");
        }
        hideElement(contents, false);

        // manually scroll to the struct specified in the URL once the dump is loaded
        const loc = new URL(document.location.href);
        if (loc.hash.length > 0) {
            const elem = shadow.getElementById(loc.hash.substring(1));
            if (elem !== null) {
                elem.scrollIntoView();
                (elem.querySelector(".dump-entry-button") as HTMLButtonElement | null)?.click();
            }
        }
    }

    #onCopyLink(_e: MouseEvent): void {
        if ((this.#selectedEntryNode?.name || null) === null) {
            return;
        }

        const url = new URL(document.location.href);
        url.searchParams.forEach((_, k) => url.searchParams.delete(k));
        if (this.#game !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_GAME, this.#game);
        }
        if (this.#buildA !== null && this.#buildB !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_A, this.#buildA);
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_B, this.#buildB);
        } else if (this.#buildA !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD, this.#buildA);
        }
        url.hash = `#${this.#selectedEntryNode!.name}`;
        navigator.clipboard.writeText(url.toString());

        animateButtonClick(this.#detailsLink);
    }

    #onTreeFocusIn(e: FocusEvent): void {
        if (e.target !== this.#tree) {
            // focus from mouse click, ignore it
            return;
        }

        if (this.#selectedEntryNode !== null) {
            // focus on the selected node initially
            this.#treeNavFocusNode = this.#selectedEntryNode;
        }

        if (this.#treeNavFocusNode === null || this.#findVisibleNodeBy(n => n === this.#treeNavFocusNode) === null) {
            // set focus to the first visible node if no node was selected yet or if the selected node is no longer visible
            this.#treeNavFocusNode = this.#findVisibleNodeBy(_ => true)
        }

        if (this.#treeNavFocusNode !== null) {
            const btn = this.#treeNavFocusNode.element?.querySelector(".dump-entry-button") || null;
            if (btn !== null) {
                (btn as HTMLElement).dataset["treeFocus"] = "";
            }
        }
    }

    #onTreeFocusOut(_e: FocusEvent): void {
        if (this.#treeNavFocusNode !== null) {
            const btn = this.#treeNavFocusNode.element?.querySelector(".dump-entry-button") || null;
            if (btn !== null) {
                delete (btn as HTMLElement).dataset["treeFocus"];
            }
        }
    }

    /**
     * Set the currently focused node in the tree for keyboard navigation.
     */
    #setTreeFocusNode(node: TreeNode | null): void {
        if (this.#treeNavFocusNode !== null) {
            const btn = this.#treeNavFocusNode.element?.querySelector(".dump-entry-button") || null;
            if (btn !== null) {
                delete (btn as HTMLElement).dataset["treeFocus"];
            }
        }

        this.#treeNavFocusNode = node;
        if (this.#treeNavFocusNode !== null) {
            const btn = this.#treeNavFocusNode.element?.querySelector(".dump-entry-button") || null;
            if (btn !== null) {
                (btn as HTMLElement).dataset["treeFocus"] = "";
                btn.scrollIntoView({ block: "nearest", inline: "end" });
                // TODO: should details be opened on focus or only on Enter key?
                // this.open(btn);
            }
        }
    }

    /**
     * Handle tree keyboard navigation.
     * Follows these guidelines for keyboard interaction: {@link https://www.w3.org/WAI/ARIA/apg/patterns/treeview/}
     * @param {KeyboardEvent} e
     */
    #onTreeKeydown(e: KeyboardEvent): void {
        const focusNode = this.#treeNavFocusNode;
        if (focusNode === null) {
            return;
        }

        let consumed = false;
        switch (e.key) {
            case "ArrowLeft":
                consumed = true;
                if (focusNode.isExpanded()) {
                    // focus is on an open node, closes the node
                    focusNode.expand(false);
                } else {
                    // focus is on a child node that is also either an end node
                    // or a closed node, moves focus to its parent node.
                    if (focusNode.parent !== null) {
                        this.#setTreeFocusNode(focusNode.parent);
                    }
                }
                break;
            case "ArrowRight":
                consumed = true;
                if (focusNode.isExpanded()) {
                    // focus is on an open node, moves focus to the first child node
                    this.#setTreeFocusNode(focusNode.children![0]);
                } else {
                    // focus is on a closed node, opens the node; focus does not move
                    focusNode.expand(true);
                }
                break;
            case "ArrowUp":
                consumed = true;
                // moves focus to the previous node that is focusable without opening
                // or closing a node
                let prevNode = focusNode.previousSibling;
                while (prevNode !== null && prevNode.isExpanded()) {
                    prevNode = prevNode.children![prevNode.children!.length - 1];
                }
                if (prevNode === null) {
                    prevNode = focusNode.parent;
                }
                if (prevNode !== null) {
                    this.#setTreeFocusNode(prevNode);
                }
                break;
            case "ArrowDown":
                consumed = true;
                // moves focus to the next node that is focusable without opening
                // or closing a node
                let nextNode = focusNode.isExpanded() ? focusNode.children![0] : focusNode.nextSibling;
                let n = focusNode;
                while (nextNode === null && n.parent !== null) {
                    nextNode = n.parent.nextSibling;
                    n = n.parent;
                }
                if (nextNode !== null) {
                    this.#setTreeFocusNode(nextNode);
                }
                break;
            case "Home":
                consumed = true;
                // moves focus to the first node in the tree without opening or closing a node
                this.#setTreeFocusNode(this.#findVisibleNodeBy(_ => true));
                break;
            case "End":
                consumed = true;
                // moves focus to the last node in the tree that is focusable without opening a node
                const isExpandedRecursive = (n: TreeNode): boolean => {
                    return n.parent === null || (n.parent.isExpanded() && isExpandedRecursive(n.parent));
                };
                this.#setTreeFocusNode(this.#findLastVisibleNodeBy(isExpandedRecursive));
                break;
            case "Enter":
                consumed = true;
                // activates the node
                this.open(focusNode.element?.querySelector(".dump-entry-button") || null);
                break;
        }

        if (consumed) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    #onTreeEntrySelected(e: MouseEvent): void {
        const btn = (e.target as HTMLElement | null)?.closest(".dump-entry-button") || null;
        this.open(btn as HTMLElement | null);

        if (btn) {
            e.preventDefault();
        }
    }

    #onLocationHashChanged(e: HashChangeEvent): void {
        const id = new URL(e.newURL).hash;
        const btn = this.#tree.querySelector(`${id} > .dump-entry-button`) as HTMLElement | null;
        this.open(btn as HTMLElement | null);
    }

    open(entryBtn: HTMLElement | null): void {
        if (this.#selectedEntryBtn) {
            this.#selectedEntryBtn.classList.remove("type-link-selected");
        }

        this.#selectedEntryBtn = entryBtn;
        if (entryBtn === null) {
            return;
        }

        const typeName = entryBtn.querySelector("span")?.textContent || null;
        if (typeName === null) {
            return;
        }
        const node = this.#findNodeByName(typeName);
        this.#selectedEntryNode = node;
        if (node === null) {
            return;
        }

        // for now the diff view only shows the struct code snippet
        const isDiff = this.#buildB !== null;

        const isStruct = node.type !== "enum";
        const structData = isStruct && node.data as JTreeStructNode;

        // update URL
        const loc = new URL(document.location.href);
        loc.hash = typeName;
        history.replaceState(null, "", loc.toString());

        hideElement(this.#detailsHelpTip, true);
        hideElement(this.#detailsView, false);

        this.#detailsName.textContent = typeName;
        entryBtn.classList.add("type-link-selected");

        this.#detailsStruct.setAttribute("code-lang", isDiff ? "cpp-nolinks" : "cpp");
        this.#detailsStruct.innerHTML = node.markup;

        const version = this.#detailsVersion;
        const size = this.#detailsSize;
        const alignment = this.#detailsAlignment;
        if (!isDiff && structData) {
            version.textContent = structData.version ? `Version - ${structData.version}` : "";
            size.textContent = `Size - ${structData.size}`;
            alignment.textContent = `Alignment - ${structData.align}`;
            hideElement(version, !structData.version);
            hideElement(size, false);
            hideElement(alignment, false);
        } else {
            version.textContent = "";
            size.textContent = "";
            alignment.textContent = "";
            hideElement(version, true);
            hideElement(size, true);
            hideElement(alignment, true);
        }

        if (!isDiff && structData && structData.fields) {
            this.#detailsFieldsBody.innerHTML = structData.fields.sort((a,b) => a.offset > b.offset ? 1 : -1).map(f => {
                let typeStr = f.type;
                if (f.subtype !== "NONE") {
                    typeStr += `.${f.subtype.startsWith("_") ? f.subtype.substring(1) : f.subtype}`;
                }
                return `<tr><td>${f.offset} (0x${f.offset.toString(16)})</td><td>${f.name}</td><td>${typeStr}</td></tr>`;
            }).join("");
            hideElement(this.#detailsFieldsSection, false);
        } else {
            this.#detailsFieldsBody.innerHTML = "";
            hideElement(this.#detailsFieldsSection, true);
        }

        if (!isDiff && node.data.usage) {
            this.#detailsUsageList.innerHTML = node.data.usage.map(usedInTypeName => `<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`).join("");
            hideElement(this.#detailsUsageListSection, false);
        } else {
            this.#detailsUsageList.innerHTML = "";
            hideElement(this.#detailsUsageListSection, true);
        }

        if (!isDiff && structData) {
            this.#detailsXml.innerHTML = "";
            this.#detailsXml.appendChild(document.createTextNode(structData.xml));
            hideElement(this.#detailsXmlSection, false);
        } else {
            this.#detailsXml.innerHTML = "";
            hideElement(this.#detailsXmlSection, true);
        }

        // reset scroll position
        this.#detailsContainer.scroll(0, 0)
    }

    #findNodeByName(name: string): TreeNode | null {
        return this.#findNodeBy(node => node.name === name)
    }

    #findNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.#findNodeByCore(this.#nodes, predicate);
    }

    /*#findLastNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.#findLastNodeByCore(this.#nodes, predicate);
    }*/

    #findVisibleNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.#findNodeByCore(this.#visibleNodes, predicate);
    }

    #findLastVisibleNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.#findLastNodeByCore(this.#visibleNodes, predicate);
    }

    #findNodeByCore(nodes: TreeNode[], predicate: (node: TreeNode) => boolean): TreeNode | null {
        const findRecursive = (nodes: TreeNode[]): TreeNode | null => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (predicate(node)) {
                    return node;
                }

                if (node.children) {
                    const childResult = findRecursive(node.children);
                    if (childResult) {
                        return childResult;
                    }
                }
            }

            return null;
        }

        return findRecursive(nodes);
    }

    #findLastNodeByCore(nodes: TreeNode[], predicate: (node: TreeNode) => boolean): TreeNode | null {
        const findRecursive = (nodes: TreeNode[]): TreeNode | null => {
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                if (node.children) {
                    const childResult = findRecursive(node.children);
                    if (childResult) {
                        return childResult;
                    }
                }

                if (predicate(node)) {
                    return node;
                }
            }

            return null;
        }

        return findRecursive(nodes);
    }

    #renderTree(treeData: JTree): void {
        const structs = treeData.structs;
        const enums = treeData.enums;

        let html = "";
        const indent = () => {
            html += html.length === 0 ? `<ul role="tree">` : `<ul role="group">`;
        }
        const dedent = () => {
            html += "</ul>";
        };
        const renderEntry = (node: TreeNode): string => {
            let tip = `${node.type} ${node.name}`;
            let diffIcon = "";
            switch (node.data.diffType) {
                case "a":
                    diffIcon = `<div class="dump-entry-icon dump-entry-icon-diff-added"></div>`;
                    tip += " • Added";
                    break;
                case "m":
                    diffIcon = `<div class="dump-entry-icon dump-entry-icon-diff-modified"></div>`;
                    tip += " • Modified";
                    break;
                case "r":
                    diffIcon = `<div class="dump-entry-icon dump-entry-icon-diff-removed"></div>`;
                    tip += " • Removed";
                    break;
            }

            return `<div class="dump-entry" id="${node.name}">
                        ${(node.children && node.children.length > 0) ? `<div class="dump-entry-icon dump-entry-icon-container"></div>` : `<div class="dump-entry-icon"></div>`}
                        <div class="dump-entry-button type-link" title="${tip}">
                            ${diffIcon}
                            <div class="dump-entry-icon dump-entry-icon-${node.type}"></div>
                            <span>${node.name}</span>
                        </div>
                    </div>`;
        }
        const renderNode = (node: TreeNode): void => {
            html += `<li role="treeitem">`;
            if (node.children && node.children.length > 0) {
                html += `<details open><summary tabindex="-1">${renderEntry(node)}</summary>`;
                indent();
                for (const c of node.children) {
                    renderNode(c);
                }
                dedent();
                html += "</details>";
            } else {
                html += renderEntry(node);
            }
            html += "</li>";
        }

        indent();
        const structNodes = structs.map(s => new TreeNode("struct", s));
        const enumNodes = enums.map(e => new TreeNode("enum", e));
        this.#nodes = structNodes.concat(enumNodes).sort(TreeNode.compare);
        for (const n of this.#nodes) {
            renderNode(n);
        }
        dedent();

        this.#tree.innerHTML += html;

        if (this.#nodes.length === 0) {
            const isDiff = this.#buildB !== null;
            this.#noResultsMsg.innerText = isDiff ? "No changes between these builds." : "No types in this build.";
            hideElement(this.#noResultsMsg, false);
            hideElement(this.#detailsHelpTip, true);
        }
    }

    #onSearchDone(visibleNodes: TreeNode[]): void {
        this.#visibleNodes = visibleNodes;
        this.#treeNavFocusNode = null; // reset focus
        hideElement(this.#noResultsMsg, visibleNodes.length !== 0);
    }
}

class SplitterHandler {
    readonly #splitter: HTMLElement;
    readonly #splitterLeftElement: HTMLElement;
    #dragging: boolean = false;
    #startX: number = 0;
    #startWidth: number = 0;
    readonly #onMouseDownHandler;
    readonly #onMouseUpHandler;
    readonly #onMouseMoveHandler;

    constructor(splitter: HTMLElement) {
        this.#splitter = splitter;
        const splitterLeft = this.#splitter.previousElementSibling;
        if (splitterLeft === null) {
            throw new Error("Splitter must have a previous sibling");
        }
        this.#splitterLeftElement = splitterLeft as HTMLElement;

        this.#onMouseDownHandler = this.#onMouseDown.bind(this);
        this.#onMouseUpHandler = this.#onMouseUp.bind(this);
        this.#onMouseMoveHandler = this.#onMouseMove.bind(this);
    }

    connect(): void {
        this.#splitter.addEventListener("mousedown", this.#onMouseDownHandler);
        document.addEventListener("mousemove", this.#onMouseMoveHandler);
        document.addEventListener("mouseup", this.#onMouseUpHandler);
    }

    disconnect(): void {
        this.#splitter.addEventListener("mousedown", this.#onMouseDownHandler);
        document.removeEventListener("mousemove", this.#onMouseMoveHandler);
        document.removeEventListener("mouseup", this.#onMouseUpHandler);
    }

    #onMouseDown(e: MouseEvent): void {
        this.#splitter.classList.add("dragging");
        this.#startX = e.clientX;
        this.#startWidth = this.#splitterLeftElement.offsetWidth;
        this.#dragging = true;

        e.preventDefault();
    }

    #onMouseUp(e: MouseEvent): void {
        if (this.#dragging) {
            this.#splitter.classList.remove("dragging");
            this.#dragging = false;

            e.preventDefault();
        }
    }

    #onMouseMove(e: MouseEvent): void {
        if (this.#dragging) {
            const diff = e.clientX - this.#startX;
            this.#splitterLeftElement.style.width = `${this.#startWidth + diff}px`;

            e.preventDefault();
        }
    }
}

type SearchOptions = {
    /**
     * String comparison is case-sensitive.
     */
    matchCase: boolean;
    /**
     * Treats the search string as a regular expression.
     */
    regex: boolean;
    /**
     * Search the string in struct member names.
     */
    matchMembers: boolean;
    /**
     * Matching the base struct will include its derived structs in the search results.
     */
    showChildren: boolean;
};

const defaultSearchOptions: SearchOptions = {
    matchCase: false,
    regex: false,
    matchMembers: false,
    showChildren: true,
};

type SearchOptionBinding = {
    id: string;
    getter: (o: SearchOptions) => boolean;
    setter: (enabled: boolean, o: SearchOptions) => void;
};

const searchOptionBindings: readonly SearchOptionBinding[] = [
    { id: "search-toggle-match-case",    getter: o => o.matchCase,    setter: (v, o) => o.matchCase = v },
    { id: "search-toggle-regex",         getter: o => o.regex,        setter: (v, o) => o.regex = v },
    { id: "search-toggle-match-members", getter: o => o.matchMembers, setter: (v, o) => o.matchMembers = v },
    { id: "search-toggle-show-children", getter: o => o.showChildren, setter: (v, o) => o.showChildren = v },
];

class SearchHandler {
    onsearch: ((visibleNodes: TreeNode[]) => void) | null = null;

    #options: SearchOptions;
    readonly #searchInput: HTMLInputElement;
    readonly #onSearchInputHandler: (e: Event) => void;
    readonly #searchOptionToggles: { binding: SearchOptionBinding, toggle: HTMLElement, onClickHandler: (e: MouseEvent) => void }[];

    #nodes: (readonly TreeNode[]) | null = null;

    constructor(root: Document | DocumentFragment) {
        this.#options = SearchHandler.storedSearchOptions;
        this.#searchOptionToggles = [];
        for (const binding of searchOptionBindings) {
            const toggle = root.getElementById(binding.id);
            if (toggle === null) {
                throw new Error(`Search option toggle element '${binding.id}' not found`);
            }
            this.#searchOptionToggles.push({
                binding: binding,
                toggle: toggle,
                onClickHandler: this.#onSearchOptionToggle.bind(this, binding, toggle),
            });
        }
        const searchInput = root.getElementById("search-input");
        if (searchInput === null) {
            throw new Error("search-input element not found");
        }
        this.#searchInput = searchInput as HTMLInputElement;
        this.#onSearchInputHandler = this.#onSearchInput.bind(this);
    }

    initNodes(nodes: readonly TreeNode[]): void {
        this.#nodes = nodes;

        if (this.#searchInput.value) {
            this.search(this.#searchInput.value)
        }
    }

    connect(): void {
        this.#searchInput.addEventListener("input", this.#onSearchInputHandler);
        for (const { binding, toggle, onClickHandler } of this.#searchOptionToggles) {
            if (binding.getter(this.#options)) { toggle.classList.add("enabled"); }
            else { toggle.classList.remove("enabled"); }

            toggle.addEventListener("click", onClickHandler);
        }

        const defaultSearch = new URL(document.location.href).searchParams.get(DumpTree.URL_PARAM_SEARCH);
        if (defaultSearch !== null) {
            this.#searchInput.value = defaultSearch;
        }
    }

    disconnect(): void {
        this.#searchInput.removeEventListener("input", this.#onSearchInputHandler);
        for (const { toggle, onClickHandler } of this.#searchOptionToggles) {
            toggle.removeEventListener("click", onClickHandler);
        }
    }

    #onSearchOptionToggle(binding: SearchOptionBinding, toggle: HTMLElement, _e: MouseEvent): void {
        binding.setter(!binding.getter(this.#options), this.#options);
        if (binding.getter(this.#options)) { toggle.classList.add("enabled"); }
        else { toggle.classList.remove("enabled"); }

        // save options
        SearchHandler.storedSearchOptions = this.#options;

        // refresh search results with new options
        this.search(this.#searchInput.value);
    }

    #onSearchInput(_e: Event): void {
        const searchText = this.#searchInput.value;

        // update URL
        const loc = new URL(document.location.href);
        if (searchText.length === 0) {
            loc.searchParams.delete(DumpTree.URL_PARAM_SEARCH)
        } else {
            loc.searchParams.set(DumpTree.URL_PARAM_SEARCH, searchText);
        }
        history.replaceState(null, "", loc.toString());

        this.search(searchText);
    }

    search(text: string): void {
        if (this.#nodes === null) {
            return;
        }

        text = text.trim();
        let matcher: (str: string) => boolean;
        if (text.length === 0) {
            matcher = _ => true;
        } else if (this.#options.regex) {
            try {
                const regex = new RegExp(text, this.#options.matchCase ? undefined : "i");
                matcher = str => regex.test(str);
            } catch (e) {
                // invalid regex, don't search
                return;
            }
        } else {
            text = this.#options.matchCase ? text : text.toLowerCase();
            matcher = str => str.indexOf(text) !== -1;
        }
        const visibleNodes = this.#doSearch(this.#nodes, matcher);
        this.onsearch?.(visibleNodes);
    }

    #doSearch(nodes: readonly TreeNode[], matcher: (str: string) => boolean, state: { parentMatch?: boolean } = {}): TreeNode[] {
        let results = [];
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const name = this.#options.matchMembers ?
                (this.#options.matchCase ? node.markup : node.markupLowerCase) : // TODO: search only member names with 'matchMembers' set
                (this.#options.matchCase ? node.name : node.nameLowerCase);
            let match = false;
            let childrenResults = null;
            if (this.#options.showChildren) {
                match = state.parentMatch || matcher(name);
                const prevParentMatch = state.parentMatch;
                state.parentMatch = match;

                childrenResults = node.children ? this.#doSearch(node.children, matcher, state) : null;
                match = (childrenResults && childrenResults.length > 0) || match;

                state.parentMatch = prevParentMatch || false;
            } else {
                childrenResults = node.children ? this.#doSearch(node.children, matcher, state) : null;
                match = (childrenResults && childrenResults.length > 0) || matcher(name);
            }


            if (match) {
                const nodeCopy = node.copy();
                if (results.length > 0) {
                    const prevNode = results[results.length - 1];
                    prevNode.nextSibling = nodeCopy;
                    nodeCopy.previousSibling = prevNode;
                }
                nodeCopy.children = childrenResults;
                if (nodeCopy.children) {
                    nodeCopy.children.forEach(c => c.parent = nodeCopy);
                }
                results.push(nodeCopy);
            }

            if (node.element !== null) {
                hideElement(node.element, !match);
            }
        }

        return results;
    }

    static get storedSearchOptions(): SearchOptions {
        const json = localStorage.getItem("searchOptions");
        return {...defaultSearchOptions, ...(json !== null ? JSON.parse(json) : {})};
    }

    static set storedSearchOptions(options: SearchOptions) {
        localStorage.setItem("searchOptions", JSON.stringify(options));
    }
}

customElements.define('dump-tree', DumpTree);
