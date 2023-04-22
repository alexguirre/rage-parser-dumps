import "./SvgIcon.js";
import "./CodeSnippet.js";
import "./DumpDownloads.js";
import {animateButtonClick, gameIdToFormattedName, gameIdToName, hideElement} from "../util.js";

class TreeNode {
    /** @type {"struct"|"enum"} */
    type;
    /** @type {string} */
    name;
    /** @type {string} */
    nameLowerCase;
    /** @type {string} */
    markup;
    /** @type {string} */
    markupLowerCase;
    /** @type {HTMLLIElement} */
    element;
    /** @type {TreeNode|null} */
    previousSibling;
    /** @type {TreeNode|null} */
    nextSibling;
    /** @type {TreeNode|null} */
    parent;
    /** @type {TreeNode[]|null} */
    children;
    /**
     * Object with the JSON data.
     * @param {{}} type
     */
    data;

    constructor(type, nodeData, noChildren= false) {
        this.type = type;
        this.name = nodeData.name;
        this.markup = nodeData.markup;
        this.nameLowerCase = this.name.toLowerCase();
        this.markupLowerCase = this.markup.toLowerCase();
        this.element = null;
        this.previousSibling = null;
        this.nextSibling = null;
        this.parent = null;
        this.children = null;
        this.data = nodeData;

        if (!noChildren && nodeData.children && nodeData.children.length > 0) {
            this.children = new Array(nodeData.children.length);
            for (let i = 0; i < nodeData.children.length; i++) {
                this.children[i] = new TreeNode("struct", nodeData.children[i]);
            }
            this.children.sort(TreeNode.compare);
        }
    }

    /**
     * Creates an unlinked copy of this node.
     * @returns {TreeNode}
     */
    copy() {
        const copy = new TreeNode(this.type, this.data, true);
        copy.element = this.element;
        copy.previousSibling = null;
        copy.nextSibling = null;
        copy.parent = null;
        copy.children = null;
        return copy;
    }

    hasChildren() { return this.children && this.children.length > 0; }
    isExpanded() {
        const detailsElem = this.hasChildren() && this.element.querySelector("details");
        return detailsElem && detailsElem.open;
    }
    expand(state) {
        const detailsElem = this.hasChildren() && this.element.querySelector("details");
        if (detailsElem) {
            detailsElem.open = state;
        }
    }

    /**
     * @param {TreeNode} a
     * @param {TreeNode} b
     * @returns {number}
     */
    static compare(a, b) { return a.name.localeCompare(b.name, "en"); }
}

export default class DumpTree extends HTMLElement {
    static URL_PARAM_GAME = "game";
    static URL_PARAM_BUILD = "build";
    static URL_PARAM_BUILD_A = "build-a";
    static URL_PARAM_BUILD_B = "build-b";
    static URL_PARAM_SEARCH = "search";

