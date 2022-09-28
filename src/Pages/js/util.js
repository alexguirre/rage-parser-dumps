function gameIdToName(id) {
    let name = "Unknown game";
    switch (id) {
        case "gta5": name = "Grand Theft Auto V"; break;
        case "rdr3": name = "Red Dead Redemption 2"; break;
    }
    return name;
}

function getDumpURL(game, build, ext) {
    return `dumps/${game}/b${build}.${ext}`;
}

export { gameIdToName, getDumpURL };