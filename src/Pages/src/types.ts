
export const GameIds = ["gta4", "gta5", "gta6", "rdr2", "rdr3", "mp3", "mc4", "pong"] as const;

/**
 * Represents the supported games.
 */
export type GameId = (typeof GameIds)[number];

/**
 * Gets whether the given string is a valid {@link GameId}.
 * @param str The string to check.
 */
export function isGameId(str: string): str is GameId {
    return GameIds.includes(str as GameId);
}

/**
 * Model for the registry.json file.
 */
export type Registry = {
    [game in GameId]?: RegistryEntry[];
};

/**
 * Represents a build of a game in the registry.json file.
 */
export type RegistryEntry = {
    build: string;
    aliases: string[];
};

/**
 * Model for the *.tree.json file.
 * @see {@link DumpFormatter/Formatters/JsonTreeFormatter.cs} for the C# implementation.
 */
export type JTree = {
    structs: JTreeStructNode[],
    enums: JTreeNode[],
};

/**
 * Common properties for all nodes (structs and enums) in the {@link JTree}.
 */
export interface JTreeNode {
    name: string;
    markup: string;
    usage?: string[];

    // additional info added when calculating diffs
    diffType?: "a" | "r" | "m";
}

/**
 * Specific properties for struct nodes in the {@link JTree}.
 */
export interface JTreeStructNode extends JTreeNode {
    size: number,
    align: number,
    version?: string,
    fields?: JTreeStructField[],
    children?: JTreeStructNode[],
    xml: string,
}

/**
 * Field of a {@link JTreeStructNode}.
 */
export type JTreeStructField = {
    name: string;
    offset: number,
    size: number,
    align: number,
    type: string,
    subtype: string,
};
