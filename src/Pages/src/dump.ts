// components used in the HTML
import "./components/PageHeader";
import "./components/CodeSnippet";
import "./components/DumpDownloads";

import { gameIdToName, getDumpURL, hideElement } from "./util";
import DumpTree from "./components/DumpTree";
import {isGameId} from "./types";

async function init(): Promise<{ error?: any, errorMessage: string } | null> {
    const loc = new URL(document.location.href);
    const game = loc.searchParams.get(DumpTree.URL_PARAM_GAME);
    const build = loc.searchParams.get(DumpTree.URL_PARAM_BUILD);
    if (game === null || build === null) {
        const missing = [];
        if (game === null) { missing.push(DumpTree.URL_PARAM_GAME); }
        if (build === null) { missing.push(DumpTree.URL_PARAM_BUILD); }
        return { errorMessage: `Missing required URL query parameters: ${missing.join(", ")}.` };
    }

    if (!isGameId(game)) {
        return { errorMessage: `Invalid game ID '${game}'.` };
    }

    document.title = `${gameIdToName(game)} (build ${build}) — ${document.title}`;

    const tree = document.getElementById("dump-tree");
    if (tree === null) {
        throw new Error("dump-tree element not found");
    }

    const loading = document.getElementById("loading");
    if (loading === null) {
        throw new Error("loading element not found");
    }

    const errorMessage = `Failed to fetch dumps for ${gameIdToName(game)} build ${build}.`;
    const jsonLoc = getDumpURL(game, build, "tree.json");
    try {
        const response = await fetch(jsonLoc);
        const treeData = await response.json();
        if (treeData) {
            (tree as DumpTree).setTree(treeData, game, build, null);
            hideElement(loading, true);
        } else {
            return { errorMessage };
        }
    } catch (error) {
        return { error, errorMessage };
    }

    return null;
}

function setErrorMessage(msg: string): void {
    const elem = document.getElementById("dump-error-msg");
    if (elem === null) {
        return;
    }

    if (msg) {
        elem.textContent = msg;
        hideElement(elem, false);
    } else {
        hideElement(elem, true);
    }
}

init().then((err) => {
    if (err == null) {
        return;
    }

    const { error, errorMessage} = err;
    if (error) {
        console.error(error);
    }
    if (errorMessage) {
        setErrorMessage(errorMessage);
    }
    const tree = document.getElementById("dump-tree");
    if (tree !== null) {
        hideElement(tree, true);
    }
    const loading = document.getElementById("loading");
    if (loading !== null) {
        hideElement(loading, true);
    }
});