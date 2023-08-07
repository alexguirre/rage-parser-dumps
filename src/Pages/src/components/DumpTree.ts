import "./SvgIcon";
import "./CodeSnippet";
import "./DumpDownloads";
import {GameId, JTree, JTreeNode, JTreeStructNode, hasDiffInfo} from "../types";
import {animateButtonClick, gameIdToFormattedName} from "../util";
import {LitElement, html, nothing, TemplateResult} from 'lit';
import {customElement, state, query} from 'lit/decorators.js';
import {Ref, createRef, ref} from 'lit/directives/ref.js';
import {styleMap} from 'lit/directives/style-map.js';
import {unsafeHTML} from "lit/directives/unsafe-html.js";
import {virtualize, virtualizerRef} from "@lit-labs/virtualizer/virtualize.js";
import {VirtualizerHostElement} from "@lit-labs/virtualizer/Virtualizer";

type TreeNodeType = "struct" | "enum";
class TreeNode {
    readonly type: TreeNodeType;
    readonly name: string;
    readonly nameLowerCase: string;
    readonly hashId: string;
    readonly markup: string;
    readonly markupLowerCase: string;
    previousSibling: TreeNode | null = null;
    nextSibling: TreeNode | null = null;
    parent: TreeNode | null = null;
    children: TreeNode[] | null = null;
    /**
     * Object with the JSON data.
     */
    readonly data: JTreeNode;

    get isParent(): boolean { return this.children !== null && this.children.length > 0; }

    // computed variables for rendering
    readonly tip: string;
    readonly typeClass: string;
    readonly diffClass: string;

    constructor(type: TreeNodeType, nodeData: JTreeNode) {
        this.type = type;
        this.name = nodeData.name;
        this.hashId = nodeData.hash;
        this.markup = nodeData.markup;
        this.nameLowerCase = this.name.toLowerCase();
        this.markupLowerCase = this.markup.toLowerCase();
        this.data = nodeData;

        const structNode = nodeData as JTreeStructNode;
        if (structNode.children && structNode.children.length > 0) {
            this.children = new Array(structNode.children.length);
            for (let i = 0; i < structNode.children.length; i++) {
                this.children[i] = new TreeNode("struct", structNode.children[i]);
            }
            this.children.sort(TreeNode.compare);
        }



        this.tip = `${this.type} ${this.name}`;
        switch (this.type) {
            case "struct":
                this.typeClass = "dump-entry-button-struct";
                break;
            case "enum":
                this.typeClass = "dump-entry-button-enum";
                break;
            default:
                this.typeClass = "";
                break;
        }

        switch (hasDiffInfo(this.data) && this.data.diffType) {
            case "a":
                this.diffClass = "dump-entry-button-diff-added";
                this.tip += " • Added";
                break;
            case "m":
                this.diffClass = "dump-entry-button-diff-modified";
                this.tip += " • Modified";
                break;
            case "r":
                this.diffClass = "dump-entry-button-diff-removed";
                this.tip += " • Removed";
                break;
            default:
                this.diffClass = "";
                break;
        }
    }

    static compare(a: TreeNode, b: TreeNode): number { return a.name.localeCompare(b.name, "en"); }
}

class TreeNodeVisible {
    readonly node: TreeNode;
    readonly depth: number;
    visible: boolean = true;
    isExpanded: boolean = true;

    get type() { return this.node.type; }
    get name() { return this.node.name; }
    get markup() { return this.node.markup; }
    get data() { return this.node.data; }
    get isParent() { return this.node.isParent; }

