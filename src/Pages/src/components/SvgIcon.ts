/**
 * A custom element that loads an SVG icon from the `img/` folder into the DOM.
 * Supported attributes:
 * - `icon`: the name of the icon to load, without the .svg extension.
 * - `clickable`: if present, the icon will be animated on hover.
 * - `size`: string with a standard size for the icon ("default", "small" or "big").
 */
export default class SvgIcon extends HTMLElement {
    // note: `clickable` and `size` attributes are handled in CSS

    readonly #origInnerHTML: string;

    constructor() {
        super();

        this.#origInnerHTML = this.innerHTML;
    }

    static get observedAttributes(): string[] {
        return ["icon"];
    }

    async #updateIcon(icon: string): Promise<void> {
        this.innerHTML = await SvgIcon.#fetchIcon(icon) + this.#origInnerHTML;
        const svg = this.querySelector("svg");
        svg?.setAttribute("fill", "currentColor");
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
        switch(name) {
            case 'icon':
                this.#updateIcon(newValue)
                    .catch(failure => console.error(`Failed to update icon '${newValue}'`, failure));
                break;
        }
    }

    static #fetchIcon(icon: string): Promise<string> {
        const existingPromise = SvgIcon.#fetchIconCache.get(icon);
        if (existingPromise !== undefined) {
            return existingPromise;
        }
        const promise = fetch(`img/${icon}.svg`)
            .then(response => response.ok ? response.text() : Promise.reject(response))
            .catch(failure => {
                console.error(`Failed to fetch icon '${icon}'`, failure);
                return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>`;
            });
        SvgIcon.#fetchIconCache.set(icon, promise);
        return promise;
    }
    static #fetchIconCache: Map<string, Promise<string>> = new Map();
}
customElements.define('svg-icon', SvgIcon);
