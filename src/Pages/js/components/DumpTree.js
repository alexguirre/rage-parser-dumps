import "./CodeSnippet.js";
import "./DumpDownloads.js";
import {animateButtonClick, gameIdToFormattedName, gameIdToName, hideElement} from "../util.js";

export default class DumpTree extends HTMLElement {
    static URL_PARAM_GAME = "game";
    static URL_PARAM_BUILD = "build";
    static URL_PARAM_SEARCH = "search";

    static html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="dump-tree-root">
            <div id="dump-subheader" class="row-layout hidden">
                <div id="dump-game-info"></div>
                <div id="dump-search-box">
                    <input id="dump-search-input" type="text" placeholder="Search..." />
                    <div id="dump-search-options" class="row-layout">
                        <button id="dump-search-toggle-match-case"    class="header-icon dump-search-toggle" title="Match Case"><img src="img/match-case.svg"></button>
                        <button id="dump-search-toggle-regex"         class="header-icon dump-search-toggle" title="Use Regular Expression"><img src="img/regex.svg"></button>
                        <button id="dump-search-toggle-match-members" class="header-icon dump-search-toggle" title="Match Members"><img src="img/match-members.svg"></button>
                        <button id="dump-search-toggle-show-children" class="header-icon dump-search-toggle" title="Show Children"><img src="img/show-children.svg"></button>
                    </div>
                </div>
            </div>
            <div id="dump-container" class="hidden">
                <div id="dump-list">
                    <p id="dump-no-results-msg" class="dump-help-msg hidden">No results found.</p>
                </div>
                <div id="dump-splitter"></div>
                <div id="dump-details">
                    <p id="dump-details-help-tip" class="dump-help-msg">Select a type to display its details here.</p>
                    <div id="dump-details-view" class="hidden">
                        <div class="row-layout">
                            <button id="dump-details-link" class="link-btn" title="Copy link"></button>
                            <h3 id="dump-details-name">CSomeStruct</h3>
                        </div>
                        <code-snippet id="dump-details-struct" lang="cpp"></code-snippet>
                        <div class="dump-details-section-contents row-layout">
                            <span id="dump-details-version">Version - 1.0</span>
                            <span id="dump-details-size">Size - 123</span>
                            <span id="dump-details-alignment">Alignment - 123</span>
                        </div>
                        <details id="dump-details-fields-section" open>
                            <summary><h4 class="dump-details-title">Fields</h4></summary>
                            <table id="dump-details-fields" class="themed-table dump-details-section-contents">
                                <thead>
                                    <tr>
                                        <th>Offset</th>
                                        <th>Name</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody id="dump-details-fields-body">
                                </tbody>
                            </table>
                        </details>
                        <details id="dump-details-usage-list-section" open>
                            <summary><h4 class="dump-details-title">Used in</h4></summary>
                            <ul id="dump-details-usage-list" class="dump-details-section-contents">
                            </ul>
                        </details>
                        <details id="dump-details-xml-section" open>
                            <summary><h4 class="dump-details-title">XML example</h4></summary>
                            <div class="dump-details-section-contents"><code-snippet id="dump-details-xml" lang="xml"></code-snippet></div>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    `;

    #game;
    #build;
    #tree;
    #list;
    #selectedEntryBtn;
    #selectedEntryNode;
    #nodes;
    #searchOptions;
    #searchInput;
    #noResultsMsg;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = DumpTree.html;

        this.#list = this.shadowRoot.getElementById("dump-list");
        this.#list.addEventListener("click", this.#onListEntrySelected.bind(this));
    }

    connectedCallback() {
        window.addEventListener("hashchange", this.#onLocationHashChanged.bind(this));
        this.shadowRoot.getElementById("dump-details-link").addEventListener("click", this.#onCopyLink.bind(this));

        this.#initSplitter();
        this.#initSearch();
    }

    disconnectedCallback() {
    }

    setTree(tree, game, build) {
        this.#game = game;
        this.#build = build;
        this.#tree = tree;

        this.shadowRoot.getElementById("dump-game-info").innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${build})</small></h2>`;
        document.title = `${gameIdToName(game)} (build ${build}) — ${document.title}`;