    constructor(node: TreeNode, depth: number) {
        this.node = node;
        this.depth = depth;
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
    getter: (o: SearchOptions) => boolean;
    setter: (enabled: boolean, o: SearchOptions) => void;
    title: string;
    icon: string;
};

const searchOptionBindings: { [id: string]: SearchOptionBinding } = {
    "search-toggle-match-case": {
        getter: o => o.matchCase, setter: (v, o) => o.matchCase = v,
        title: "Match Case", icon: "match-case"
    },
    "search-toggle-regex": {
        getter: o => o.regex, setter: (v, o) => o.regex = v,
        title: "Use Regular Expression", icon: "regex"
    },
    "search-toggle-match-members": {
        getter: o => o.matchMembers, setter: (v, o) => o.matchMembers = v,
        title: "Match Members", icon: "match-members"
    },
    "search-toggle-show-children": {
        getter: o => o.showChildren, setter: (v, o) => o.showChildren = v,
        title: "Show Children", icon: "show-children"
    },
};

type SearchResult = { node: TreeNode, children: SearchResult[] | null };

function gameIdToFormattedNameHTML(id: GameId) {
    return unsafeHTML(gameIdToFormattedName(id));
}

@customElement("dump-tree")
export default class DumpTree extends LitElement {
    static readonly URL_PARAM_GAME = "game";
    static readonly URL_PARAM_BUILD = "build";
    static readonly URL_PARAM_BUILD_A = "build-a";
    static readonly URL_PARAM_BUILD_B = "build-b";
    static readonly URL_PARAM_SEARCH = "search";

    @state() private game: GameId | null = null;
    @state() private buildA: string | null = null;
    @state() private buildB: string | null = null;

    @state() private error: boolean = false;
    @state() private loading: boolean = true;
    @state() private resultsMessage: string | null = null;

    @state() private nodes: TreeNode[] = []; // hierarchical tree of all nodes
    @state() private visibleNodes: TreeNodeVisible[] = []; // flat list of visible nodes, used for virtualization
    @state() private visibleNodesToRender: TreeNodeVisible[] = []; // subset of visibleNodes which have .visible = true
    @state() private treeNavFocusNode: TreeNodeVisible | null = null;
    @state() private treeSelectedNode: TreeNode | null = null;

    @state() private searchOptions: SearchOptions = DumpTree.storedSearchOptions;

    @state() private splitterDragging: boolean = false;
    @state() private splitterStartX: number = 0;
    @state() private splitterStartWidth: number = 0;
    @state() private splitterLeftElementStyle: { width: string | null } = { width: null };
    private splitterLeftElementRef: Ref<HTMLElement> = createRef();

    @query("#tree")
    private treeElement!: HTMLDivElement;
    @query("#tree-list")
    private treeList!: VirtualizerHostElement;
    @query("#details")
    private detailsContainer!: HTMLDivElement;
    @query("#details-link")
    private detailsLink!: HTMLButtonElement;
    @query("#search-input")
    private searchInput!: HTMLInputElement;

    private hashIdToNameIdMap: Map<string, string> = new Map();

    override connectedCallback(): void {
        super.connectedCallback();

        window.addEventListener("hashchange", this.onLocationHashChangedHandler);

        document.addEventListener("mousemove", this.onSplitterMouseMoveHandler);
        document.addEventListener("mouseup", this.onSplitterMouseUpHandler);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();

        window.removeEventListener("hashchange", this.onLocationHashChangedHandler);

        document.removeEventListener("mousemove", this.onSplitterMouseMoveHandler);
        document.removeEventListener("mouseup", this.onSplitterMouseUpHandler);
    }

    override firstUpdated(): void {
        // apply the search query from the URL, we only set the search input value here,
        // the actual search is done once we receive the tree data
        const defaultSearch = new URL(document.location.href).searchParams.get(DumpTree.URL_PARAM_SEARCH);
        if (defaultSearch !== null) {
            this.searchInput.value = defaultSearch;
        }
    }

