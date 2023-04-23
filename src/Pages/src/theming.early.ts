
// This must be the first script loaded by a page to prevent a flash of unstyled content (especifically a white screen when using dark theme).
function themeEarlyInit() {
    themeUpdate();

    window.addEventListener("storage", function() {
        themeUpdate();
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function() {
        themeUpdate();
    });
}

function themeUpdate() {
    let theme = localStorage.getItem("theme");
    if (theme === null) {
        const systemDarkTheme = window.matchMedia("(prefers-color-scheme: dark)");
        theme = systemDarkTheme.matches ? "dark" : "light";
    }

    if (theme === "dark") {
        document.documentElement.classList.add("dark-mode");
    } else {
        document.documentElement.classList.remove("dark-mode");
    }
}

themeEarlyInit();
