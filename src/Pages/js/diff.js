// components used in the HTML
import "./components/PageHeader.js";
import DumpTree from "./components/DumpTree.js";

import { gameIdToName, getDumpURL, hideElement } from "./util.js"

const URL_PARAM_BUILD_A = "build-a";
const URL_PARAM_BUILD_B = "build-b";

async function init() {
    const loc = new URL(document.location);
    const game = loc.searchParams.get(DumpTree.URL_PARAM_GAME);
    const buildA = loc.searchParams.get(URL_PARAM_BUILD_A);
    const buildB = loc.searchParams.get(URL_PARAM_BUILD_B);

    const errMsg = `Failed to fetch dumps for ${gameIdToName(game)} builds ${buildA} and ${buildB}.`;
    const jsonLocA = getDumpURL(game, buildA, "tree.json");
    const jsonLocB = getDumpURL(game, buildB, "tree.json");
    try {
        const responses = await Promise.all([fetch(jsonLocA), fetch(jsonLocB)]);
        const treeA = await responses[0].json();
        const treeB = await responses[1].json();
        if (!treeA || !treeB) {
            setErrorMsg(errMsg);
        } else {
            const treeDiff = getTreeDiff(treeA, treeB);

            document.getElementById("dump-tree").setTree(treeDiff, game, `${buildA} ↔ ${buildB}`);
            hideElement(document.getElementById("loading"), true);
        }
    } catch (error) {
        console.error(error);

        setErrorMsg(errMsg);
        hideElement(document.getElementById("loading"), true);
        hideElement(document.getElementById("dump-tree"), true);
    }
}

function diff_characterMode(text1, text2) {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(text1, text2, false);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
}

function diff_lineMode(text1, text2) {
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
function diffToMarkupBasic(diffs) {
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
function diffToMarkupInline(diffs, diffsLines) {
    const LINE_INSERT = 0, LINE_DELETE = 1, INSERT = 2, DELETE = 4;
    const tagsToAdd = [];

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
    tagsToAdd.sort(x => x.start);
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
function fixLineDiffs(diffsLines) {
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

function computeDiffMarkup(markupA, markupB) {
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

function getTreeDiff(treeA, treeB) {
    let res = { structs: [], enums: [] };

    function getFlatStructsArray(tree) {
        function rec(struct, arr) {
            arr.push(struct);
            if (struct.children) {
                for (const c of struct.children) {
                    rec(c, arr);
                }
            }
        }

        let res = []
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
    const structsModified = structsA.filter(e => structsBMap.has(e.name) && structsBMap.get(e.name).markup !== e.markup);
    for (const s of structsRemoved) {
        const ss = {
            markupA: s.markup,
            markupB: "",
            diffType: "r",
            ...s,
        };
        delete ss.children;
        res.structs.push(ss);
    }
    for (const s of structsAdded) {
        const ss = {
            markupA: "",
            markupB: s.markup,
            diffType: "a",
            ...s,
        };
        delete ss.children;
        res.structs.push(ss);
    }
    for (const s of structsModified) {
        const ss = {
            markupA: s.markup,
            markupB: structsBMap.get(s.name).markup,
            diffType: "m",
            ...s,
        };
        delete ss.children;
        res.structs.push(ss);
    }

    const enumsA = new Map(treeA.enums.map(e => [e.name, e]));
    const enumsB = new Map(treeB.enums.map(e => [e.name, e]));
    const enumsRemoved = treeA.enums.filter(e => !enumsB.has(e.name));
    const enumsAdded = treeB.enums.filter(e => !enumsA.has(e.name));
    const enumsModified = treeA.enums.filter(e => enumsB.has(e.name) && enumsB.get(e.name).markup !== e.markup);
    for (const e of enumsRemoved) {
        res.enums.push({
            name: e.name,
            markupA: e.markup,
            markupB: "",
            diffType: "r",
        });
    }
    for (const e of enumsAdded) {
        res.enums.push({
            name: e.name,
            markupA: "",
            markupB: e.markup,
            diffType: "a",
        });
    }
    for (const e of enumsModified) {
        res.enums.push({
            name: e.name,
            markupA: e.markup,
            markupB: enumsB.get(e.name).markup,
            diffType: "m",
        });
    }
    for (const e of res.enums) {
        e.markup = computeDiffMarkup(e.markupA, e.markupB);
    }
    for (const s of res.structs) {
        s.markup = computeDiffMarkup(s.markupA, s.markupB);
    }
    return res;
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