// components used in the HTML
import "./components/PageHeader";
import DumpTree from "./components/DumpTree";

import {gameIdToName, getDumpURL, hideElement} from "./util"
import {DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch} from "./diff_match_patch";
import {isGameId, JTree, JTreeNodeWithDiffInfo, JTreeStructNode, JTreeStructNodeWithDiffInfo} from "./types";

type Diff = { [0]: number, [1]: string }; // typed alias for diff_match_patch.Diff;

async function init(): Promise<{ error?: any, errorMessage: string } | null> {
    const loc = new URL(document.location.href);
    const game = loc.searchParams.get(DumpTree.URL_PARAM_GAME);
    const buildA = loc.searchParams.get(DumpTree.URL_PARAM_BUILD_A);
    const buildB = loc.searchParams.get(DumpTree.URL_PARAM_BUILD_B);
    if (game === null || buildA === null || buildB === null) {
        const missing = [];
        if (game === null) { missing.push(DumpTree.URL_PARAM_GAME); }
        if (buildA === null) { missing.push(DumpTree.URL_PARAM_BUILD_A); }
        if (buildB === null) { missing.push(DumpTree.URL_PARAM_BUILD_B); }
        return { errorMessage: `Missing required URL query parameters: ${missing.join(", ")}.` };
    }

    if (!isGameId(game)) {
        return { errorMessage: `Invalid game ID '${game}'.` };
    }

    document.title = `${gameIdToName(game)} (build ${buildA} ↔ ${buildB}) — ${document.title}`;

    const tree = document.getElementById("dump-tree") as DumpTree | null;
    if (tree === null) {
        throw new Error("dump-tree element not found");
    }
    tree.setGameBuild(game, buildA, buildB);

    const errorMessage = `Failed to fetch dumps for ${gameIdToName(game)} builds ${buildA} and ${buildB}.`;
    const jsonLocA = getDumpURL(game, buildA, "tree.json");
    const jsonLocB = getDumpURL(game, buildB, "tree.json");
    try {
        const [treeA, treeB] = await Promise.all([
            fetch(jsonLocA).then(r => r.json()),
            fetch(jsonLocB).then(r => r.json()),
        ]);
        if (treeA && treeB) {
            const treeDiff = getTreeDiff(treeA, treeB);

            tree.setTree(treeDiff);
        } else {
            return { errorMessage };
        }
    } catch (error) {
        return { error, errorMessage };
    }

    return null;
}

function diff_characterMode(text1: string, text2: string): Diff[] {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(text1, text2, false);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
}

function diff_lineMode(text1: string, text2: string): Diff[] {
    // from https://github.com/google/diff-match-patch/wiki/Line-or-Word-Diffs#line-mode
    const dmp = new diff_match_patch();
    const a = dmp.diff_linesToChars_(text1, text2);
    const diffs = dmp.diff_main(a.chars1, a.chars2, false);
    dmp.diff_charsToLines_(diffs, a.lineArray);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
}

/**
 * Basic diff display for debugging purposes.
 * @param diffs array of diffs.
 * @returns {string} markup with HTML to highlight the changes.
 */
// @ts-ignore
function diffToMarkupBasic(diffs: Diff[]): string {
    let markup = "";
    for (const diff of diffs) {
        const op = diff[0];    // Operation (insert, delete, equal)
        const text = diff[1];  // Text of change.
        switch (op) {
            case DIFF_INSERT:
                markup += `<ins>${text}</ins>`;
                break;
            case DIFF_DELETE:
                markup += `<del>${text}</del>`;
                break;
            case DIFF_EQUAL:
                markup += text;
                break;
        }
    }
    return markup;
}

/**
 * Displays the diff with deletions and insertions "inlined", sequentially in the same text.
 * @param diffs array of character-mode diffs.
 * @param diffsLines array of line-mode diffs.
 * @returns {string} markup with HTML to highlight the changes.
 */
