import { gameIdToName, getDumpURL } from './util.js';

function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get("game");
    const build = loc.searchParams.get("build");

    let gameName = gameIdToName(game);
    document.querySelector("#game-info").innerHTML = `
        <h2 class="${game}-font">${gameName} <small>(build ${build})</small></h2> 
    `;
    document.title += ` — ${gameName} (build ${build})`;

    document.querySelector("#dump-link-plain-text").href = getDumpURL(game, build, "txt");
    document.querySelector("#dump-link-json").href = getDumpURL(game, build, "json");
    document.querySelector("#dump-link-xsd").href = getDumpURL(game, build, "xsd");

    const htmlLoc = getDumpURL(game, build, "html");
    fetch(htmlLoc)
        .then(response => response.text())
        .then(text => {
            document.querySelector("#loading").hidden = true;
            document.querySelector("#dump-subheader").hidden = text.length === 0;
            const dumpContents = document.querySelector("#dump-contents");
            dumpContents.innerHTML = text.length !== 0 ? text : "<p>Failed to fetch dump for this build.</p>";
            enableSearch(loc.searchParams.get("search"));

            // enable struct collapsing
            dumpContents.querySelectorAll("ul > li").forEach(li => li.addEventListener("click", e => {
                const codeWrapper = li.querySelector(".c-w");
                codeWrapper.hidden = !codeWrapper.hidden;
            }));

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
            document.querySelector("#loading").hidden = true;
            const dumpContents = document.querySelector("#dump-contents");
            dumpContents.innerHTML = "<p>Failed to fetch dump for this build.</p>";
            console.error(error);
        });
}

function enableSearch(defaultSearch) {
    const dumpContents = document.querySelector("#dump-contents");
    const elements = Array.from(dumpContents.querySelectorAll("ul > li")).map(liElem => ({ name: liElem.querySelector("pre > code > span.c-t").textContent, li: liElem }));
    const doSearch = text => {
        let length = elements.length;
        for(let index = 0; index < length; index++) {
            let elem = elements[index];
            if (text.length === 0) {
                elem.li.hidden = false;
            } else {
                elem.li.hidden = elem.name.indexOf(text) === -1;
            }
        }
    }

    const searchInput = document.querySelector("#search");
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

init();