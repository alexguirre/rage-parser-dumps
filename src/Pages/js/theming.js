
const THEME_SWITCHER_ID = "theme-switcher";

// theme support
function themeInit(root) {
    const themeSwitcher = root.querySelector("#" + THEME_SWITCHER_ID);
    themeSwitcher.addEventListener("click", function() {
        themeManualToggle();
    });
}

function themeManualToggle() {
    let usingDarkTheme = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", usingDarkTheme ? "dark" : "light");
}

export { THEME_SWITCHER_ID, themeInit };