// components used in the HTML
import "./components/PageHeader.js";

import { gameIdToFormattedName, getDumpURL } from './util.js';

function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get("game");
    const build = loc.searchParams.get("build");

    let gameName = gameIdToFormattedName(game);
    document.getElementById("game-info").innerHTML = `
        <h2>${gameName} <small>(build ${build})</small></h2> 
    `;
    document.title += ` — ${gameName} (build ${build})`;

    document.getElementById("dump-link-html").href = getDumpURL(game, build, "html");
    document.getElementById("dump-link-plain-text").href = getDumpURL(game, build, "txt");
    document.getElementById("dump-link-json").href = getDumpURL(game, build, "json");
    document.getElementById("dump-link-xsd").href = getDumpURL(game, build, "xsd");

    const htmlLoc = getDumpURL(game, build, "html");
    fetch(htmlLoc)
        .then(response => response.text())
        .then(text => {
            const isEmpty = text.length === 0;
            const dumpContents = document.getElementById("dump-contents");
            if (isEmpty) {
                setErrorMsg("Failed to fetch dump for this build.");
            } else {
                dumpContents.insertAdjacentHTML("beforeend", text);
            }
            enableSearch(loc.searchParams.get("search"));

            // enable struct collapsing
            dumpContents.querySelectorAll("ul > li").forEach(li => li.addEventListener("click", e => {
                const codeWrapper = li.querySelector(".c-w");
                codeWrapper.hidden = !codeWrapper.hidden;
                li.querySelector("code").classList.toggle("expanded");
            }));

            document.getElementById("loading").hidden = true;
            document.getElementById("dump-subheader").hidden = isEmpty;
            dumpContents.hidden = false;

            // manually scroll to the struct specified in the URL once the dump is loaded
            if (loc.hash.length > 0) {
                const elem = document.getElementById(loc.hash.substring(1));
                if (elem !== null) {
                    elem.scrollIntoView();
                    elem.click(); // expand the struct
                }
            }
        })
        .catch(error => {
            console.error(error);

            setErrorMsg("Failed to fetch dump for this build.");
            document.getElementById("loading").hidden = true;
            document.getElementById("dump-contents").hidden = false;
        });
}

function enableSearch(defaultSearch) {
    const dumpContents = document.getElementById("dump-contents");
    const elements = Array.from(dumpContents.querySelectorAll("ul > li")).map(liElem => ({ name: liElem.querySelector("pre > code > span.c-t").textContent, li: liElem }));
    const doSearch = text => {
        let numResults = 0;
        let length = elements.length;
        for(let index = 0; index < length; index++) {
            let elem = elements[index];
            let hide = text.length !== 0 && elem.name.indexOf(text) === -1;
            if (!hide) {
                numResults++;
            }

            elem.li.hidden = hide;
        }

        setErrorMsg(numResults !== 0 ? null : "No results found.");
    }

    const searchInput = document.getElementById("dump-search");
    searchInput.addEventListener("input", e => {
        const searchText = e.target.value;

        // update URL
        const loc = new URL(document.location);
        if (searchText.length === 0) {
            loc.searchParams.delete("search")
        } else {
            loc.searchParams.set("search", searchText);
        }
        history.replaceState(null, "", loc.toString());

        doSearch(searchText);
    });

    if (defaultSearch !== null) {
        searchInput.value = defaultSearch;
        doSearch(defaultSearch);
    }
}

function setErrorMsg(msg) {
    const elem = document.getElementById("dump-contents-error-msg");
    if (msg) {
        elem.textContent = msg;
        elem.hidden = false;
    } else {
        elem.hidden = true;
    }
}

init();