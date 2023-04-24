import "./SvgIcon";
import { animateButtonClick } from "../util";

export type CodeMarkupRule = {
    class: string;
    regex: RegExp;
    replacer?: (match: string, ...groups: string[]) => string;
};

export class CodeMarkup {
    public readonly rules: CodeMarkupRule[];

    constructor(rules: CodeMarkupRule[]) {
        this.rules = rules;
    }

    highlightCode(codeHTML: string): string {
        if (!codeHTML) {
            return codeHTML;
        }

        let newHTML = codeHTML;
        for (const r of this.rules) {
            newHTML = newHTML.replace(r.regex, (...args) => {
                return r.replacer ? r.replacer(...args) : `<span class="${r.class}">${args[1]}</span>`;
            });
        }
        return newHTML;
    }

    removeMarkup(codeHTML: string): string {
        if (!codeHTML) {
            return codeHTML;
        }

        let newHTML = codeHTML;
        for (const r of this.rules) {
            newHTML = newHTML.replace(r.regex, (...args) => {
                return args[1];
            });
        }
        return newHTML;
    }
}

export type CodeSnippetLanguage = "cpp" | "cpp-nolinks" | "xml";

/**
 * Code box with a button to copy the snippet and basic highlighting support, through a custom markup.
 * 
 * The code markup is stored in the inner HTML of this element.
 * 
 * @see {@link CodeSnippetLanguage} for supported languages.
 */
export class CodeSnippet extends HTMLElement {
    static readonly html = `
        <link rel="stylesheet" href="css/style.css">
        <div class="code-snippet-contents">
            <pre><code id="code"></code></pre>
            <button id="copy-btn" class="header-icon" title="Copy snippet">
                <svg-icon icon="copy-icon" clickable />
            </button>
        </div>
    `;

    readonly #codeElement: HTMLElement;
    readonly #codeChangesObserver: MutationObserver;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = CodeSnippet.html;

        const copyBtn = shadow.getElementById("copy-btn");
        if (copyBtn === null) {
            throw new Error("copy-btn element not found");
        }
        copyBtn.addEventListener("click", this.onCopy.bind(this));

        const codeElement = shadow.getElementById("code");
        if (codeElement === null) {
            throw new Error("code element not found");
        }
        this.#codeElement = codeElement;

        this.#codeChangesObserver = new MutationObserver(this.#onCodeChanged.bind(this));
        this.#codeChangesObserver.observe(this, { childList: true, subtree: true });
    }

    /**
     * Gets the code markup from the inner HTML, highlights it and moves it to the shadow DOM to show it to the user.
     */
    refreshCode(): void {
        const language = this.getAttribute("code-lang") || "cpp";
        if (!CodeSnippet.isLanguageSupported(language)) {
            throw new Error(`Language '"${language}"' is not supported.`);
        }
        this.#codeElement.innerHTML = CodeSnippet.markups[language].highlightCode(this.innerHTML);
    }

    connectedCallback(): void {
        this.refreshCode();
    }

    #onCodeChanged(_mutations: MutationRecord[], _observer: MutationObserver): void {
        this.refreshCode();
    }

    onCopy(_e: MouseEvent): void {
        const text = this.#codeElement.textContent;
        if (text !== null) {
            navigator.clipboard.writeText(text);
        }

        const copyBtn = this.shadowRoot?.getElementById("copy-btn");
        if (!copyBtn) {
            throw new Error("copy-btn element not found");
        }
        animateButtonClick(copyBtn);
    }

    static readonly markups: { [l in CodeSnippetLanguage]: CodeMarkup } = {
        "cpp": new CodeMarkup([
            {class:"hl-keyword",        regex: /\$(.*?)\$/gm },
            {class:"hl-type",           regex: /=@(.*?)@/gm },
            {class:"hl-type",           regex: /@(.*?)@/gm,                   replacer: (_m, c1) => `<a class="type-link hl-type" href="#${c1}">${c1}</a>` },
            {class:"hl-comment",        regex: /(\/\/.*$)/gm },
            {class:"hl-number",         regex: /\b([0-9]+)\b/gm },
        ]),
        "cpp-nolinks": new CodeMarkup([
            {class:"hl-keyword",        regex: /\$(.*?)\$/gm },
            {class:"hl-type",           regex: /=@(.*?)@/gm },
            {class:"hl-type",           regex: /@(.*?)@/gm },
            {class:"hl-comment",        regex: /(\/\/.*$)/gm },
            {class:"hl-number",         regex: /\b([0-9]+)\b/gm },
        ]),
        "xml": new CodeMarkup([
            {class:"hl-xml-element",    regex: /(&lt;\/?)([^!].*?)(\s|&gt;)/gm, replacer: (_m, c1, c2, c3) => `${c1}<span class="hl-xml-element">${c2}</span>${c3}` },
            {class:"hl-xml-attribute",  regex: /\$(.*?)\$/gm },
            {class:"hl-string",         regex: /s(".*?")s/gm },
            {class:"hl-comment",        regex: /(&lt;!--.*?--&gt;)/gm },
        ]),
    };

    static isLanguageSupported(language: string): language is CodeSnippetLanguage {
        return language in CodeSnippet.markups;
    }
}
customElements.define('code-snippet', CodeSnippet);
