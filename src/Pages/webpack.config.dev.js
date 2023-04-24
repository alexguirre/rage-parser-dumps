const path = require("path");

module.exports = {
    mode: "development",
    entry: {
        index: "./src/index.ts",
        dump: "./src/dump.js",
        diff: "./src/diff.js",
        "theming.early": "./src/theming.early.ts",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                include: path.resolve(__dirname, "src"),
                exclude: /node_modules/,
                use: [{
                    loader: "ts-loader",
                    options: {
                        configFile: "tsconfig.json"
                    }
                }],
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    output: {
        path: path.resolve(__dirname, "js"),
    },
    cache: {
        type: "filesystem",
    },
    devtool: "inline-source-map",
};