        hideElement(this.shadowRoot.getElementById("dump-subheader"), false);

        this.#renderTree(tree);

        const bindAssociatedElementsToNodes = (nodes) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                node.nameLowerCase = node.name.toLowerCase();
                node.markupLowerCase = node.markup.toLowerCase();
                node.element = this.shadowRoot.getElementById(node.name).closest("li");
                if (node.children) {
                    bindAssociatedElementsToNodes(node.children);
                }
            }
        };
        bindAssociatedElementsToNodes(this.#nodes);

        if (this.#searchInput.value) {
            this.#search(this.#searchInput.value)
        }

        hideElement(this.shadowRoot.getElementById("dump-container"), false);

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
        url.searchParams.set(DumpTree.URL_PARAM_BUILD, this.#build);
        url.hash = `#${this.#selectedEntryNode.name}`;
        navigator.clipboard.writeText(url.toString());

        animateButtonClick(this.shadowRoot.getElementById("dump-details-link"));
    }

    #onListEntrySelected(e) {
        const btn = e.target.closest(".dump-entry-button");
        this.open(btn);

        if (btn) {
            e.preventDefault();
        }
    }

    #onLocationHashChanged(e) {
        const id = new URL(e.newURL).hash;
        const btn = this.#list.querySelector(`${id} > .dump-entry-button`);
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

        const isStruct = node.type !== "enum";

        // update URL
        const loc = new URL(document.location);
        loc.hash = typeName;
        history.replaceState(null, "", loc.toString());

        hideElement(this.shadowRoot.getElementById("dump-details-help-tip"), true);
        hideElement(this.shadowRoot.getElementById("dump-details-view"), false);

        const name = this.shadowRoot.getElementById("dump-details-name");
        name.textContent = typeName;
        entryBtn.classList.add("type-link-selected");

        this.shadowRoot.getElementById("dump-details-struct").innerHTML = node.markup;

        const version = this.shadowRoot.getElementById("dump-details-version");
        const size = this.shadowRoot.getElementById("dump-details-size");
        const alignment = this.shadowRoot.getElementById("dump-details-alignment");
        if (isStruct) {
            version.textContent = node.version ? `Version - ${node.version}` : "";
            size.textContent = `Size - ${node.size}`;
            alignment.textContent = `Alignment - ${node.align}`;
            hideElement(version, !node.version);
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

        const fieldsSection = this.shadowRoot.getElementById("dump-details-fields-section");
        const fieldsBody = this.shadowRoot.getElementById("dump-details-fields-body");
        if (isStruct && node.fields) {
            fieldsBody.innerHTML = node.fields.sort((a,b) => a.offset > b.offset ? 1 : -1).map(f => {
                let typeStr = f.type;
                if (f.subtype !== "NONE") {
                    typeStr += `.${f.subtype}`;
                }
                return /*html*/`<tr><td>${f.offset} (0x${f.offset.toString(16)})</td><!--<td>-</td><td>-</td>--><td>${f.name}</td><td>${typeStr}</td></tr>`;
            }).join("");
            hideElement(fieldsSection, false);
        } else {
            fieldsBody.innerHTML = "";
            hideElement(fieldsSection, true);
        }

        const usageListSection = this.shadowRoot.getElementById("dump-details-usage-list-section");
        const usageList = this.shadowRoot.getElementById("dump-details-usage-list");
        if (node.usage) {
            usageList.innerHTML = node.usage.map(usedInTypeName => `<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`).join("");
            hideElement(usageListSection, false);
        } else {
            usageList.innerHTML = "";
            hideElement(usageListSection, true);
        }

        const xmlSection = this.shadowRoot.getElementById("dump-details-xml-section");
        const xml = this.shadowRoot.getElementById("dump-details-xml");
        if (isStruct) {
            xml.innerHTML = "";
            xml.appendChild(document.createTextNode(node.xml));
            hideElement(xmlSection, false);
        } else {
            xml.innerHTML = "";
            hideElement(xmlSection, true);
        }

        // reset scroll position
        this.shadowRoot.getElementById("dump-details").scroll(0, 0)
    }

    #findNodeByName(name) {
        const findRecursive = (nodes, name) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.name === name) {
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

        return findRecursive(this.#nodes, name);
    }

    #renderTree(tree) {
        const structs = tree.structs;
        const enums = tree.enums;
        const nodeComparer = (a, b) => a.name.localeCompare(b.name, "en");

        let html = "";
        const indent = () => {
            html += "<ul>";
        }
        const dedent = () => {
            html += "</ul>";
        };
        const renderEntry = node => {
            return `
                    <div class="dump-entry" id="${node.name}">
                        ${(node.children && node.children.length > 0) ? `<div class="dump-entry-icon dump-entry-icon-container"></div>` : `<div class="dump-entry-icon"></div>`}
                        <div class="dump-entry-button type-link" title="${node.type} ${node.name}">
                            <div class="dump-entry-icon dump-entry-icon-${node.type}"></div>
                            <span>${node.name}</span>
                        </div>
                    </div>
                    `;
        }
        const renderNode = node => {
            html += "<li>";
            if (node.children && node.children.length > 0) {
                html += `<details open><summary>${renderEntry(node)}</summary>`;
                indent();
                for (const c of node.children.sort(nodeComparer)) {
                    renderNode({type: "struct", ...c});
                }
                dedent();
                html += "</details>";
            } else {
                html += renderEntry(node);
            }
            html += "</li>";
        }

        indent();
        const structNodes = structs.map(c => ({type: "struct", ...c}));
        const enumNodes = enums.map(e => ({type: "enum", ...e}));
        this.#nodes = structNodes.concat(enumNodes).sort(nodeComparer);
        for (const n of this.#nodes) {
            renderNode(n);
        }
        dedent();

        this.#list.innerHTML += html;
        this.#noResultsMsg = this.shadowRoot.getElementById("dump-no-results-msg");
    }

    #initSplitter() {
        const splitter = this.shadowRoot.getElementById("dump-splitter");

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
        this.#bindSearchOption("dump-search-toggle-match-case",    () => this.#searchOptions.matchCase,    v => this.#searchOptions.matchCase = v);
        this.#bindSearchOption("dump-search-toggle-regex",         () => this.#searchOptions.regex,        v => this.#searchOptions.regex = v);
        this.#bindSearchOption("dump-search-toggle-match-members", () => this.#searchOptions.matchMembers, v => this.#searchOptions.matchMembers = v);
        this.#bindSearchOption("dump-search-toggle-show-children", () => this.#searchOptions.showChildren, v => this.#searchOptions.showChildren = v);
        this.#searchInput = this.shadowRoot.getElementById("dump-search-input");
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
        const numResults = this.#doSearch(this.#nodes, matcher);
        hideElement(this.#noResultsMsg, numResults !== 0);
    }

    /**
     *
     * @param {{}[]} nodes
     * @param {(str: string) => boolean} matcher
     * @param {{}} state
     * @returns {number} number of matching elements
     */
    #doSearch(nodes, matcher, state = {}) {
        let numResults = 0;
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const name = this.#searchOptions.matchMembers ?
                (this.#searchOptions.matchCase ? node.markup : node.markupLowerCase) : // TODO: search only member names with 'matchMembers' set
                (this.#searchOptions.matchCase ? node.name : node.nameLowerCase);
            let match = false;
            if (this.#searchOptions.showChildren) {
                match = state.parentMatch || matcher(name);
                const prevParentMatch = state.parentMatch;
                state.parentMatch = match;

                const numChildrenResults = node.children ? this.#doSearch(node.children, matcher, state) : 0;
                numResults += numChildrenResults;

                match = numChildrenResults !== 0 || match;

                state.parentMatch = prevParentMatch;
            } else {
                const numChildrenResults = node.children ? this.#doSearch(node.children, matcher, state) : 0;
                numResults += numChildrenResults;
                match = numChildrenResults !== 0 || matcher(name);
            }


            if (match) {
                numResults++;
            }

            hideElement(node.element, !match);
        }

        return numResults;
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
