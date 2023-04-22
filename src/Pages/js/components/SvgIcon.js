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
        const response = await fetch(`img/${this.icon}.svg`);
        this.innerHTML = await response.text() + this.#origInnerHTML;
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
}
customElements.define('svg-icon', SvgIcon);
