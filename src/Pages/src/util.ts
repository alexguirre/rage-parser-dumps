import { GameId } from "./types";

export function gameIdToName(id: GameId): string {
    switch (id) {
        case "gta4": return "Grand Theft Auto IV";
        case "gta5": return "Grand Theft Auto V";
        case "gta6": return "Grand Theft Auto VI";
        case "rdr2": return "Red Dead Redemption";
        case "rdr3": return "Red Dead Redemption 2";
        case "mp3":  return "Max Payne 3";
        case "mc4":  return "Midnight Club: Los Angeles";
        case "pong": return "Rockstar Games presents Table Tennis";
        default:     return "Unknown game";
    }
}

export function gameIdToFormattedName(id: GameId): string {
    let name = `<span class=\"${id}-font\">`;
    switch (id) {
        case "gta4": name += "Grand Theft Auto IV"; break;
        case "gta5": name += "Grand Theft Auto <span class=\"gta5-font-detail\">V</span>"; break;
        case "gta6": name += "Grand Theft Auto <span class=\"gta6-font-detail\">VI</span> <small>(soon™)</small>"; break;
        case "rdr2": name += "Red Dead Redemption"; break;
        case "rdr3": name += "Red Dead Redemption <span class=\"rdr3-font-detail\">II</span>"; break;
        case "mp3":  name += "MAX PAYNE <span class=\"mp3-font-detail\">3</span>"; break;
        case "mc4":  name += "Midnight Club: Los Angeles"; break;
        case "pong": name += "Rockstar Games presents Table Tennis"; break;
        default:     name += "Unknown game"; break;
    }
    name += "</span>";
    return name;
}

export function getDumpURL(game: GameId, build: string, ext: string): string {
    return `dumps/${game}/b${build}.${ext}`;
}

const HIDDEN_CLASS = "hidden";

export function isElementHidden(element: HTMLElement): boolean {
    return element.classList.contains(HIDDEN_CLASS);
}

export function hideElement(element: HTMLElement, hide: boolean): void {
    if (hide) {
        element.classList.add(HIDDEN_CLASS);
    } else {
        element.classList.remove(HIDDEN_CLASS);
    }
}

let animateButtonClickTimeouts: WeakMap<Element, number> | null = null;
export function animateButtonClick(element: Element): void {
    if (animateButtonClickTimeouts === null) {
        animateButtonClickTimeouts = new WeakMap();
    }

    const existingTimeout = animateButtonClickTimeouts.get(element);
    if (existingTimeout !== undefined) {
        clearTimeout(existingTimeout);
    }

    element.classList.add("btn-clicked");
    animateButtonClickTimeouts.set(element, setTimeout(() => element.classList.remove("btn-clicked"), 200));
}
