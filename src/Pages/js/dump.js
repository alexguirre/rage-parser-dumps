// components used in the HTML
import "./components/PageHeader.js";
import "./components/CodeSnippet.js";

import { gameIdToName, gameIdToFormattedName, getDumpURL, hideElement, animateButtonClick } from "./util.js";

const URL_PARAM_GAME = "game";
const URL_PARAM_BUILD = "build";
const URL_PARAM_SEARCH = "search";

function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get(URL_PARAM_GAME);
    const build = loc.searchParams.get(URL_PARAM_BUILD);

    document.getElementById("dump-game-info").innerHTML = `<h2>${gameIdToFormattedName(game)} <small>(build ${build})</small></h2>`;
    document.title += ` — ${gameIdToName(game)} (build ${build})`;

    document.getElementById("dump-link-html").href = getDumpURL(game, build, "html");
    document.getElementById("dump-link-plain-text").href = getDumpURL(game, build, "txt");
    document.getElementById("dump-link-json").href = getDumpURL(game, build, "json");
    document.getElementById("dump-link-xsd").href = getDumpURL(game, build, "xsd");

    hideElement(document.getElementById("dump-subheader"), false);

    const jsonLoc = getDumpURL(game, build, "tree.json");
    fetch(jsonLoc)
        .then(response => response.json())
        .then(tree => {
            if (!tree) {
                setErrorMsg("Failed to fetch dump for this build.");
            } else {
                const structTree = tree.structs;
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
                const structNodes = structTree.children.map(c => ({ type: "struct", ...c}));
                const enumNodes = enums.map(e => ({type: "enum", name: e}));
                const nodes = structNodes.concat(enumNodes).sort(nodeComparer);
                for (const n of nodes) { renderNode(n); }
                dedent();

                const view = new DumpDetailsView(game, build, html, nodes);

                enableSearch(nodes);
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
        this.#list.innerHTML = listHTML;
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


        // update URL
        const loc = new URL(document.location);
        loc.hash = typeName;
        history.replaceState(null, "", loc.toString());

        hideElement(document.getElementById("dump-details-help-tip"), true);
        hideElement(document.getElementById("dump-details-view"), false);
    
        document.getElementById("dump-details-name").textContent = typeName;
        entryBtn.classList.add("type-link-selected");

        document.getElementById("dump-details-struct").innerHTML = node.markup;
        document.getElementById("dump-details-version").textContent = node.version;
        document.getElementById("dump-details-size").textContent = node.size;
        document.getElementById("dump-details-alignment").textContent = node.alignment;


        const usageListTitle = document.getElementById("dump-details-usage-list-title");
        const usageList = document.getElementById("dump-details-usage-list");
        if (node.usage) {
            usageList.innerHTML = node.usage.map(usedInTypeName => `<li><a class="type-link hl-type" href="#${usedInTypeName}">${usedInTypeName}</a></li>`).join("");
            hideElement(usageListTitle, false);
            hideElement(usageList, false);
        } else {
            hideElement(usageListTitle, true);
            hideElement(usageList, true);
        }

        animateButtonClick(entryBtn);

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

function enableSearch(nodes) {
    const bindAssociatedElements = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            node.element = document.getElementById(node.name).closest("li");
            if (node.children) {
                bindAssociatedElements(node.children);
            }
        }
    };
    bindAssociatedElements(nodes);

    // TODO: show options to the user
    const searchOptions = {
        /**
         * String comparison is case-sensitive
         */
        caseSensitive: false, // TODO: support case sensitive option
        /**
         * Matching the base struct will include its derived structs in the search results.
         */
        showChildren: true,
    };

    const doSearch = (nodes, text, state) => {
        let numResults = 0;
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            let match = false;
            if (searchOptions.showChildren) {
                match = state.parentMatch || text.length === 0 || node.name.indexOf(text) !== -1;
                const prevParentMatch = state.parentMatch;
                state.parentMatch = match;

                const numChildrenResults = node.children ? doSearch(node.children, text, state) : 0;
                numResults += numChildrenResults;

                match = numChildrenResults !== 0 || match;

                state.parentMatch = prevParentMatch;
            } else {
                const numChildrenResults = node.children ? doSearch(node.children, text, state) : 0;
                numResults += numChildrenResults;
                match = numChildrenResults !== 0 || text.length === 0 || node.name.indexOf(text) !== -1;
            }


            if (match) {
                numResults++;
            }

            hideElement(node.element, !match);
        }

        return numResults;
    }

    const doSearchFromRoot = text => {
        const numResults = doSearch(nodes, text, {});
        setErrorMsg(numResults !== 0 ? null : "No results found.");
    };

    const searchInput = document.getElementById("dump-search-box");
    searchInput.addEventListener("input", e => {
        const searchText = e.target.value;

        // update URL
        const loc = new URL(document.location);
        if (searchText.length === 0) {
            loc.searchParams.delete(URL_PARAM_SEARCH)
        } else {
            loc.searchParams.set(URL_PARAM_SEARCH, searchText);
        }
        history.replaceState(null, "", loc.toString());

        doSearchFromRoot(searchText);
    });

    const defaultSearch = new URL(document.location).searchParams.get(URL_PARAM_SEARCH);
    if (defaultSearch !== null) {
        searchInput.value = defaultSearch;
        doSearchFromRoot(defaultSearch);
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