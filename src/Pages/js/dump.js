// components used in the HTML
import "./components/PageHeader.js";
import "./components/CodeSnippet.js";
import "./components/DumpDownloads.js";

import { gameIdToName, gameIdToFormattedName, getDumpURL, hideElement, animateButtonClick } from "./util.js";

const URL_PARAM_GAME = "game";
const URL_PARAM_BUILD = "build";
const URL_PARAM_SEARCH = "search";

function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get(URL_PARAM_GAME);
    const build = loc.searchParams.get(URL_PARAM_BUILD);

    document.getElementById("dump-game-info").innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${build})</small></h2>`;
    document.title = `${gameIdToName(game)} (build ${build}) — ${document.title}`;

    const downloads = document.querySelector("dump-downloads");
    downloads.setGameBuild(game, build);

    const search = new DumpSearchHandler();

    hideElement(document.getElementById("dump-subheader"), false);

    const jsonLoc = getDumpURL(game, build, "tree.json");
    fetch(jsonLoc)
        .then(response => response.json())
        .then(tree => {
            if (!tree) {
                setErrorMsg("Failed to fetch dump for this build.");
            } else {
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
                        for (const c of node.children.sort(nodeComparer)) { renderNode({ type: "struct", ...c}); }
                        dedent();
                        html += "</details>";
                    } else {
                        html += renderEntry(node);
                    }
                    html += "</li>";
                }

                indent();
                const structNodes = structs.map(c => ({ type: "struct", ...c}));
                const enumNodes = enums.map(e => ({type: "enum", ...e}));
                const nodes = structNodes.concat(enumNodes).sort(nodeComparer);
                for (const n of nodes) { renderNode(n); }
                dedent();

                const view = new DumpDetailsView(game, build, html, nodes);

                search.setNodes(nodes);
                enableSplitter();
            }

            hideElement(document.getElementById("loading"), true);
            hideElement(document.getElementById("dump-container"), false);

            // manually scroll to the struct specified in the URL once the dump is loaded
            if (loc.hash.length > 0) {
                const elem = document.getElementById(loc.hash.substring(1));
                if (elem !== null) {
                    elem.scrollIntoView();
                    elem.querySelector(".dump-entry-button").click();
                }
            }
        })
        .catch(error => {
            console.error(error);

            setErrorMsg("Failed to fetch dump for this build.");
            hideElement(document.getElementById("loading"), true);
            hideElement(document.getElementById("dump-container"), true);
        });
}

class DumpDetailsView {
    #game;
    #build;
    #nodes;
    #list;
    #selectedEntryBtn;
    #selectedEntryNode;

    constructor(game, build, listHTML, nodes) {
        this.#game = game;
        this.#build = build;
        this.#nodes = nodes;
        this.#list = document.getElementById("dump-list");
        this.#list.innerHTML += listHTML;
        this.#list.addEventListener("click", this.#onListEntrySelected.bind(this));
        window.addEventListener("hashchange", this.#onLocationHashChanged.bind(this));
        document.getElementById("dump-details-link").addEventListener("click", this.#onCopyLink.bind(this));
    }

    #onCopyLink(e) {
        const url = new URL(document.location);
        Array.from(url.searchParams.keys()).forEach(k => url.searchParams.delete(k));
        url.searchParams.set(URL_PARAM_GAME, this.#game);
        url.searchParams.set(URL_PARAM_BUILD, this.#build);
        url.hash = `#${this.#selectedEntryNode.name}`;
        navigator.clipboard.writeText(url.toString());

        animateButtonClick(document.getElementById("dump-details-link"));
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

        hideElement(document.getElementById("dump-details-help-tip"), true);
        hideElement(document.getElementById("dump-details-view"), false);
    
        const name = document.getElementById("dump-details-name");
        name.textContent = typeName;
        entryBtn.classList.add("type-link-selected");

        document.getElementById("dump-details-struct").innerHTML = node.markup;

        const version = document.getElementById("dump-details-version");
        const size = document.getElementById("dump-details-size");
        const alignment = document.getElementById("dump-details-alignment");
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

        const fieldsSection = document.getElementById("dump-details-fields-section");
        const fieldsBody = document.getElementById("dump-details-fields-body");
        if (isStruct && node.fields) {
            fieldsBody.innerHTML = node.fields.map(f => {
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

        const usageListSection = document.getElementById("dump-details-usage-list-section");
        const usageList = document.getElementById("dump-details-usage-list");
        if (node.usage) {
            usageList.innerHTML = node.usage.map(usedInTypeName => `<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`).join("");
            hideElement(usageListSection, false);
        } else {
            usageList.innerHTML = "";
            hideElement(usageListSection, true);
        }

        const xmlSection = document.getElementById("dump-details-xml-section");
        const xml = document.getElementById("dump-details-xml");
        if (isStruct) {
            xml.innerHTML = "";
            xml.appendChild(document.createTextNode(node.xml));
            hideElement(xmlSection, false);
        } else {
            xml.innerHTML = "";
            hideElement(xmlSection, true);
        }

        // reset scroll position
        document.getElementById("dump-details").scroll(0, 0)
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
}

function enableSplitter() {
    const splitter = document.getElementById("dump-splitter");

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

class DumpSearchHandler {

    static defaultOptions = {
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

    static get storedOptions() {
        return JSON.parse(localStorage.getItem("searchOptions")) || {};
    }

    static set storedOptions(v) {
        return localStorage.setItem("searchOptions", JSON.stringify(v));
    }

    #options;
    #noResultsMsg;
    #input;
    #nodes;

    constructor() {
        this.#options = { ...DumpSearchHandler.defaultOptions, ...DumpSearchHandler.storedOptions };
        this.#bindOption("dump-search-toggle-match-case",    () => this.#options.matchCase,    v => this.#options.matchCase = v);
        this.#bindOption("dump-search-toggle-regex",         () => this.#options.regex,        v => this.#options.regex = v);
        this.#bindOption("dump-search-toggle-match-members", () => this.#options.matchMembers, v => this.#options.matchMembers = v);
        this.#bindOption("dump-search-toggle-show-children", () => this.#options.showChildren, v => this.#options.showChildren = v);
        this.#input = document.getElementById("dump-search-input");
        this.#input.addEventListener("input", this.#onInput.bind(this));

        const defaultSearch = new URL(document.location).searchParams.get(URL_PARAM_SEARCH);
        if (defaultSearch !== null) {
            this.#input.value = defaultSearch;
        }
    }

    #bindOption(id, getter, setter) {
        const toggle = document.getElementById(id);

        if (getter()) { toggle.classList.add("enabled"); }
        else { toggle.classList.remove("enabled"); }

        toggle.addEventListener("click", e => {
            setter(!getter());
            if (getter()) { toggle.classList.add("enabled"); }
            else { toggle.classList.remove("enabled"); }

            // save options
            DumpSearchHandler.storedOptions = this.#options;

            // refresh search results with new options
            this.search(this.#input.value);
        });
    }

    #onInput(e) {
        const searchText = e.target.value;

        // update URL
        const loc = new URL(document.location);
        if (searchText.length === 0) {
            loc.searchParams.delete(URL_PARAM_SEARCH)
        } else {
            loc.searchParams.set(URL_PARAM_SEARCH, searchText);
        }
        history.replaceState(null, "", loc.toString());

        this.search(searchText);
    }

    search(text) {
        text = text.trim();
        let matcher;
        if (text.length === 0) {
            matcher = _ => true;
        } else if (this.#options.regex) {
            const regex = new RegExp(text, this.#options.matchCase ? undefined : "i");
            matcher = str => regex.test(str);
        } else {
            text = this.#options.matchCase ? text : text.toLowerCase();
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
            const name = this.#options.matchMembers ?
                            (this.#options.matchCase ? node.markup : node.markupLowerCase) : // TODO: search only member names with 'matchMembers' set
                            (this.#options.matchCase ? node.name : node.nameLowerCase);
            let match = false;
            if (this.#options.showChildren) {
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

    setNodes(nodes) {
        const bindAssociatedElements = (nodes) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                node.nameLowerCase = node.name.toLowerCase();
                node.markupLowerCase = node.markup.toLowerCase();
                node.element = document.getElementById(node.name).closest("li");
                if (node.children) {
                    bindAssociatedElements(node.children);
                }
            }
        };
        bindAssociatedElements(nodes);

        this.#nodes = nodes;

        this.#noResultsMsg = document.getElementById("dump-no-results-msg");

        if (this.#input.value) {
            this.search(this.#input.value);
        }
    }
}

function setErrorMsg(msg) {
    const elem = document.getElementById("dump-error-msg");
    if (msg) {
        elem.textContent = msg;
        hideElement(elem, false);
    } else {
        hideElement(elem, true);
    }
}

init();