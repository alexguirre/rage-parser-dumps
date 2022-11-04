
import { animateButtonClick } from "../util.js";

/**
 * Code box with a button to copy the snippet and basic highlighting support, through a custom markup.
 * 
 * The code markup is stored in the inner HTML of this element.
 * 
 * Supported languages: `cpp`, `xml`.
 */
export default class CodeSnippet extends HTMLElement {
    #codeElement;
    #codeChangesObserver;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        const template = document.getElementById("code-snippet-template");
        const content = template.content.cloneNode(true);

        shadow.appendChild(content);

        shadow.getElementById("copy-btn").addEventListener("click", this.onCopy.bind(this));

        this.#codeElement = this.shadowRoot.getElementById("code");

        this.#codeChangesObserver = new MutationObserver(this.onCodeChanged.bind(this));
        this.#codeChangesObserver.observe(this, { childList: true, subtree: true });
    }

    /**
     * Gets the code markup from the inner HTML, highlights it and moves it to the shadow DOM to show it to the user.
     */
    refreshCode() {
        const language = this.getAttribute("lang") || "cpp";
        this.#codeElement.innerHTML = CodeSnippet.highlightCode(language, this.innerHTML);
    }

    connectedCallback() {
        this.refreshCode();
    }

    onCodeChanged(mutationList, observer) {
        this.refreshCode();
    }

    onCopy(e) {
        navigator.clipboard.writeText(this.#codeElement.textContent);
        animateButtonClick(this.shadowRoot.getElementById("copy-btn"));
    }

    static highlightCode(language, codeHTML) {
        if (!codeHTML) {
            return codeHTML;
        }

        let newHTML = codeHTML;
        for (const m of CodeSnippet.highlightCodeMarkup[language]) {
            newHTML = newHTML.replace(m.regex, (...args) => {
                return m.replacer ? m.replacer(...args) : `<span class="${m.class}">${args[1]}</span>`;
            });
        }
        return newHTML;
    }

    static highlightCodeMarkup = {
        "cpp": [
            {class:"hl-keyword",        regex: /\$(.*?)\$/gm },
            {class:"hl-type",           regex: /\=\@(.*?)\@/gm },
            {class:"hl-type",           regex: /\@(.*?)\@/gm,                   replacer: (_m, c1) => `<a class="type-link hl-type" href="#${c1}">${c1}</a>` },
            {class:"hl-comment",        regex: /(\/\/.*$)/gm },
            {class:"hl-number",         regex: /\b([0-9]+)\b/gm },
            {class:"hl-number",         regex: /\b(0x[0-9A-Fa-f]+)\b/gm },
        ],
        "xml": [
            {class:"hl-xml-element",    regex: /(&lt;\/?)([^!].*?)(\s|&gt;)/gm, replacer: (_m, c1, c2, c3) => `${c1}<span class="hl-xml-element">${c2}</span>${c3}` },
            {class:"hl-xml-attribute",  regex: /\$(.*?)\$/gm },
            {class:"hl-string",         regex: /s(".*?")s/gm },
            {class:"hl-comment",        regex: /(&lt;!--.*?--&gt;)/gm },
        ],
    };
}
customElements.define('code-snippet', CodeSnippet);
