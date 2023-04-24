
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