    override render() {
        const isGameSet = this.game != null && this.buildA != null;
        const isDiff = this.buildB != null;
        return html`
            <link rel="stylesheet" href="css/style.css">
            <div class="dump-tree-root">
                <div id="subheader" class="row-layout">
                    <div id="game-info">
                        ${isGameSet ?
                                isDiff ?
                                        html`<h2>${gameIdToFormattedNameHTML(this.game!)} <small>(build ${this.buildA} ↔ ${this.buildB})</small></h2>` :
                                        html`<h2>${gameIdToFormattedNameHTML(this.game!)} <small>(build ${this.buildA})</small></h2>` :
                                nothing
                         }
                    </div>
                    <div id="search-box">
                        <input id="search-input" type="text" placeholder="Search..."
                               ?disabled=${this.loading || this.error}
                               @input=${this.onSearchInput}
                        />
                        <div id="search-options" class="row-layout">
                            ${Object.entries(searchOptionBindings).map(([id, b]) =>
                                html`
                                    <button id=${id}
                                            class="header-icon dump-search-toggle ${b.getter(this.searchOptions) ? "enabled" : ""}"
                                            ?disabled=${this.loading || this.error}
                                            title=${b.title}
                                            @click=${this.onSearchOptionToggle}>
                                        <svg-icon icon=${b.icon} clickable />
                                    </button>
                                `)}
                        </div>
                    </div>
                    ${!isGameSet || isDiff || this.error ?
                            nothing :
                            html`<dump-downloads id="downloads" class="row-layout-push" game=${this.game} build=${this.buildA}></dump-downloads>`}
                </div>
                <div id="contents">
                    <div id="tree" tabindex="0"
                         @click=${this.onTreeClick}
                         @keydown=${this.onTreeKeydown}
                         @focusin=${this.onTreeFocusIn}
                         style=${styleMap(this.splitterLeftElementStyle)}
                         ${ref(this.splitterLeftElementRef)}
                    >
                        ${this.renderTreeView()}
                    </div>
                    <div id="splitter"
                         class=${this.splitterDragging ? "dragging" : ""}
                         @mousedown=${this.onSplitterMouseDown}
                    ></div>
                    <div id="details">
                        ${this.renderDetailsView()}
                    </div>
                </div>
            </div>
        `;
    }

    private renderTreeView() {
        return html`
            ${this.renderResultsMessage()}
            ${this.renderLoadingPlaceholder()}
            ${this.renderTree()}
        `;
    }

    private renderLoadingPlaceholder() {
        return html`
            <ul id="loading-placeholder" aria-hidden="true" title="Loading" class=${this.loading ? nothing : "placeholder-do-fade-out"}>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div>
                    <ul>
                        <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div>
                            <ul>
                                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                            </ul>
                        </li>
                        <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                        <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                        <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                        <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                    </ul>
                </li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
                <li class="dump-entry-li"><div class="dump-entry placeholder"><div class="dump-entry-button type-link"></div></div></li>
            </ul>
        `;
    }

    private renderResultsMessage() {
        return this.resultsMessage ?
            html`<p id="results-msg" class="dump-help-msg placeholder-do-fade-in">${this.resultsMessage}</p>` :
            nothing;
    }

    private renderTree() {
        if (this.loading) {
            return nothing;
        }

        return html`
            <ul id="tree-list" role="tree" class="placeholder-do-fade-in">
                ${virtualize({
                    scroller: true,
                    items: this.visibleNodesToRender,
                    renderItem: this.renderNodeHandler,
                })}
            </ul>
        `;
    }

    private readonly renderNodeHandler = this.renderNode.bind(this);
    private renderNode(node: TreeNodeVisible, _index: number): TemplateResult {
        const tip = node.node.tip;
        const typeClass = node.node.typeClass;
        const diffClass = node.node.diffClass;
        const isCollapsed = !node.isExpanded;
        const isParent = node.isParent;
        const isFocus = this.treeNavFocusNode !== null && node.name === this.treeNavFocusNode.name;
        const isSelected = this.treeSelectedNode !== null && node.name === this.treeSelectedNode.name;

        return html`
            <li class="dump-entry-li"
                role="treeitem"
                ?data-collapsed=${isParent ? isCollapsed : nothing}
                style=${styleMap({ "--indent": node.depth })}
            >
                <div class="dump-entry ${isParent ? "dump-entry-parent" : ""}" id="${node.name}">
                    <div class="dump-entry-button ${typeClass} ${diffClass} type-link ${isSelected ? "type-link-selected" : ""}"
                         title="${tip}"
                         ?data-tree-focus=${isFocus}
                    >
                        <span>${node.name}</span>
                    </div>
                </div>
            </li>
        `;
    }

