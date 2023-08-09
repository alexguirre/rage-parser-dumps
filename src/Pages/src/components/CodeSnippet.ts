import "./SvgIcon";
import { animateButtonClick } from "../util";
import {LitElement, html} from 'lit';
import {customElement, query, property} from 'lit/decorators.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

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
@customElement("code-snippet")
export class CodeSnippet extends LitElement {
    @property()
    markup: string = "";
    @property({ attribute: "code-lang" })
    codeLang: string = "";
    @query("#code")
    private codeElement!: HTMLElement;

    override render() {
        const language = this.codeLang || "cpp";
        if (!CodeSnippet.isLanguageSupported(language)) {
            throw new Error(`Language '"${language}"' is not supported.`);
        }

        let markupEscaped = this.markup;
        if (language === "xml") {
            // Hacky workaround to prevent the XML source from being treated as HTML
            // Only done with 'xml' because 'cpp'/'cpp-nolinks' are used in the diff viewer
            // and the diff markup includes HTML span tags that should not be escaped.
            const p = document.createElement("p")
            p.innerText = this.markup;
            markupEscaped = p.innerHTML.replaceAll("<br>", "\n");
        }
        const codeHtml = unsafeHTML(CodeSnippet.markups[language].highlightCode(markupEscaped));

        return html`
            <link rel="stylesheet" href="css/style.css">
            <div class="code-snippet-contents">
                <pre><code id="code">${codeHtml}</code></pre>
                <button id="copy-btn" class="header-icon" title="Copy snippet" @click=${this.#onCopy}>
                    <svg-icon icon="copy-icon" clickable />
                </button>
            </div>
        `;
    }

    #onCopy(e: MouseEvent): void {
        const text = this.codeElement.textContent;
        if (text !== null) {
            navigator.clipboard.writeText(text);
        }

        const copyBtn = e.target;
        if (!copyBtn) {
            throw new Error("copy-btn element not found");
        }
        animateButtonClick(copyBtn as HTMLElement);
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
