import { getDumpURL } from "../util.js";

export default class DumpTableRow extends HTMLTableRowElement {
    constructor(game, build, aliases) {
        super();

        const template = document.getElementById("dump-table-row-template");
        const content = template.content.cloneNode(true);

        const cols = content.querySelectorAll("td");
        cols[0].textContent = build.toString();
        if (aliases.length > 0) {
            cols[1].textContent = aliases.join(", ");
        }
        cols[2].querySelector(".dump-icon-page").href = `dump.html?game=${game}&build=${build}`;
        cols[2].querySelector(".dump-icon-html").href = getDumpURL(game, build, "html");
        cols[2].querySelector(".dump-icon-plain-text").href = getDumpURL(game, build, "txt");
        cols[2].querySelector(".dump-icon-json").href = getDumpURL(game, build, "json");
        cols[2].querySelector(".dump-icon-xsd").href = getDumpURL(game, build, "xsd");

        this.appendChild(content);
    }
}
customElements.define('dump-table-row', DumpTableRow, { extends: "tr" });