    private renderDetailsView() {
        const node = this.treeSelectedNode;
        if (node === null) {
            return this.loading || this.error ?
                nothing :
                html`<p id="details-help-tip" class="dump-help-msg placeholder-do-fade-in">Select a type to display its details here.</p>`
        }

        // for now the diff view only shows the struct code snippet
        const isDiff = this.buildB !== null;

        const isStruct = node.type !== "enum";
        const structData = isStruct && node.data as JTreeStructNode;

        const snippetLang = isDiff ? "cpp-nolinks" : "cpp";

        return html`
            <div id="details-view" class="placeholder-do-fade-in">
                <div class="row-layout">
                    <button id="details-link" class="header-icon" title="Copy link"
                            @click=${this.onCopyLink}
                    >
                        <svg-icon icon="link" clickable />
                    </button>
                    <h3 id="details-name">${node.name}</h3>
                </div>
                <code-snippet id="details-struct" code-lang=${snippetLang} markup=${node.markup}></code-snippet>
                ${!isDiff && structData ?
                    html`
                    <div class="dump-details-section-contents row-layout">
                        ${structData.version ?
                                html`<span id="details-version">Version - ${structData.version}</span>` :
                                nothing}
                        <span id="details-size">Size - ${structData.size}</span>
                        <span id="details-alignment">Alignment - ${structData.align}</span>
                    </div>
                    ` : nothing}
                ${!isDiff && structData && structData.fields ?
                    html`
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
                            ${structData.fields.sort((a,b) => a.offset > b.offset ? 1 : -1).map(f => {
                                let typeStr = f.type;
                                if (f.subtype !== "NONE") {
                                    typeStr += `.${f.subtype.startsWith("_") ? f.subtype.substring(1) : f.subtype}`;
                                }
                                return html`<tr><td>${f.offset} (0x${f.offset.toString(16)})</td><td>${f.name}</td><td>${typeStr}</td></tr>`;
                            })}
                            </tbody>
                        </table>
                    </details>
                    ` : nothing}
                ${!isDiff && node.data.usage ?
                    html`
                    <details id="details-usage-list-section" open>
                        <summary><h4 class="dump-details-title">Used in</h4></summary>
                        <ul id="details-usage-list" class="dump-details-section-contents">
                        ${node.data.usage.map(usedInTypeName => html`<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`)}
                        </ul>
                    </details>
                    ` : nothing}
                ${!isDiff && structData ?
                    html`
                    <details id="details-xml-section" open>
                        <summary><h4 class="dump-details-title">XML example</h4></summary>
                        <div class="dump-details-section-contents"><code-snippet id="details-xml" code-lang="xml" markup=${structData.xml}></code-snippet></div>
                    </details>
                    ` : nothing}
            </div>
        `;
    }

