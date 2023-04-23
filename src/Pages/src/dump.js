// components used in the HTML
import "./components/PageHeader";
import "./components/CodeSnippet";
import "./components/DumpDownloads";

import { gameIdToName, getDumpURL, hideElement } from "./util";
import DumpTree from "./components/DumpTree";

async function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get(DumpTree.URL_PARAM_GAME);
    const build = loc.searchParams.get(DumpTree.URL_PARAM_BUILD);

    document.title = `${gameIdToName(game)} (build ${build}) — ${document.title}`;

    const errMsg = `Failed to fetch dumps for ${gameIdToName(game)} build ${build}.`;
    const jsonLoc = getDumpURL(game, build, "tree.json");
    try {
        const response = await fetch(jsonLoc);
        const tree = await response.json();
        if (!tree) {
            setErrorMsg(errMsg);
        } else {
            document.getElementById("dump-tree").setTree(tree, game, build, null);
            hideElement(document.getElementById("loading"), true);
        }
    } catch (error) {
        console.error(error);

        setErrorMsg(errMsg);
        hideElement(document.getElementById("loading"), true);
        hideElement(document.getElementById("dump-tree"), true);
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