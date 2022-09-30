function gameIdToFormattedName(id) {
    let name = `<span class=\"${id}-font\">`;
    switch (id) {
        case "gta4": name += "Grand Theft Auto IV"; break;
        case "gta5": name += "Grand Theft Auto <span class=\"gta5-font-detail\">V</span>"; break;
        case "gta6": name += "Grand Theft Auto <span class=\"gta6-font-detail\">VI</span> <small>(soon™)</small>"; break;
        case "rdr2": name += "Red Dead Redemption"; break;
        case "rdr3": name += "Red Dead Redemption <span class=\"rdr3-font-detail\">II</span>"; break;
        case "mp3":  name += "MAX PAYNE <span class=\"mp3-font-detail\">3</span>"; break;
        default:     name += "Unknown game"; break;
    }
    name += "</span>";
    return name;
}

function getDumpURL(game, build, ext) {
    return `dumps/${game}/b${build}.${ext}`;
}

export { gameIdToFormattedName, getDumpURL };