    private onCopyLink(_e: MouseEvent): void {
        if ((this.treeSelectedNode?.name || null) === null) {
            return;
        }

        const url = new URL(document.location.href);
        url.searchParams.forEach((_, k) => url.searchParams.delete(k));
        if (this.game !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_GAME, this.game);
        }
        if (this.buildA !== null && this.buildB !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_A, this.buildA);
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_B, this.buildB);
        } else if (this.buildA !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD, this.buildA);
        }
        url.hash = `#${this.treeSelectedNode!.name}`;
        navigator.clipboard.writeText(url.toString());

        animateButtonClick(this.detailsLink);
    }

    private onTreeFocusIn(e: FocusEvent): void {
        if (e.target !== this.treeElement) {
            // focus from mouse click, ignore it
            return;
        }

        if (this.treeSelectedNode !== null) {
            // focus on the selected node initially
            this.treeNavFocusNode = this.findVisibleNodeByName(this.treeSelectedNode.name);
        }

        if (this.treeNavFocusNode === null || this.findVisibleNodeBy(n => n === this.treeNavFocusNode) === null) {
            // set focus to the first visible node if no node was selected yet or if the selected node is no longer visible
            this.treeNavFocusNode = this.findVisibleNodeBy(_ => true)
        }
    }

    /**
     * Set the currently focused node in the tree for keyboard navigation and scrolls it into view.
     */
    private setTreeFocusNode(node: TreeNodeVisible | null, scrollBlock: ScrollLogicalPosition = "nearest"): void {
        this.treeNavFocusNode = node;
        if (this.treeNavFocusNode !== null) {
            const nodeIndex = this.visibleNodesToRender.indexOf(this.treeNavFocusNode);
            this.treeList[virtualizerRef]!.element(nodeIndex)!.scrollIntoView({ block: scrollBlock });
        }
    }

    /**
     * Handle tree keyboard navigation.
     * Follows these guidelines for keyboard interaction: {@link https://www.w3.org/WAI/ARIA/apg/patterns/treeview/}
     * @param {KeyboardEvent} e
     */
    private onTreeKeydown(e: KeyboardEvent): void {
        const focusNode = this.treeNavFocusNode;
        if (focusNode === null) {
            return;
        }

        let consumed = false;
        switch (e.key) {
            case "ArrowLeft":
                consumed = true;
                if (focusNode.isParent && focusNode.isExpanded) {
                    // focus is on an open node, closes the node
                    this.expandNode(focusNode, false);
                } else if (focusNode.depth > 0) {
                    // focus is on a child node that is also either an end node
                    // or a closed node, moves focus to its parent node.
                    let prevNodeIndex = this.visibleNodesToRender.indexOf(focusNode) - 1;
                    while (prevNodeIndex >= 0) {
                        const prevNode = this.visibleNodesToRender[prevNodeIndex];
                        if (prevNode.depth < focusNode.depth) {
                            this.setTreeFocusNode(prevNode);
                            break;
                        }
                        prevNodeIndex--;
                    }
                }
                break;
            case "ArrowRight":
                consumed = true;
                if (focusNode.isParent) {
                    if (focusNode.isExpanded) {
                        // focus is on an open node, moves focus to the first child node
                        const focusNodeIndex = this.visibleNodesToRender.indexOf(focusNode);
                        this.setTreeFocusNode(this.visibleNodesToRender[focusNodeIndex + 1]);
                    } else {
                        // focus is on a closed node, opens the node; focus does not move
                        this.expandNode(focusNode, true);
                    }
                }
                break;
            case "ArrowUp":
                consumed = true;
                // moves focus to the previous node that is focusable without opening
                // or closing a node
                let prevNodeIndex = this.visibleNodesToRender.indexOf(focusNode) - 1;
                if (prevNodeIndex >= 0) {
                    this.setTreeFocusNode(this.visibleNodesToRender[prevNodeIndex]);
                }
                break;
            case "ArrowDown":
                consumed = true;
                // moves focus to the next node that is focusable without opening
                // or closing a node
                let nextNodeIndex = this.visibleNodesToRender.indexOf(focusNode) + 1;
                if (nextNodeIndex < this.visibleNodesToRender.length) {
                    this.setTreeFocusNode(this.visibleNodesToRender[nextNodeIndex]);
                }
                break;
            case "Home":
                consumed = true;
                // moves focus to the first node in the tree without opening or closing a node
                this.setTreeFocusNode(this.findVisibleNodeBy(n => n.visible), "start");
                break;
            case "End":
                consumed = true;
                // moves focus to the last node in the tree that is focusable without opening a node
                this.setTreeFocusNode(this.findLastVisibleNodeBy(n => n.visible), "end");
                break;
            case "Enter":
                consumed = true;
                // activates the node
                this.open(focusNode.node);
                break;
        }

        if (consumed) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    private onTreeClick(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (target === null) {
            return;
        }

        const entry = target.closest(".dump-entry");
        if (entry === null) {
            return;
        }
        const typeName = entry.querySelector("span")?.textContent || null;
        if (typeName === null) {
            return;
        }
        const vnode = this.findVisibleNodeToRenderByName(typeName);
        if (vnode === null) {
            return;
        }

        if (target.classList.contains("dump-entry-parent") &&
            e.clientX < target.getBoundingClientRect().x /* click on the ::before element with open/close arrow */) {
            this.expandNode(vnode, !vnode.isExpanded);
        } else {
            this.open(vnode.node);
        }

        e.preventDefault();
    }

    private onSearchOptionToggle(e: MouseEvent): void {
        const toggle = (e.target as HTMLElement).closest(".dump-search-toggle");
        if (toggle === null) {
            return;
        }
        const binding = searchOptionBindings[toggle.id];
        binding.setter(!binding.getter(this.searchOptions), this.searchOptions);

        // save options
        DumpTree.storedSearchOptions = this.searchOptions;

        // refresh search results with new options
        this.search(this.searchInput.value);
    }

    private onSearchInput(e: Event): void {
        const searchText = (e.target as HTMLInputElement).value;

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

    private expandNode(node: TreeNodeVisible, expandedState: boolean): void {
        node.isExpanded = expandedState;
        // update visibility of children
        // visibleNodes is a flat in-order representation of the tree, so children are always after their parent
        const visibilityStack = [node.isExpanded]
        for (let i = this.visibleNodes.indexOf(node) + 1; i < this.visibleNodes.length; i++) {
            const child = this.visibleNodes[i];
            if (child.depth <= node.depth) {
                break;
            }
            if (visibilityStack.length > (child.depth - node.depth)) {
                visibilityStack.length = child.depth - node.depth;
            }
            child.visible = visibilityStack[visibilityStack.length - 1];
            if (child.isParent) {
                visibilityStack.push(child.visible && child.isExpanded);
            }
        }
        this.visibleNodesToRender = this.visibleNodes.filter(n => n.visible);
    }

    private onSearchDone(foundNodes: SearchResult[]): void {
        this.visibleNodes = this.buildVisibleNodesFromSearchResults(foundNodes);
        this.visibleNodesToRender = this.visibleNodes; // all nodes are visible initially
        this.treeNavFocusNode = null; // reset focus
        if (foundNodes.length === 0) {
            this.resultsMessage = "No results found.";
        } else {
            this.resultsMessage = null;
        }
    }

    private search(text: string): void {
        if (this.nodes === null) {
            return;
        }

        text = text.trim();
        let matcher: (str: string) => boolean;
        if (text.length === 0) {
            matcher = _ => true;
        } else if (this.searchOptions.regex) {
            try {
                const regex = new RegExp(text, this.searchOptions.matchCase ? undefined : "i");
                matcher = str => regex.test(str);
            } catch (e) {
                // invalid regex, don't search
                return;
            }
        } else {
            text = this.searchOptions.matchCase ? text : text.toLowerCase();
            matcher = str => str.indexOf(text) !== -1;
        }
        const foundNodes = this.doSearch(this.nodes, matcher);
        this.onSearchDone(foundNodes);
    }

    private doSearch(
        nodes: readonly TreeNode[],
        matcher: (str: string) => boolean,
        state: { parentMatch?: boolean } = {}
    ): SearchResult[] {
        const results = [];
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const name = this.searchOptions.matchMembers ?
                (this.searchOptions.matchCase ? node.markup : node.markupLowerCase) : // TODO: search only member names with 'matchMembers' set
                (this.searchOptions.matchCase ? node.name : node.nameLowerCase);
            let match = false;
            let childrenResults = null;
            if (this.searchOptions.showChildren) {
                match = state.parentMatch || matcher(name);
                const prevParentMatch = state.parentMatch;
                state.parentMatch = match;

                childrenResults = node.children ? this.doSearch(node.children, matcher, state) : null;
                match = (childrenResults && childrenResults.length > 0) || match;

                state.parentMatch = prevParentMatch || false;
            } else {
                childrenResults = node.children ? this.doSearch(node.children, matcher, state) : null;
                match = (childrenResults && childrenResults.length > 0) || matcher(name);
            }


            if (match) {
                results.push({ node, children: childrenResults });
            }
        }

        return results;
    }

    private readonly onLocationHashChangedHandler = this.onLocationHashChanged.bind(this);
    private onLocationHashChanged(e: HashChangeEvent): void {
        const id = this.fixOldHashId(new URL(e.newURL), true);
        if (id === null) {
            return;
        }

        const node = this.findNodeByName(id);
        this.open(node);

        if (node !== null) {
            this.setTreeFocusNode(this.findVisibleNodeToRenderByName(node.name), "center");
        }
    }

    /**
     * In the node tree, element IDs use the struct/enum hash when the name is unknown and the name once it is known.
     * For example, if an URL to an specific struct/enum was shared, but later the hash was resolved, that URL
     * would break and not open the struct/enum details view.
     *
     * This method is used to fix old URLs that are using the hash ID when the name is known.
     *
     * @param url The URL to fix.
     * @param replaceHistoryState If true, the history state will be replaced with the fixed URL.
     * @returns {string} The fixed ID. If the ID was not changed, the original ID is returned.
     * If `url.hash` is empty, `null` is returned.
     */
    private fixOldHashId(url: URL, replaceHistoryState: boolean): string | null {
        if (url.hash.length <= 1) {
            return null
        }

        const id = url.hash.substring(1);
        const newId = this.hashIdToNameIdMap.get(id);
        if (newId !== undefined) {
            if (replaceHistoryState) {
                const newURL = new URL(url);
                newURL.hash = `#${newId}`;
                history.replaceState(null, "", newURL.toString());
            }
            return newId
        }

        return id
    }

    private onSplitterMouseDown(e: MouseEvent): void {
        this.splitterStartX = e.clientX;
        this.splitterStartWidth = this.splitterLeftElementRef.value!.offsetWidth;
        this.splitterDragging = true;

        e.preventDefault();
    }

    private readonly onSplitterMouseUpHandler = this.onSplitterMouseUp.bind(this);
    private onSplitterMouseUp(e: MouseEvent): void {
        if (this.splitterDragging) {
            this.splitterDragging = false;

            e.preventDefault();
            e.stopPropagation();
        }
    }

    private readonly onSplitterMouseMoveHandler = this.onSplitterMouseMove.bind(this);
    private onSplitterMouseMove(e: MouseEvent): void {
        if (this.splitterDragging) {
            const diff = e.clientX - this.splitterStartX;
            this.splitterLeftElementStyle = { width: `${this.splitterStartWidth + diff}px` };

            e.preventDefault();
            e.stopPropagation();
        }
    }

    private buildVisibleNodes(nodes: TreeNode[], depth: number = 0): TreeNodeVisible[] {
        return nodes.flatMap(n => {
            const v = new TreeNodeVisible(n, depth);
            return [v, ...this.buildVisibleNodes(n.children || [], depth + 1)];
        });
    }

    private buildVisibleNodesFromSearchResults(nodes: SearchResult[], depth: number = 0): TreeNodeVisible[] {
        return nodes.flatMap(n => {
            const v = new TreeNodeVisible(n.node, depth);
            return [v, ...this.buildVisibleNodesFromSearchResults(n.children || [], depth + 1)];
        });
    }

    public setTree(treeData: JTree | null): void {
        this.loading = false;
        if (treeData == null) {
            // null indicates that some error occurred at caller site
            this.error = true;
            return;
        }

        const structs = treeData.structs;
        const enums = treeData.enums;
        const structNodes = structs.map(s => new TreeNode("struct", s));
        const enumNodes = enums.map(e => new TreeNode("enum", e));
        this.nodes = structNodes.concat(enumNodes).sort(TreeNode.compare);
        const initNodes = (nodes: TreeNode[], parent: TreeNode | null) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                node.previousSibling = i > 0 ? nodes[i - 1] : null;
                node.nextSibling = i < nodes.length - 1 ? nodes[i + 1] : null;
                node.parent = parent;
                if (node.children) {
                    initNodes(node.children, node);
                }

                // store hash -> name mapping for solved names, used to fix old URLs using hash IDs
                if (node.hashId !== node.name) {
                    this.hashIdToNameIdMap.set(node.hashId, node.name);
                }
            }
        };
        initNodes(this.nodes, null);
        this.visibleNodes = this.buildVisibleNodes(this.nodes);
        this.visibleNodesToRender = this.visibleNodes; // all nodes are visible initially

        if (this.nodes.length === 0) {
            const isDiff = this.buildB !== null;
            this.resultsMessage = isDiff ? "No changes between these builds." : "No types in this build.";
        } else {
            // default search from URL parameter
            if (this.searchInput.value) {
                this.search(this.searchInput.value)
            }

            // manually scroll to and select the struct specified in the URL once the dump is loaded
            const id = this.fixOldHashId(new URL(document.location.href), true);
            if (id !== null) {
                const node = this.findNodeByName(id);
                if (node !== null) {
                    this.open(node);

                    // the tree DOM is not yet created, so we need to wait until the next frame to scroll to the node
                    setTimeout(async () => {
                        await this.treeList[virtualizerRef]!.layoutComplete;
                        this.setTreeFocusNode(this.findVisibleNodeToRenderByName(node.name), "center");
                    }, 0);
                }
            }
        }
    }

    public setGameBuild(game: GameId, buildA: string, buildB: string | null): void {
        this.game = game;
        this.buildA = buildA;
        this.buildB = buildB;
    }

    private open(node: TreeNode | null): void {
        this.treeSelectedNode = node;
        if (node === null) {
            return;
        }

        // update URL
        const loc = new URL(document.location.href);
        loc.hash = node.name;
        history.replaceState(null, "", loc.toString());

        // reset details view scroll
        this.detailsContainer.scroll(0, 0)
    }

    private findNodeByName(name: string): TreeNode | null {
        return this.findNodeBy(node => node.name === name)
    }

    private findNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.findNodeByCore(this.nodes, predicate);
    }

    // @ts-ignore
    private findLastNodeBy(predicate: (node: TreeNode) => boolean): TreeNode | null {
        return this.findLastNodeByCore(this.nodes, predicate);
    }

    private findVisibleNodeByName(name: string): TreeNodeVisible | null {
        return this.findVisibleNodeBy(node => node.name === name)
    }

    private findVisibleNodeToRenderByName(name: string): TreeNodeVisible | null {
        return this.findVisibleNodeToRenderBy(node => node.name === name)
    }

    private findVisibleNodeBy(predicate: (node: TreeNodeVisible) => boolean): TreeNodeVisible | null {
        return this.findVisibleNodeByCore(this.visibleNodes, predicate);
    }

    private findVisibleNodeToRenderBy(predicate: (node: TreeNodeVisible) => boolean): TreeNodeVisible | null {
        return this.findVisibleNodeByCore(this.visibleNodesToRender, predicate);
    }

    // @ts-ignore
    private findLastVisibleNodeBy(predicate: (node: TreeNodeVisible) => boolean): TreeNodeVisible | null {
        return this.findLastVisibleNodeByCore(this.visibleNodes, predicate);
    }

    private findNodeByCore(nodes: TreeNode[], predicate: (node: TreeNode) => boolean): TreeNode | null {
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

    // @ts-ignore
    private findLastNodeByCore(nodes: TreeNode[], predicate: (node: TreeNode) => boolean): TreeNode | null {
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

    private findVisibleNodeByCore(nodes: TreeNodeVisible[], predicate: (node: TreeNodeVisible) => boolean): TreeNodeVisible | null {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                return node;
            }
        }

        return null;
    }

    private findLastVisibleNodeByCore(nodes: TreeNodeVisible[], predicate: (node: TreeNodeVisible) => boolean): TreeNodeVisible | null {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                return node;
            }
        }

        return null;
    }

    private static get storedSearchOptions(): SearchOptions {
        const json = localStorage.getItem("searchOptions");
        return {...defaultSearchOptions, ...(json !== null ? JSON.parse(json) : {})};
    }

    private static set storedSearchOptions(options: SearchOptions) {
        localStorage.setItem("searchOptions", JSON.stringify(options));
    }
}
