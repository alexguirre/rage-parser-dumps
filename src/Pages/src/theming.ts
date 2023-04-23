
export const THEME_SWITCHER_ID = "theme-switcher";

// theme support
export function themeInit(root: Document | DocumentFragment): void {
    const themeSwitcher = root.getElementById(THEME_SWITCHER_ID);
    themeSwitcher?.addEventListener("click", function() {
        themeManualToggle();
    });
}

function themeManualToggle(): void {
    const usingDarkTheme = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", usingDarkTheme ? "dark" : "light");
}
