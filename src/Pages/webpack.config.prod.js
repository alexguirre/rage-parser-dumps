const path = require("path");

module.exports = {
    mode: "production",
    entry: {
        index: "./src/index.js",
        dump: "./src/dump.js",
        diff: "./src/diff.js",
        "theming.early": "./src/theming.early.ts",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                include: path.resolve(__dirname, "src"),
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    output: {
        path: path.resolve(__dirname, "js"),
    },
};