function diffToMarkupInline(diffs: Diff[], diffsLines: Diff[]): string {
    const LINE_INSERT = 0, LINE_DELETE = 1, INSERT = 2, DELETE = 4;
    const tagsToAdd: { pos: number, type: number, open: boolean }[] = [];

    let originalPos = 0;
    let newPos = 0;
    let markup = "";
    for (const diff of diffsLines) {
        const op = diff[0];    // Operation (insert, delete, equal)
        const text = diff[1];  // Text of change.
        const originalStart = originalPos;
        const newStart = newPos;
        const start = markup.length;
        const end = markup.length + text.length;
        switch (op) {
            case DIFF_INSERT:
                tagsToAdd.push({ pos: start, type: LINE_INSERT, open: true });
                newPos += text.length;
                break;
            case DIFF_DELETE:
                tagsToAdd.push({ pos: start, type: LINE_DELETE, open: true });
                originalPos += text.length;
                break;
            case DIFF_EQUAL:
                originalPos += text.length;
                newPos += text.length;
                break;
        }
        const originalEnd = originalPos;
        const newEnd = newPos;
        markup += text;

        let subOriginalLength = 0, subNewLength = 0;
        for (const subDiff of diffs) { // highlight changed characters within lines
            const subOp = subDiff[0];
            const subText = subDiff[1];

            const subOriginalStart = subOriginalLength;
            const subOriginalEnd = subOriginalLength + subText.length;
            const subNewStart = subNewLength;
            const subNewEnd = subNewLength + subText.length;
            switch (subOp) {
                case DIFF_INSERT:
                    if (op === DIFF_INSERT && subNewStart >= newStart && subNewEnd <= newEnd) {
                        tagsToAdd.push({ pos: start + (subNewStart - newStart), type: INSERT, open: true });
                        tagsToAdd.push({ pos: start + (subNewEnd - newStart), type: INSERT, open: false });
                    }
                    subNewLength += subText.length;
                    break;
                case DIFF_DELETE:
                    if (op === DIFF_DELETE && subOriginalStart >= originalStart && subOriginalEnd <= originalEnd) {
                        tagsToAdd.push({ pos: start + (subOriginalStart - originalStart), type: DELETE, open: true });
                        tagsToAdd.push({ pos: start + (subOriginalEnd - originalStart), type: DELETE, open: false });
                    }
                    subOriginalLength += subText.length;
                    break;
                case DIFF_EQUAL:
                    subOriginalLength += subText.length;
                    subNewLength += subText.length;
                    break;
            }
        }

        switch (op) {
            case DIFF_INSERT:
                tagsToAdd.push({ pos: end, type: LINE_INSERT, open: false });
                break;
            case DIFF_DELETE:
                tagsToAdd.push({ pos: end, type: LINE_DELETE, open: false });
                break;
        }
    }

    let offset = 0;
    for (const p of tagsToAdd) { // insert tags in markup string
        let tag = "";
        switch (p.type) {
            case LINE_INSERT:
                tag = p.open ? '<span class="line-ins">' : '</span>';
                break;
            case LINE_DELETE:
                tag = p.open ? '<span class="line-del">' : '</span>';
                break;
            case INSERT:
                tag = p.open ? '<ins>' : '</ins>';
                break;
            case DELETE:
                tag = p.open ? '<del>' : '</del>';
                break;
        }

        markup = markup.slice(0, p.pos + offset) + tag + markup.slice(p.pos + offset);
        offset += tag.length;
    }

    return markup;
}

/**
 * In some cases {@link diff_lineMode} returns diffs with incomplete lines, not ending in new lines characters
 * (e.g. `CSpecialAbilityData` or `CVehicleDriveByAnimInfo` diff between b372 and b2802). This breaks the visual
 * output of {@link diffToMarkupInline}. This function finds DIFF_EQUALs with incomplete lines, trims them and
 * adds the incomplete line chunks to the corresponding DIFF_INSERT/DELETEs, so these form complete lines.
 */
function fixLineDiffs(diffsLines: Diff[]): void {
    for (let i = 0; i < diffsLines.length; i++) {
        const diff = diffsLines[i];
        if (diff[0] === DIFF_EQUAL) {
            const text = diff[1];
            if (text[text.length - 1] !== "\n") {
                // trim the incomplete line (`prefix`) from the DIFF_EQUAL
                const lineEnd = text.lastIndexOf("\n");
                const prefix = text.slice(lineEnd + 1);
                diff[1] = text.slice(0, lineEnd + 1);

                // find all DIFF_INSERT/DELETE until next DIFF_EQUAL
                i++;
                const firstChange = i;
                let lastChange = i;
                while (i < diffsLines.length && diffsLines[i][0] !== DIFF_EQUAL) {
                    lastChange = i;
                    i++;
                }

                if (i >= diffsLines.length) {
                    // add the line prefix to all DIFF_INSERT/DELETE found
                    for (let k = firstChange; k <= lastChange; k++) {
                        diffsLines[k][1] = prefix + diffsLines[k][1];
                    }
                    break;
                }

                // remove the rest of the line (`suffix`) from the next DIFF_EQUAL
                const nextEqualDiff = diffsLines[i];
                const nextEqualText = nextEqualDiff[1];
                const lineStart = nextEqualText.indexOf("\n");
                const suffix = nextEqualText.slice(0, lineStart + 1);
                nextEqualDiff[1] = nextEqualText.slice(lineStart + 1);

                // add the line prefix/suffix to all DIFF_INSERT/DELETE found
                for (let k = firstChange; k <= lastChange; k++) {
                    diffsLines[k][1] = prefix + diffsLines[k][1] + suffix;
                }
            }
        }
    }
}