    static html = `
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

    #game;
    #buildA;
    #buildB;
    #treeData;
    #tree;
    /** @type {TreeNode|null} */
    #treeNavFocusNode = null;
    #selectedEntryBtn;
    #selectedEntryNode = null;
    /** @type {TreeNode[]} */
    #nodes;
    /** @type {TreeNode[]} */
    #visibleNodes;
    #searchOptions;
    #searchInput;
    #noResultsMsg;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpTree.html;
    }

    connectedCallback() {
        window.addEventListener("hashchange", this.#onLocationHashChanged.bind(this));
        this.shadowRoot.getElementById("details-link").addEventListener("click", this.#onCopyLink.bind(this));

        this.#initSplitter();
        this.#initSearch();

        this.#tree = this.shadowRoot.getElementById("tree");
        this.#tree.addEventListener("click", this.#onTreeEntrySelected.bind(this));
        this.#tree.addEventListener("keydown", this.#onTreeKeydown.bind(this));
        this.#tree.addEventListener("focusin", this.#onTreeFocusIn.bind(this));
        this.#tree.addEventListener("focusout", this.#onTreeFocusOut.bind(this));
    }

    disconnectedCallback() {
    }

    setTree(treeData, game, buildA, buildB) {
        this.#game = game;
        this.#buildA = buildA;
        this.#buildB = buildB;
        this.#treeData = treeData;

        const isDiff = buildB !== null;
        const downloads = this.shadowRoot.getElementById("downloads");
        const info = this.shadowRoot.getElementById("game-info");
        if (!isDiff) {
            downloads.setGameBuild(game, buildA);
            info.innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${buildA})</small></h2>`;
        } else {
            hideElement(downloads, true);
            info.innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${buildA} ↔ ${buildB})</small></h2>`;
        }

        hideElement(this.shadowRoot.getElementById("subheader"), false);

        this.#renderTree(treeData);

        const postRenderInitNodes = (nodes, parent) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                node.element = this.shadowRoot.getElementById(node.name).closest("li");
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

        if (this.#searchInput.value) {
            this.#search(this.#searchInput.value)
        }

        hideElement(this.shadowRoot.getElementById("contents"), false);

        // manually scroll to the struct specified in the URL once the dump is loaded
        const loc = new URL(document.location);
        if (loc.hash.length > 0) {
            const elem = this.shadowRoot.getElementById(loc.hash.substring(1));
            if (elem !== null) {
                elem.scrollIntoView();
                elem.querySelector(".dump-entry-button").click();
            }
        }
    }

    #onCopyLink(e) {
        const url = new URL(document.location);
        Array.from(url.searchParams.keys()).forEach(k => url.searchParams.delete(k));
        url.searchParams.set(DumpTree.URL_PARAM_GAME, this.#game);
        if (this.#buildA !== null && this.#buildB !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_A, this.#buildA);
            url.searchParams.set(DumpTree.URL_PARAM_BUILD_B, this.#buildB);
        } else if (this.#buildA !== null) {
            url.searchParams.set(DumpTree.URL_PARAM_BUILD, this.#buildA);
        }
        url.hash = `#${this.#selectedEntryNode.name}`;
        navigator.clipboard.writeText(url.toString());

        animateButtonClick(this.shadowRoot.getElementById("details-link"));
    }

    /**
     *
     * @param {FocusEvent} e
     */
    #onTreeFocusIn(e) {
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
            this.#treeNavFocusNode.element.querySelector(".dump-entry-button").dataset.treeFocus = true;
        }
    }

    /**
     *
     * @param {FocusEvent} e
     */
    #onTreeFocusOut(e) {
        if (this.#treeNavFocusNode !== null) {
            delete this.#treeNavFocusNode.element.querySelector(".dump-entry-button").dataset.treeFocus;
        }
    }

    /**
     * Set the currently focused node in the tree for keyboard navigation.
     * @param {TreeNode|null} node
     */
    #setTreeFocusNode(node) {
        if (this.#treeNavFocusNode !== null) {
            delete this.#treeNavFocusNode.element.querySelector(".dump-entry-button").dataset.treeFocus;
        }

        this.#treeNavFocusNode = node;
        if (this.#treeNavFocusNode !== null) {
            const btn = this.#treeNavFocusNode.element.querySelector(".dump-entry-button");
            btn.dataset.treeFocus = true;
            btn.scrollIntoView({ block: "nearest", inline: "end" });
            // TODO: should details be opened on focus or only on Enter key?
            // this.open(btn);
        }
    }

    /**
     * Handle tree keyboard navigation.
     * Follows these guidelines for keyboard interaction: https://www.w3.org/WAI/ARIA/apg/patterns/treeview/
     * @param {KeyboardEvent} e
     */
    #onTreeKeydown(e) {
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
                    this.#setTreeFocusNode(focusNode.children[0]);
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
                    prevNode = prevNode.children[prevNode.children.length - 1];
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
                let nextNode = focusNode.isExpanded() ? focusNode.children[0] : focusNode.nextSibling;
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
                const isExpandedRecursive = n => {
                    return n.parent === null || (n.parent.isExpanded() && isExpandedRecursive(n.parent));
                };
                this.#setTreeFocusNode(this.#findLastVisibleNodeBy(isExpandedRecursive));
                break;
            case "Enter":
                consumed = true;
                // activates the node
                this.open(focusNode.element.querySelector(".dump-entry-button"));
                break;
        }

        if (consumed) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    #onTreeEntrySelected(e) {
        const btn = e.target.closest(".dump-entry-button");
        this.open(btn);

        if (btn) {
            e.preventDefault();
        }
    }

    #onLocationHashChanged(e) {
        const id = new URL(e.newURL).hash;
        const btn = this.#tree.querySelector(`${id} > .dump-entry-button`);
        this.open(btn);
    }

    open(entryBtn) {
        if (this.#selectedEntryBtn) {
            this.#selectedEntryBtn.classList.remove("type-link-selected");
        }

        this.#selectedEntryBtn = entryBtn;
        if (!entryBtn) {
            return;
        }

        const typeName = entryBtn.querySelector("span").textContent;
        const node = this.#findNodeByName(typeName);
        this.#selectedEntryNode = node;

        // for now the diff view only shows the struct code snippet
        const isDiff = this.#buildB !== null;

        const isStruct = node.type !== "enum";

        // update URL
        const loc = new URL(document.location);
        loc.hash = typeName;
        history.replaceState(null, "", loc.toString());

        hideElement(this.shadowRoot.getElementById("details-help-tip"), true);
        hideElement(this.shadowRoot.getElementById("details-view"), false);

        const name = this.shadowRoot.getElementById("details-name");
        name.textContent = typeName;
        entryBtn.classList.add("type-link-selected");

        const structSnippet = this.shadowRoot.getElementById("details-struct");
        structSnippet.setAttribute("code-lang", isDiff ? "cpp-nolinks" : "cpp");
        structSnippet.innerHTML = node.markup;

        const version = this.shadowRoot.getElementById("details-version");
        const size = this.shadowRoot.getElementById("details-size");
        const alignment = this.shadowRoot.getElementById("details-alignment");
        if (!isDiff && isStruct) {
            version.textContent = node.data.version ? `Version - ${node.data.version}` : "";
            size.textContent = `Size - ${node.data.size}`;
            alignment.textContent = `Alignment - ${node.data.align}`;
            hideElement(version, !node.data.version);
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

        const fieldsSection = this.shadowRoot.getElementById("details-fields-section");
        const fieldsBody = this.shadowRoot.getElementById("details-fields-body");
        if (!isDiff && isStruct && node.data.fields) {
            fieldsBody.innerHTML = node.data.fields.sort((a,b) => a.offset > b.offset ? 1 : -1).map(f => {
                let typeStr = f.type;
                if (f.subtype !== "NONE") {
                    typeStr += `.${f.subtype}`;
                }
                return `<tr><td>${f.offset} (0x${f.offset.toString(16)})</td><td>${f.name}</td><td>${typeStr}</td></tr>`;
            }).join("");
            hideElement(fieldsSection, false);
        } else {
            fieldsBody.innerHTML = "";
            hideElement(fieldsSection, true);
        }

        const usageListSection = this.shadowRoot.getElementById("details-usage-list-section");
        const usageList = this.shadowRoot.getElementById("details-usage-list");
        if (!isDiff && node.data.usage) {
            usageList.innerHTML = node.data.usage.map(usedInTypeName => `<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`).join("");
            hideElement(usageListSection, false);
        } else {
            usageList.innerHTML = "";
            hideElement(usageListSection, true);
        }

        const xmlSection = this.shadowRoot.getElementById("details-xml-section");
        const xml = this.shadowRoot.getElementById("details-xml");
        if (!isDiff && isStruct) {
            xml.innerHTML = "";
            xml.appendChild(document.createTextNode(node.data.xml));
            hideElement(xmlSection, false);
        } else {
            xml.innerHTML = "";
            hideElement(xmlSection, true);
        }

        // reset scroll position
        this.shadowRoot.getElementById("details").scroll(0, 0)
    }

    /**
     * @param {string} name
     * @returns {TreeNode|null}
     */
    #findNodeByName(name) {
        return this.#findNodeBy(node => node.name === name)
    }

    /**
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findNodeBy(predicate) {
        return this.#findNodeByCore(this.#nodes, predicate);
    }

    /**
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findLastNodeBy(predicate) {
        return this.#findLastNodeByCore(this.#nodes, predicate);
    }

    /**
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findVisibleNodeBy(predicate) {
        return this.#findNodeByCore(this.#visibleNodes, predicate);
    }

    /**
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findLastVisibleNodeBy(predicate) {
        return this.#findLastNodeByCore(this.#visibleNodes, predicate);
    }

    /**
     * @param {TreeNode[]} nodes
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findNodeByCore(nodes, predicate) {
        const findRecursive = (nodes, name) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (predicate(node)) {
                    return node;
                }

                if (node.children) {
                    const childResult = findRecursive(node.children, name);
                    if (childResult) {
                        return childResult;
                    }
                }
            }

            return null;
        }

        return findRecursive(nodes, name);
    }

    /**
     * @param {TreeNode[]} nodes
     * @param {(TreeNode) => boolean} predicate
     * @returns {TreeNode|null}
     */
    #findLastNodeByCore(nodes, predicate) {
        const findRecursive = (nodes, name) => {
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                if (node.children) {
                    const childResult = findRecursive(node.children, name);
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

        return findRecursive(nodes, name);
    }

    #renderTree(treeData) {
        const structs = treeData.structs;
        const enums = treeData.enums;

        let html = "";
        const indent = () => {
            html += html.length === 0 ? `<ul role="tree">` : `<ul role="group">`;
        }
        const dedent = () => {
            html += "</ul>";
        };
        /**
         * @param {TreeNode} node
         */
        const renderEntry = node => {
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

            return `
                    <div class="dump-entry" id="${node.name}">
                        ${(node.children && node.children.length > 0) ? `<div class="dump-entry-icon dump-entry-icon-container"></div>` : `<div class="dump-entry-icon"></div>`}
                        <div class="dump-entry-button type-link" title="${tip}">
                            ${diffIcon}
                            <div class="dump-entry-icon dump-entry-icon-${node.type}"></div>
                            <span>${node.name}</span>
                        </div>
                    </div>
                    `;
        }
        /**
         * @param {TreeNode} node
         */
        const renderNode = node => {
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
        this.#noResultsMsg = this.shadowRoot.getElementById("no-results-msg");

        if (this.#nodes.length === 0) {
            const isDiff = this.#buildB !== null;
            this.#noResultsMsg.innerText = isDiff ? "No changes between these builds." : "No types in this build.";
            hideElement(this.#noResultsMsg, false);
            hideElement(this.shadowRoot.getElementById("details-help-tip"), true);
        }
    }

    #initSplitter() {
        const splitter = this.shadowRoot.getElementById("splitter");

        let dragging = false;
        let startX, startWidth;
        splitter.addEventListener("mousedown", e => {
            splitter.classList.add("dragging");
            startX = e.clientX;
            startWidth = splitter.previousElementSibling.offsetWidth;
            dragging = true;

            e.preventDefault();
        });

        document.addEventListener("mousemove", e => {
            if (dragging) {
                const diff = e.clientX - startX;
                splitter.previousElementSibling.style.width = `${startWidth + diff}px`;

                e.preventDefault();
            }
        });

        document.addEventListener("mouseup", e => {
            if (dragging) {
                splitter.classList.remove("dragging");
                dragging = false;

                e.preventDefault();
            }
        });
    }

    #initSearch() {
        this.#searchOptions = { ...DumpTree.defaultSearchOptions, ...DumpTree.storedSearchOptions };
        this.#bindSearchOption("search-toggle-match-case",    () => this.#searchOptions.matchCase,    v => this.#searchOptions.matchCase = v);
        this.#bindSearchOption("search-toggle-regex",         () => this.#searchOptions.regex,        v => this.#searchOptions.regex = v);
        this.#bindSearchOption("search-toggle-match-members", () => this.#searchOptions.matchMembers, v => this.#searchOptions.matchMembers = v);
        this.#bindSearchOption("search-toggle-show-children", () => this.#searchOptions.showChildren, v => this.#searchOptions.showChildren = v);
        this.#searchInput = this.shadowRoot.getElementById("search-input");
        this.#searchInput.addEventListener("input", this.#onSearchInput.bind(this));

        const defaultSearch = new URL(document.location).searchParams.get(DumpTree.URL_PARAM_SEARCH);
        if (defaultSearch !== null) {
            this.#searchInput.value = defaultSearch;
        }
    }

    #bindSearchOption(id, getter, setter) {
        const toggle = this.shadowRoot.getElementById(id);

        if (getter()) { toggle.classList.add("enabled"); }
        else { toggle.classList.remove("enabled"); }

        toggle.addEventListener("click", e => {
            setter(!getter());
            if (getter()) { toggle.classList.add("enabled"); }
            else { toggle.classList.remove("enabled"); }

            // save options
            DumpTree.storedSearchOptions = this.#searchOptions;

            // refresh search results with new options
            this.#search(this.#searchInput.value);
        });
    }

    #onSearchInput(e) {
        const searchText = e.target.value;

        // update URL
        const loc = new URL(document.location);
        if (searchText.length === 0) {
            loc.searchParams.delete(DumpTree.URL_PARAM_SEARCH)
        } else {
            loc.searchParams.set(DumpTree.URL_PARAM_SEARCH, searchText);
        }
        history.replaceState(null, "", loc.toString());

        this.#search(searchText);
    }

    #search(text) {
        text = text.trim();
        let matcher;
        if (text.length === 0) {
            matcher = _ => true;
        } else if (this.#searchOptions.regex) {
            const regex = new RegExp(text, this.#searchOptions.matchCase ? undefined : "i");
            matcher = str => regex.test(str);
        } else {
            text = this.#searchOptions.matchCase ? text : text.toLowerCase();
            matcher = str => str.indexOf(text) !== -1;
        }
        this.#visibleNodes = this.#doSearch(this.#nodes, matcher);
        this.#treeNavFocusNode = null; // reset focus
        hideElement(this.#noResultsMsg, this.#visibleNodes.length !== 0);
    }

    /**
     *
     * @param {{}[]} nodes
     * @param {(str: string) => boolean} matcher
     * @param {{}} state
     * @returns {TreeNode[]} tree of matching nodes
     */
    #doSearch(nodes, matcher, state = {}) {
        let results = [];
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const name = this.#searchOptions.matchMembers ?
                (this.#searchOptions.matchCase ? node.markup : node.markupLowerCase) : // TODO: search only member names with 'matchMembers' set
                (this.#searchOptions.matchCase ? node.name : node.nameLowerCase);
            let match = false;
            let childrenResults = null;
            if (this.#searchOptions.showChildren) {
                match = state.parentMatch || matcher(name);
                const prevParentMatch = state.parentMatch;
                state.parentMatch = match;

                childrenResults = node.children ? this.#doSearch(node.children, matcher, state) : null;
                match = (childrenResults && childrenResults.length > 0) || match;

                state.parentMatch = prevParentMatch;
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

            hideElement(node.element, !match);
        }

        return results;
    }

    static defaultSearchOptions = {
        /**
         * String comparison is case-sensitive.
         */
        matchCase: false,
        /**
         * Treats the search string as a regular expression.
         */
        regex: false,
        /**
         * Search the string in struct member names.
         */
        matchMembers: false,
        /**
         * Matching the base struct will include its derived structs in the search results.
         */
        showChildren: true,
    };

    static get storedSearchOptions() {
        return JSON.parse(localStorage.getItem("searchOptions")) || {};
    }

    static set storedSearchOptions(v) {
        return localStorage.setItem("searchOptions", JSON.stringify(v));
    }
}
customElements.define('dump-tree', DumpTree);
