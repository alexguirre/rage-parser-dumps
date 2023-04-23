/**
 * A custom element that loads an SVG icon from the `img/` folder into the DOM.
 * Supported attributes:
 * - `icon`: the name of the icon to load, without the .svg extension.
 * - `clickable`: if present, the icon will be animated on hover.
 * - `size`: string with a standard size for the icon ("default", "small" or "big").
 */
export default class SvgIcon extends HTMLElement {
    // note: `clickable` and `size` attributes are handled in CSS
    icon;
    #svg;
    #origInnerHTML;

    constructor() {
        super();

        this.#origInnerHTML = this.innerHTML;
    }

    static get observedAttributes() {
        return ["icon"];
    }

    async #updateIcon() {
        this.innerHTML = await SvgIcon.#fetchIcon(this.icon) + this.#origInnerHTML;
        this.#svg = this.querySelector("svg");
        this.#svg.setAttribute("fill", "currentColor");
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch(name) {
            case 'icon':
                this.icon = newValue;
                this.#updateIcon();
                break;
        }
    }

    static async #fetchIcon(icon) {
        if (SvgIcon.#fetchIconCache.has(icon)) {
            return await SvgIcon.#fetchIconCache.get(icon);
        }
        const promise = fetch(`img/${icon}.svg`)
            .then(response => response.ok ? response.text() : Promise.reject(response))
            .catch(failure => {
                console.error(`Failed to fetch icon '${icon}'`, failure);
                return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>`;
            });
        SvgIcon.#fetchIconCache.set(icon, promise);
        return await promise;
    }
    static #fetchIconCache = new Map();
}
customElements.define('svg-icon', SvgIcon);