function computeDiffMarkup(markupA: string, markupB: string): string {
    const diffs = diff_characterMode(markupA, markupB);
    const diffsLines = diff_lineMode(markupA, markupB);
    fixLineDiffs(diffsLines);
    return diffToMarkupInline(diffs, diffsLines)/* +
        "\n===========================\n" + diffToMarkupBasic(diffs) +
        "\n===========================\n" + diffToMarkupBasic(diffsLines) +
        "\n===========================\n" + JSON.stringify(diffs, null, 2) +
        "\n===========================\n" + JSON.stringify(diffsLines, null, 2) +
        "\n===========================\n" + markupA +
        "\n===========================\n" + markupB*/;
}

function getTreeDiff(treeA: JTree, treeB: JTree): JTree {
    let res: JTree = { structs: [], enums: [] };

    function getFlatStructsArray(tree: JTree): JTreeStructNode[] {
        function rec(struct: JTreeStructNode, arr: JTreeStructNode[]): void {
            arr.push(struct);
            if (struct.children) {
                for (const c of struct.children) {
                    rec(c, arr);
                }
            }
        }

        let res: JTreeStructNode[] = []
        for (const s of tree.structs) {
            rec(s, res);
        }
        return res;
    }

    const structsA = getFlatStructsArray(treeA);
    const structsB = getFlatStructsArray(treeB);
    const structsAMap = new Map(structsA.map(s => [s.name, s]));
    const structsBMap = new Map(structsB.map(s => [s.name, s]));
    const structsRemoved = structsA.filter(e => !structsBMap.has(e.name));
    const structsAdded = structsB.filter(e => !structsAMap.has(e.name));
    const structsModified = structsA.filter(e => structsBMap.has(e.name) && structsBMap.get(e.name)!.markup !== e.markup);
    for (const s of structsRemoved) {
        const a = s.markup;
        const b = "";
        const ss: JTreeStructNodeWithDiffInfo = {
            ...s,
            markup: computeDiffMarkup(a, b),
            diffType: "r",
        };
        delete ss.children;
        res.structs.push(ss);
    }
    for (const s of structsAdded) {
        const a = "";
        const b = s.markup;
        const ss: JTreeStructNodeWithDiffInfo = {
            ...s,
            markup: computeDiffMarkup(a, b),
            diffType: "a",
        };
        delete ss.children;
        res.structs.push(ss);
    }
    for (const s of structsModified) {
        const a = s.markup;
        const b = structsBMap.get(s.name)?.markup || "";
        const ss: JTreeStructNodeWithDiffInfo = {
            ...s,
            markup: computeDiffMarkup(a, b),
            diffType: "m",
        };
        delete ss.children;
        res.structs.push(ss);
    }

    const enumsA = new Map(treeA.enums.map(e => [e.name, e]));
    const enumsB = new Map(treeB.enums.map(e => [e.name, e]));
    const enumsRemoved = treeA.enums.filter(e => !enumsB.has(e.name));
    const enumsAdded = treeB.enums.filter(e => !enumsA.has(e.name));
    const enumsModified = treeA.enums.filter(e => enumsB.has(e.name) && enumsB.get(e.name)!.markup !== e.markup);
    for (const e of enumsRemoved) {
        const a = e.markup;
        const b = "";
        const ee: JTreeNodeWithDiffInfo = {
            name: e.name,
            hash: e.hash,
            markup: computeDiffMarkup(a, b),
            diffType: "r",
        };
        res.enums.push(ee);
    }
    for (const e of enumsAdded) {
        const a = "";
        const b = e.markup;
        const ee: JTreeNodeWithDiffInfo = {
            name: e.name,
            hash: e.hash,
            markup: computeDiffMarkup(a, b),
            diffType: "a",
        };
        res.enums.push(ee);
    }
    for (const e of enumsModified) {
        const a = e.markup;
        const b = enumsB.get(e.name)?.markup || "";
        const ee: JTreeNodeWithDiffInfo = {
            name: e.name,
            hash: e.hash,
            markup: computeDiffMarkup(a, b),
            diffType: "m",
        };
        res.enums.push(ee);
    }
    return res;
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

    const tree = document.getElementById("dump-tree") as DumpTree | null;
    if (tree !== null) {
        tree.setTree(null);
    }
});