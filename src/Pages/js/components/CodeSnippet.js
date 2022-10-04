
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
            newHTML = newHTML.replace(m.regex, (match, capture) => {
                return m.replacer ? m.replacer(capture) : `<span class="${m.class}">${capture}</span>`;
            });
        }
        return newHTML;
    }

    static highlightCodeMarkup = {
        "cpp": [
            {class:"hl-keyword", regex: /\$(.*?)\$/gm },
            {class:"hl-type",    regex: /\=\@(.*?)\@/gm },
            {class:"hl-type",    regex: /\@(.*?)\@/gm, replacer: capture => `<a class="type-link hl-type" href="#${capture}">${capture}</a>` },
            {class:"hl-comment", regex: /(\/\/.*$)/gm },
        ],
        "xml": [
            {class:"hl-type",    regex: /(&lt;.*?&gt;)/gm },
            {class:"hl-comment", regex: /(&lt;!--.*?--&gt;)/gm },
        ],
    };
}
customElements.define('code-snippet', CodeSnippet);
